import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import { existsSync, readFileSync, realpathSync, rmdirSync, rmSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { setTimeout as sleepTimer } from "timers/promises";
import { orchestratorDir } from "../paths.js";
import { buildContextBundle, buildResumePrompt } from "./bundle.js";
import { releaseLease } from "./lease.js";
import { eligibleProviders } from "./providers/eligible.js";
import {
  PROVIDERS,
  type FinishResult,
  type ProviderAdapter,
  type SpawnContext,
  type StreamAcc,
} from "./providers/index.js";
import { decideNext, type Decision } from "./quota.js";
import {
  claimAttempt,
  listAttempts,
  makeRunnerPrivateDir,
  readBundle,
  readDispatch,
  recordAttemptRunner,
  recordAttemptSession,
  recordPause,
  recordResult,
  recordSession,
  runnerPrivateDir,
  writeBundle,
  type AttemptRecord,
  type DispatchRecord,
  type ResultOutcome,
  type TaskRecord,
} from "./store.js";

/**
 * Per-task runner (`cf task _run <id>`). Spawns the worker in its own
 * process group (so cancel reaches its children too), parses its JSON event stream in memory only and
 * persists just session.json and result.json. Worker stdout/stderr never
 * touch disk.
 *
 * Tasks with runs/<id>/dispatch.json (C2a) run as attempts: on a usage
 * limit the runner records a pause, then switches provider or waits for the
 * reset in-process and resumes, until the task ends. Tasks without it run
 * once (C1).
 */

/** result.json error = cause (head) + stderr tail; recordResult caps at 4 KB. */
const ERROR_HEAD = 2000;
const STDERR_TAIL = 2048;
const KILL_GRACE_MS = 5000;
/** Wait for buffered stdout after exit, in case a grandchild holds the pipe. */
const DRAIN_MS = 2000;
/** While paused, re-check the clock, cancel.json and signals this often. */
const WAIT_POLL_MS = 30_000;

const delay = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms).unref());

/** Test seams; each default is the real runtime. */
export interface RunnerOptions {
  spawn?: typeof spawn;
  /** Epoch seconds (the unit of quota.ts). */
  now?: () => number;
  /** Resolve after `ms`, or early once `signal` aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

type Deps = Required<RunnerOptions>;

/** Ref'd on purpose: a paused runner has nothing else keeping it alive. */
const defaultSleep = (ms: number, signal: AbortSignal) =>
  sleepTimer(ms, undefined, { signal }).catch(() => {});

/** Signal the worker's whole process group; a gone group is fine. */
function killGroup(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
      console.error(`runner: could not ${sig} worker group: ${String(err)}`);
    }
  }
}

/** sha256 (hex) of `bytes`. */
export function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * task.json as the parent dispatched it: its bytes still hash to
 * CF_TASK_DIGEST and the cwd the parent set is the task's checkout.
 * Parses the same bytes it hashed (no re-read). Undefined otherwise.
 */
function readDispatchedTask(id: string): TaskRecord | undefined {
  try {
    const expected = process.env.CF_TASK_DIGEST;
    const bytes = readFileSync(
      join(orchestratorDir(), "tasks", id, "task.json"),
    );
    if (!expected || digest(bytes) !== expected) return undefined;
    const task = JSON.parse(bytes.toString("utf-8")) as TaskRecord;
    if (task.id !== id || realpathSync(process.cwd()) !== task.checkout) {
      return undefined;
    }
    return task;
  } catch {
    return undefined;
  }
}

/**
 * SIGTERM/SIGINT for the whole run: abort `signal` (wakes a wait) and kill
 * the current worker's group, SIGKILL after KILL_GRACE_MS.
 */
interface Trap {
  signal: AbortSignal;
  /** The running worker, 0 between workers. */
  workerPid: number;
  killTimer?: NodeJS.Timeout;
  dispose(): void;
}

