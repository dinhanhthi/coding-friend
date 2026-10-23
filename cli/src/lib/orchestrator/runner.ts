import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import {
  existsSync,
  lstatSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { isAbsolute, join, relative, resolve, sep } from "path";
import { createInterface } from "readline";
import { setTimeout as sleepTimer } from "timers/promises";
import { orchestratorDir } from "../paths.js";
import { buildContextBundle, buildResumePrompt } from "./bundle.js";
import { releaseLease } from "./lease.js";
import { eligibleProviders } from "./providers/eligible.js";
import {
  PROVIDERS,
  type ExecFn,
  type FinishResult,
  type ProviderAdapter,
  type ProviderRequest,
  type SpawnContext,
  type SpawnSpec,
  type StreamAcc,
} from "./providers/index.js";
import { decideNext, type Decision } from "./quota.js";
import {
  assertRealDir,
  claimAttempt,
  listAttempts,
  makeRunnerPrivateDir,
  makeWorkspaceDir,
  mkdirReal,
  readBundle,
  readDispatch,
  readRegularFile,
  recordAttemptRunner,
  recordAttemptSession,
  recordPause,
  recordResult,
  recordSession,
  runnerPrivateDir,
  workspaceDir,
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
/** Output kept from one `prepare()` exec call, per stream. */
const EXEC_MAX_OUTPUT = 1024 * 1024;
/** Upper bound for an adapter-supplied `prepare()` exec timeout. */
const EXEC_MAX_TIMEOUT_MS = 10 * 60_000;
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
 * Whether the checkout is a git repo, as recorded at dispatch (never probed
 * later: a worker can create `.git`). A record without the flag → false.
 */
export function checkoutIsGitRepo(dispatch: DispatchRecord): boolean {
  return dispatch.isGitRepo === true;
}

/**
 * task.json as the parent dispatched it: its bytes still hash to
 * CF_TASK_DIGEST and the cwd the parent set is the task's checkout.
 * Parses the same bytes it hashed (no re-read). Undefined otherwise.
 */
function readDispatchedTask(id: string): TaskRecord | undefined {
  try {
    const expected = process.env.CF_TASK_DIGEST;
    const bytes = readRegularFile(
      join(orchestratorDir(), "tasks", id, "task.json"),
    );
    if (!bytes || !expected || digest(bytes) !== expected) return undefined;
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
  /** Terminal: the attempt fails, no resume-gone fallback. */
  spawnError?: string;
  /** The adapter set `acc.abort`: the worker was killed (terminal too). */
  aborted?: boolean;
  stderrTail: string;
}

/** Runner env rules shared by the worker and `prepare()` exec calls. */
function filterEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  delete out.CLAUDECODE; // avoid Claude's nested-session refusal
  delete out.CF_TASK_DIGEST;
  delete out.CF_TASK_CHECKOUT;
  return out;
}

/**
 * `prepare()`'s exec: no shell, own process group killed on timeout, cwd
 * default a neutral temp dir. Env: the runner's env with `opts.env` added or
 * overriding; filterEnv applies after the merge. Settles on `"exit"`
 * plus a short drain, never waits for `"close"` (a grandchild that left the
 * group can hold the pipes open): at most timeout + DRAIN_MS.
 */
function makeExec(trap: Trap): ExecFn {
  return (cmd, args, opts) =>
    new Promise((resolve, reject) => {
      if (trap.signal.aborted) {
        reject(new Error(`${cmd}: runner was stopped`));
        return;
      }
      const timeoutMs = Math.min(
        Math.max(1, Math.floor(opts.timeoutMs) || 1),
        EXEC_MAX_TIMEOUT_MS,
      );
      const child = spawn(cmd, args, {
        cwd: opts.cwd ?? tmpdir(),
        env: filterEnv({ ...process.env, ...opts.env }),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      const pid = child.pid ?? 0;
      trap.workerPid = pid; // a stop signal reaches it too
      const out = { stdout: "", stderr: "" };
      for (const key of ["stdout", "stderr"] as const) {
        child[key].setEncoding("utf-8");
        child[key].on("data", (chunk: string) => {
          if (out[key].length < EXEC_MAX_OUTPUT) out[key] += chunk;
        });
      }
      const closed = new Promise<void>((r) => child.once("close", () => r()));
      let timedOut = false;
      let graceTimer: NodeJS.Timeout | undefined;
      let settled = false;
      const finish = (result: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(graceTimer);
        if (trap.workerPid === pid) trap.workerPid = 0;
        child.stdout.destroy();
        child.stderr.destroy();
        result();
      };
      const timeoutError = () =>
        new Error(`${cmd} timed out after ${timeoutMs} ms`);
      const timer = setTimeout(() => {
        timedOut = true;
        if (pid > 1) killGroup(pid, "SIGKILL");
        // Settle even if "exit" never comes.
        graceTimer = setTimeout(
          () => finish(() => reject(timeoutError())),
          DRAIN_MS,
        );
      }, timeoutMs);
      child.once("error", (err) => finish(() => reject(err)));
      child.once("exit", (code) => {
        // The deadline covers the run until exit; the drain is bounded anyway.
        if (!timedOut) clearTimeout(timer);
        void Promise.race([closed, delay(DRAIN_MS)]).then(() =>
          finish(() =>
            timedOut
              ? reject(timeoutError())
              : resolve({ code: code ?? -1, ...out }),
          ),
        );
      });
    });
}

/**
 * Remove `path` (recursive) when it lies inside the store. Every dir between
 * the store and `path` must be a real dir, checked top-down (lstat follows a
 * symlinked ancestor): never delete through a symlinked store subdir. A
 * missing one means nothing to remove.
 */
function removeStorePath(orchDir: string, path: string): void {
  const root = resolve(orchDir);
  const target = resolve(path);
  if (!target.startsWith(root + sep)) {
    throw new Error(`refusing to remove ${path}: outside the store`);
  }
  let dir = root;
  for (const part of relative(root, target).split(sep).slice(0, -1)) {
    dir = join(dir, part);
    try {
      lstatSync(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    assertRealDir(dir);
  }
  rmSync(target, { recursive: true, force: true });
}

/**
 * Task-level paths to remove once the task ends: its workspace plus the
 * `cleanupPaths` of every provider that ran an attempt (from attempt.json:
 * after a switch the first provider's paths are left too) or, for a C1
 * task, of its provider.
 */
export function taskCleanupPaths(task: TaskRecord, orchDir: string): string[] {
  const providers = new Set<string>([
    task.provider,
    ...listAttempts(task.id).map((e) => e.attempt.provider),
  ]);
  const paths = [workspaceDir(orchDir, task.id)];
  for (const p of providers) {
    if (!Object.hasOwn(PROVIDERS, p)) continue;
    paths.push(
      ...(PROVIDERS[p as keyof typeof PROVIDERS].cleanupPaths?.(task) ?? []),
    );
  }
  return paths;
}

/**
 * Remove `paths` (see removeStorePath); errors are logged under `label`
 * (the caller: runner or supervisor), never thrown.
 */
export function removeStorePaths(
  orchDir: string,
  paths: string[],
  label: string,
): void {
  for (const path of paths) {
    try {
      removeStorePath(orchDir, path);
    } catch (err) {
      console.error(`${label}: could not remove ${path}: ${String(err)}`);
    }
  }
}

/** Remove the task's workspace and cleanupPaths (never throws). */
function removeTaskPaths(task: TaskRecord): void {
  const orchDir = orchestratorDir();
  let paths: string[];
  try {
    paths = taskCleanupPaths(task, orchDir);
  } catch (err) {
    console.error(`runner: could not list task paths: ${String(err)}`);
    return;
  }
  removeStorePaths(orchDir, paths, "runner");
}

/**
 * Wipe `workspaces/<id>` and, when the adapter returns files, rebuild it
 * from them (dirs 0700, files 0600 created exclusively). Never read back.
 * Throws on any failure: the attempt then fails without a spawn.
 */
function buildWorkspace(
  adapter: ProviderAdapter,
  task: TaskRecord,
  ctx: SpawnContext,
): void {
  if (!adapter.workspaceFiles) return;
  removeStorePath(ctx.orchDir, workspaceDir(ctx.orchDir, task.id));
  const files = adapter.workspaceFiles(task, ctx, task.prompt)?.files;
  if (!files) return;
  const ws = makeWorkspaceDir(ctx.orchDir, task.id);
  for (const [rel, content] of Object.entries(files)) {
    const parts = rel.split("/");
    if (isAbsolute(rel) || parts.some((p) => ["", ".", ".."].includes(p))) {
      throw new Error(`invalid workspace file path ${JSON.stringify(rel)}`);
    }
    let dir = ws;
    for (const part of parts.slice(0, -1)) {
      dir = join(dir, part);
      mkdirReal(dir);
    }
    writeFileSync(join(ws, ...parts), content, { mode: 0o600, flag: "wx" });
  }
}

/** The runner was signalled before a worker started. */
function stoppedRun(adapter: ProviderAdapter, ctx: SpawnContext): WorkerRun {
  return {
    exitCode: null,
    fin: adapter.finish({}, null, ctx),
    spawnError: "runner was stopped before the worker started",
    stderrTail: "",
  };
}

/**
 * Spawn one worker, parse its stream until it exits and drains. Per attempt:
 * `preflight` → `workspaceFiles` (the runner rebuilds the workspace) →
 * `prepare` → `buildSpawn`. A preflight refusal is terminal (`spawnError`).
 * A failing workspace build, or a throwing `prepare` or `buildSpawn`, fails
 * the attempt without a spawn and without a session id,
 * so a resume attempt falls back to fresh (resume-gone).
 */
async function runWorker(
  adapter: ProviderAdapter,
  task: TaskRecord,
  ctx: SpawnContext,
  req: ProviderRequest,
  deps: Deps,
  trap: Trap,
  onSession: (session: { sessionId: string; transcriptPath?: string }) => void,
): Promise<WorkerRun> {
  if (trap.signal.aborted) return stoppedRun(adapter, ctx);
  try {
    const refused = adapter.preflight?.(req);
    if (refused) {
      return {
        exitCode: null,
        fin: { outcome: "failed", error: refused.message },
        spawnError: refused.message,
        stderrTail: "",
      };
    }
    let c = ctx;
    let spec: SpawnSpec | undefined;
    let error = "";
    try {
      buildWorkspace(adapter, task, ctx);
      if (adapter.prepare) {
        const prepared = await adapter.prepare(task, ctx, makeExec(trap));
        if (prepared.sessionId !== undefined) {
          c = { ...ctx, preparedSessionId: prepared.sessionId };
        }
      }
      spec = adapter.buildSpawn(task, c);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    // prepare() awaited: a stop signal may have come in meanwhile.
    if (trap.signal.aborted) return stoppedRun(adapter, c);
    if (!spec) {
      return {
        exitCode: null,
        fin: { outcome: "failed", error: error.slice(0, ERROR_HEAD) },
        stderrTail: "",
      };
    }
    // Recorded only once the stream confirms the prompt was received.
    const pendingId = spec.sessionId ?? c.preparedSessionId;
    const child = deps.spawn(spec.cmd, spec.args, {
      cwd: spec.cwd ?? task.checkout,
      env: filterEnv(spec.env),
      stdio: ["pipe", "pipe", "pipe"],
      detached: true, // own process group: cancel signals -pid
    });
    const workerPid = child.pid ?? 0;
    trap.workerPid = workerPid;

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
    let killed = false;
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      adapter.parseLine(line, acc, c, task);
      if (acc.abort && !killed) {
        killed = true;
        if (workerPid > 1) killGroup(workerPid, "SIGKILL");
      }
      if (sessionRecorded) return;
      const session =
        (acc.sessionId ? adapter.session(acc, c) : undefined) ??
        (acc.accepted && pendingId ? { sessionId: pendingId } : undefined);
      if (!session) return;
      try {
        onSession(session);
        // Only once recorded: a rejected id leaves room for a later valid one.
        sessionRecorded = true;
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

    let fin = adapter.finish(acc, exitCode, c, stderrTail);
    if (acc.abort) {
      // A safety violation, never a quota pause.
      fin = {
        ...fin,
        outcome: "failed",
        error: acc.abort.slice(0, ERROR_HEAD),
      };
      delete fin.quota;
    }
    return {
      exitCode,
      fin,
      spawnError,
      ...(acc.abort !== undefined && { aborted: true }),
      stderrTail,
    };
  } finally {
    if (trap.killTimer) {
      // Signalled: kill what is left of the group before anything else.
      clearTimeout(trap.killTimer);
      trap.killTimer = undefined;
      if (trap.workerPid > 1) killGroup(trap.workerPid, "SIGKILL");
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
  const adapter = Object.hasOwn(PROVIDERS, task.provider)
    ? PROVIDERS[task.provider]
    : undefined;
  const privateDir = runnerPrivateDir(id);
  const ctx = baseContext(task, privateDir);
  const cancelled = () => existsSync(join(ctx.taskDir, "cancel.json"));
  const trap = trapSignals();
  try {
    if (cancelled()) {
      recordResult(id, { exitCode: null, outcome: "cancelled" });
      return;
    }
    if (!adapter) {
      const error = "unknown provider";
      recordResult(id, { exitCode: null, outcome: "failed", error });
      return;
    }
    try {
      makeRunnerPrivateDir(id);
    } catch (err) {
      const error = `could not create runner dir: ${(err as Error).message}`;
      recordResult(id, { exitCode: null, outcome: "failed", error });
      return;
    }
    // C1 records no git flag (git never runs after dispatch): assume none.
    const req = {
      checkout: task.checkout,
      isGitRepo: false,
      readOnly: task.readOnly,
    };
    const run = await runWorker(adapter, task, ctx, req, deps, trap, (s) =>
      recordSession(id, s),
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
    removeTaskPaths(task);
    rmSync(privateDir, { recursive: true, force: true });
  }
}

type Claim = Omit<AttemptRecord, "schemaVersion" | "createdAt">;

/**
 * Claim attempt n + 1 for `next` (create-once), writing its context bundle
 * first thing after the claim when it runs fresh. Shared by the runner and
 * the supervisor tick. Undefined when another starter claimed n + 1.
 */
export function claimNextAttempt(
  task: TaskRecord,
  n: number,
  next: Exclude<Decision, { kind: "fail" }>,
): Claim | undefined {
  const id = task.id;
  const bundle =
    next.kind === "resume"
      ? undefined
      : buildContextBundle({
          task, // the original prompt, never a previous bundle
          taskDir: join(orchestratorDir(), "tasks", id),
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
  if (!claimAttempt(id, claim)) return undefined;
  if (bundle !== undefined) writeBundle(id, claim.n, bundle);
  return claim;
}

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
      // First: a cleanup path under runner/<id> would keep it non-empty.
      removeTaskPaths(task);
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
  const req: ProviderRequest = {
    checkout: task.checkout,
    isGitRepo: checkoutIsGitRepo(dispatch),
    readOnly: task.readOnly,
    ...(dispatch.policy.models && { models: dispatch.policy.models }),
  };
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
      // Per attempt: after a switch, the new provider's model.
      const model = dispatch.policy.models?.[attempt.provider];
      const ctx: SpawnContext = {
        ...baseContext(task, privateDir),
        ...(attempt.kind === "resume" &&
          resumeId && { resume: { sessionId: resumeId } }),
        ...(model !== undefined && { model }),
      };
      // In-memory copy only: task.json (and its digest) never change.
      const attemptTask = { ...task, provider: attempt.provider, prompt };
      let run: WorkerRun;
      try {
        run = await runWorker(
          adapter,
          attemptTask,
          ctx,
          req,
          deps,
          trap,
          (s) => {
            recordAttemptSession(id, n, s);
            if (n === 1) recordSession(id, s); // root session.json: C1 compat
          },
        );
      } finally {
        // After finish(): codex reads its last message from privateDir.
        rmSync(privateDir, { recursive: true, force: true });
      }

      if (cancelled()) return end(resultOf(run, "cancelled"));
      if (run.spawnError || run.aborted) return end(resultOf(run, "failed"));
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
          eligible: eligibleProviders(
            req,
            dispatch.policy.noFallback
              ? [attempt.provider]
              : [...new Set([attempt.provider, ...dispatch.policy.fallback])],
          ),
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
      // Stopped (no cancel) once due, before claiming n + 1: the pause and
      // lease stay for the tick. A stop after the claim is seen by runWorker:
      // before the spawn (also during an awaited prepare(), whose exec child
      // is killed) it ends the attempt as stoppedRun and the task fails;
      // after the spawn it kills the worker group.
      if (waited === "stopped" || trap.signal.aborted) return;

      const claim = claimNextAttempt(task, n, next);
      // Lost to the tick (or another runner): it owns the task now.
      if (!claim || !ownAttempt(id, claim.n)) return;
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