function trapSignals(): Trap {
  const abort = new AbortController();
  const onSignal = () => {
    abort.abort();
    const pid = trap.workerPid;
    if (trap.killTimer || pid <= 1) return;
    killGroup(pid, "SIGTERM");
    // No alive() check: the group can outlive the worker itself.
    trap.killTimer = setTimeout(() => killGroup(pid, "SIGKILL"), KILL_GRACE_MS);
  };
  const trap: Trap = {
    signal: abort.signal,
    workerPid: 0,
    dispose() {
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
    },
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  return trap;
}

interface WorkerRun {
  exitCode: number | null;
  fin: FinishResult;
  spawnError?: string;
  stderrTail: string;
}

/** Spawn one worker, parse its stream until it exits and drains. */
async function runWorker(
  adapter: ProviderAdapter,
  task: TaskRecord,
  ctx: SpawnContext,
  deps: Deps,
  trap: Trap,
  onSession: (session: { sessionId: string; transcriptPath?: string }) => void,
): Promise<WorkerRun> {
  if (trap.signal.aborted) {
    const acc: StreamAcc = {};
    return {
      exitCode: null,
      fin: adapter.finish(acc, null, ctx),
      spawnError: "runner was stopped before the worker started",
      stderrTail: "",
    };
  }
  const spec = adapter.buildSpawn(task, ctx);
  const env = { ...spec.env };
  delete env.CLAUDECODE; // avoid Claude's nested-session refusal
  delete env.CF_TASK_DIGEST;
  delete env.CF_TASK_CHECKOUT;
  const child = deps.spawn(spec.cmd, spec.args, {
    cwd: task.checkout,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true, // own process group: cancel signals -pid
  });
  trap.workerPid = child.pid ?? 0;

  try {
    let spawnError: string | undefined;
    const exited = new Promise<number | null>((resolve) => {
      child.once("error", (err) => {
        spawnError = err.message;
        resolve(null);
      });
      child.once("exit", (code) => resolve(code));
    });

    child.stdin.on("error", () => {}); // EPIPE when the worker exits early
    child.stdin.end(spec.stdin);

    const acc: StreamAcc = {};
    let sessionRecorded = false;
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      adapter.parseLine(line, acc);
      if (sessionRecorded || !acc.sessionId) return;
      const session = adapter.session(acc, ctx);
      if (!session) return;
      sessionRecorded = true;
      try {
        onSession(session);
      } catch (err) {
        console.error(`runner: could not record session: ${String(err)}`);
      }
    });
    const stdoutClosed = new Promise<void>((r) => rl.once("close", r));

    let stderrTail = "";
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL);
    });

    const exitCode = await exited;
    await Promise.race([stdoutClosed, delay(DRAIN_MS)]);
    rl.close();
    child.stdout.destroy();
    child.stderr.destroy();

    const fin = adapter.finish(acc, exitCode, ctx);
    return { exitCode, fin, spawnError, stderrTail };
  } finally {
    if (trap.killTimer) {
      // Signalled: kill what is left of the group before anything else.
      clearTimeout(trap.killTimer);
      trap.killTimer = undefined;
      killGroup(trap.workerPid, "SIGKILL");
    }
    trap.workerPid = 0;
  }
}

/** Root result.json data for a finished worker run. */
function resultOf(run: WorkerRun, outcome: ResultOutcome) {
  const error =
    outcome !== "failed"
      ? undefined
      : [
          (run.spawnError ?? run.fin.error)?.slice(0, ERROR_HEAD),
          run.stderrTail.trim(),
        ]
          .filter(Boolean)
          .join("\n--- stderr ---\n") || undefined;
  return {
    exitCode: run.exitCode,
    outcome,
    ...(run.fin.lastMessage !== undefined && {
      lastMessage: run.fin.lastMessage,
    }),
    ...(error !== undefined && { error }),
  };
}

export async function runTask(
  id: string,
  options: RunnerOptions = {},
): Promise<void> {
  const task = readDispatchedTask(id);
  const dispatch = task && readDispatch(id);
  // C2a: the dispatch record must name the same task.json bytes.
  if (
    !task ||
    (dispatch && dispatch.taskDigest !== process.env.CF_TASK_DIGEST)
  ) {
    recordResult(id, {
      exitCode: null,
      outcome: "failed",
      error: "task.json changed after dispatch; refusing to run",
    });
    // Checkout from the trusted parent; releaseLease checks the holder id.
    const checkout = process.env.CF_TASK_CHECKOUT;
    if (checkout) releaseLease(checkout, id);
    return;
  }
  const deps: Deps = {
    spawn: options.spawn ?? spawn,
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
    sleep: options.sleep ?? defaultSleep,
  };
  if (dispatch) await runAttempts(task, dispatch, deps);
  else await runOnce(task, deps);
}

function baseContext(task: TaskRecord, privateDir: string): SpawnContext {
  return {
    orchDir: orchestratorDir(),
    taskDir: join(orchestratorDir(), "tasks", task.id),
    privateDir,
    checkout: task.checkout,
    cfInvocation: [process.execPath, ...process.execArgv, process.argv[1]],
    sessionUuid: randomUUID(),
  };
}

/** C1: one worker, root runner.json/session.json/result.json only. */
async function runOnce(task: TaskRecord, deps: Deps): Promise<void> {
  const id = task.id;
  const adapter = PROVIDERS[task.provider];
  const privateDir = runnerPrivateDir(id);
  const ctx = baseContext(task, privateDir);
  const cancelled = () => existsSync(join(ctx.taskDir, "cancel.json"));
  const trap = trapSignals();
  try {
    if (cancelled()) {
      recordResult(id, { exitCode: null, outcome: "cancelled" });
      return;
    }
    try {
      makeRunnerPrivateDir(id);
    } catch (err) {
      const error = `could not create runner dir: ${(err as Error).message}`;
      recordResult(id, { exitCode: null, outcome: "failed", error });
      return;
    }
    const run = await runWorker(adapter, task, ctx, deps, trap, (session) =>
      recordSession(id, session),
    );
    const outcome = cancelled()
      ? "cancelled"
      : run.spawnError
        ? "failed"
        : run.fin.outcome;
    recordResult(id, resultOf(run, outcome));
  } finally {
    trap.dispose();
    if (!task.readOnly) releaseLease(task.checkout, id);
    rmSync(privateDir, { recursive: true, force: true });
  }
}

type Claim = Omit<AttemptRecord, "schemaVersion" | "createdAt">;

/** Create-once <n>/runner.json for this process; false when another runner owns n. */
function ownAttempt(id: string, n: number): boolean {
  try {
    return recordAttemptRunner(id, n, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`runner: could not own attempt ${n}: ${String(err)}`);
    return false;
  }
}

/**
 * Sleep until `at` (epoch seconds) by the wall clock, polling so a laptop
 * sleep or clock change is caught. Cancel wins over a signal.
 */
async function waitUntil(
  at: number,
  cancelled: () => boolean,
  trap: Trap,
  deps: Deps,
): Promise<"due" | "cancelled" | "stopped"> {
  for (;;) {
    if (cancelled()) return "cancelled";
    if (trap.signal.aborted) return "stopped";
    const left = at - deps.now();
    if (left <= 0) return "due";
    await deps.sleep(Math.min(left * 1000, WAIT_POLL_MS), trap.signal);
  }
}

/**
 * C2a: run the latest claimed attempt, then keep going (pause, switch or
 * wait + resume) until the task ends. The lease and runner/<id> go only when
 * root result.json is written; losing a claim or a SIGTERM while paused exits
 * leaving both (the pause stays for the supervisor tick).
 */
async function runAttempts(
  task: TaskRecord,
  dispatch: DispatchRecord,
  deps: Deps,
): Promise<void> {
  const id = task.id;
  const taskDir = join(orchestratorDir(), "tasks", id);
  const cancelled = () => existsSync(join(taskDir, "cancel.json"));
  const end = (data: Parameters<typeof recordResult>[1]) => {
    try {
      recordResult(id, data);
    } finally {
      if (!task.readOnly) releaseLease(task.checkout, id);
      try {
        rmdirSync(runnerPrivateDir(id)); // empty by now; never follows a symlink
      } catch {
        // already gone, or left by a crashed attempt
      }
    }
  };

  const latest = listAttempts(id).at(-1)?.attempt;
  if (!latest) {
    end({ exitCode: null, outcome: "failed", error: "no claimed attempt" });
    return;
  }
  // First: the lease goes stale when <n>/runner.json is missing for long.
  if (!ownAttempt(id, latest.n)) return;

  let attempt: Claim = latest;
  let resumeFallbackUsed = false;
  const trap = trapSignals();
  try {
    for (;;) {
      const n = attempt.n;
      if (cancelled()) return end({ exitCode: null, outcome: "cancelled" });
      const adapter = Object.hasOwn(PROVIDERS, attempt.provider)
        ? PROVIDERS[attempt.provider]
        : undefined;
      const prompt = attempt.bundle
        ? readBundle(id, n)
        : attempt.kind === "resume"
          ? buildResumePrompt({ taskId: id })
          : task.prompt;
      const resumeId = attempt.resumeSessionId;
      if (!adapter || prompt === undefined) {
        const error = `attempt ${n}: ${adapter ? "context bundle missing" : "unknown provider"}`;
        return end({ exitCode: null, outcome: "failed", error });
      }
      if (attempt.kind === "resume" && !resumeId) {
        const error = `attempt ${n}: resume without a session id`;
        return end({ exitCode: null, outcome: "failed", error });
      }

      let privateDir: string;
      try {
        privateDir = makeRunnerPrivateDir(id, n);
      } catch (err) {
        const error = `could not create runner dir: ${(err as Error).message}`;
        return end({ exitCode: null, outcome: "failed", error });
      }
      const ctx: SpawnContext = {
        ...baseContext(task, privateDir),
        ...(attempt.kind === "resume" &&
          resumeId && { resume: { sessionId: resumeId } }),
      };
      // In-memory copy only: task.json (and its digest) never change.
      const attemptTask = { ...task, provider: attempt.provider, prompt };
      let run: WorkerRun;
      try {
        run = await runWorker(adapter, attemptTask, ctx, deps, trap, (s) => {
          recordAttemptSession(id, n, s);
          if (n === 1) recordSession(id, s); // root session.json: C1 compat
        });
      } finally {
        // After finish(): codex reads its last message from privateDir.
        rmSync(privateDir, { recursive: true, force: true });
      }

      if (cancelled()) return end(resultOf(run, "cancelled"));
      if (run.spawnError) return end(resultOf(run, "failed"));
      const done = existsSync(join(taskDir, "done.json"));
      let next: Exclude<Decision, { kind: "fail" }>;
      if (run.fin.quota && !done) {
        recordPause(id, n, {
          provider: attempt.provider,
          resetsAt: run.fin.quota.resetsAt,
          source: run.fin.quota.source,
          ...(run.fin.lastMessage !== undefined && {
            lastMessage: run.fin.lastMessage,
          }),
          ...(run.fin.error !== undefined && { error: run.fin.error }),
        });
        const decision = decideNext({
          policy: dispatch.policy,
          attempts: listAttempts(id),
          now: deps.now(),
          eligible: eligibleProviders(task.checkout),
        });
        if (decision.kind === "fail") {
          return end({ ...resultOf(run, "failed"), error: decision.reason });
        }
        next = decision;
      } else if (
        // The session to resume is gone (never reported back): start fresh
        // on the same provider with a bundle, once.
        attempt.kind === "resume" &&
        run.fin.outcome === "failed" &&
        !run.fin.sessionId &&
        !done &&
        !resumeFallbackUsed
      ) {
        resumeFallbackUsed = true;
        next = { kind: "fresh", provider: attempt.provider, at: deps.now() };
      } else {
        return end(resultOf(run, run.fin.outcome));
      }

      const waited = await waitUntil(next.at, cancelled, trap, deps);
      if (waited === "cancelled") {
        return end({ exitCode: null, outcome: "cancelled" });
      }
      if (waited === "stopped") return; // pause and lease stay for the tick

      const bundle =
        next.kind === "resume"
          ? undefined
          : buildContextBundle({
              task, // the original prompt, never a previous bundle
              taskDir,
              lastMessage: listAttempts(id)
                .filter((e) => e.pause)
                .at(-1)?.pause?.lastMessage,
            });
      const claim: Claim =
        next.kind === "resume"
          ? {
              n: n + 1,
              provider: next.provider,
              kind: "resume",
              resumeSessionId: next.sessionId,
            }
          : { n: n + 1, provider: next.provider, kind: next.kind, bundle: true };
      // Lost to the tick (or another runner): it owns the task now.
      if (!claimAttempt(id, claim) || !ownAttempt(id, claim.n)) return;
      if (bundle !== undefined) writeBundle(id, claim.n, bundle);
      attempt = claim;
    }
  } catch (err) {
    end({
      exitCode: null,
      outcome: "failed",
      error: `runner error: ${String(err)}`.slice(0, ERROR_HEAD),
    });
  } finally {
    trap.dispose();
  }
}
