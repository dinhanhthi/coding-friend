import { realpathSync, rmSync } from "fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "path";
import { loadConfig } from "../lib/config.js";
import { commandExists, run as exec } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { acquireLease, releaseLease } from "../lib/orchestrator/lease.js";
import { codexVersionError } from "../lib/orchestrator/providers/eligible.js";
import { PROVIDERS } from "../lib/orchestrator/providers/index.js";
import { resolveTaskPolicy } from "../lib/orchestrator/quota.js";
import { digest, runTask } from "../lib/orchestrator/runner.js";
import {
  hasLiveRunner,
  isRunnerCommand,
  readHeartbeat,
  spawnRunner,
} from "../lib/orchestrator/supervisor.js";
import {
  claimAttempt,
  createTask,
  isOlderThan,
  listTasks,
  readTask,
  recordCancel,
  recordDispatch,
  recordResult,
  recordRunner,
  serialize,
  type AttemptSummary,
  type Provider,
  type TaskView,
} from "../lib/orchestrator/store.js";
import { orchestratorDir } from "../lib/paths.js";
import { resolveCheckoutRoot } from "../lib/project-root.js";

interface Flags {
  json?: boolean;
}

interface RunFlags extends Flags {
  provider?: string;
  readOnly?: boolean;
  /** false with --no-fallback (commander's negatable option). */
  fallback?: boolean;
}

/** JSON mode → envelope; human mode → log CliError then exit 1 via runHuman. */
async function run<T>(
  json: boolean | undefined,
  fn: () => T | Promise<T>,
  print: (data: T) => void,
): Promise<void> {
  if (json) {
    await runJson(fn);
    return;
  }
  await runHuman(async () => {
    try {
      print(await fn());
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

/**
 * Strip ANSI escapes, C0/C1 control chars (keeps \n and \t), and Unicode
 * zero-width / bidi override and isolate chars.
 */
export function sanitize(text: string): string {
  return String(text)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

function oneLine(text: string, max: number): string {
  return sanitize(text).replace(/\s+/g, " ").trim().slice(0, max);
}

function age(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return "?";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && Object.hasOwn(PROVIDERS, v);
}

/** The task's checkout, and whether it is a git repo (before any worker ran). */
function resolveCheckout(
  provider: Provider,
  readOnly: boolean,
): { checkout: string; isGitRepo: boolean } {
  const checkout = resolveCheckoutRoot(process.cwd());
  if (checkout) return { checkout, isGitRepo: true };
  if (provider === "claude" && readOnly) {
    return { checkout: realpathSync(process.cwd()), isGitRepo: false };
  }
  throw new CliError(
    "USAGE",
    readOnly
      ? "Read-only codex tasks must run inside a git repository"
      : "Writer tasks must run inside a git repository",
  );
}

/**
 * realpath of `path`, or — when it does not exist yet — of its nearest
 * existing ancestor with the missing segments re-appended, so a symlink on
 * the way is resolved before the store dir is created.
 */
function realpathOfNearestAncestor(path: string): string {
  const missing: string[] = [];
  let cur = path;
  for (;;) {
    try {
      return join(realpathSync(cur), ...missing);
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return path;
      missing.unshift(basename(cur));
      cur = parent;
    }
  }
}

/**
 * A store inside the checkout is either unwritable (Claude read-only sandbox)
 * or writable by the worker beyond its own task dir (writers' cwd).
 */
function assertStoreOutsideCheckout(checkout: string): void {
  const store = realpathOfNearestAncestor(orchestratorDir()); // checkout is a realpath too
  const rel = relative(checkout, store);
  if (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  ) {
    throw new CliError(
      "USAGE",
      `The orchestrator dir ${store} is inside the checkout ${checkout}; set CF_ORCHESTRATOR_DIR outside it`,
    );
  }
}

/** An older codex may ignore the worker's permission profile: refuse it. */
function assertCodexVersion(): void {
  const error = codexVersionError();
  if (error) throw new CliError("PROVIDER_UNAVAILABLE", error);
}

export async function taskRunCommand(
  prompt: string,
  opts: RunFlags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const provider = opts.provider;
      if (!isProvider(provider)) {
        throw new CliError("USAGE", "--provider must be claude or codex");
      }
      if (!prompt.trim()) throw new CliError("USAGE", "Prompt is empty");
      if (process.platform === "win32") {
        throw new CliError(
          "PROVIDER_UNAVAILABLE",
          "Worker sandboxing is not available on native Windows",
        );
      }
      if (!commandExists(PROVIDERS[provider].bin)) {
        throw new CliError(
          "PROVIDER_UNAVAILABLE",
          `${PROVIDERS[provider].bin} not found on PATH`,
        );
      }
      if (provider === "codex") assertCodexVersion();
      const readOnly = Boolean(opts.readOnly);
      const { checkout, isGitRepo } = resolveCheckout(provider, readOnly);
      // Every task: the runner writes its private dir (codex -o) into the store.
      assertStoreOutsideCheckout(checkout);
      // Before createTask: a config error leaves no task behind.
      const policy = resolveTaskPolicy(loadConfig(), {
        noFallback: opts.fallback === false,
      });

      const task = createTask({ provider, prompt, readOnly, checkout });
      const id = task.id;
      const taskDir = join(orchestratorDir(), "tasks", id);
      if (!readOnly) {
        try {
          acquireLease(checkout, id);
        } catch (err) {
          rmSync(taskDir, { recursive: true, force: true });
          throw err;
        }
      }

      let pid: number;
      try {
        // The bytes createTask wrote, not a re-read the worker could race.
        const taskDigest = digest(Buffer.from(serialize(task), "utf-8"));
        if (!recordDispatch(id, { taskDigest, isGitRepo, policy })) {
          throw new Error("dispatch record already exists");
        }
        if (!claimAttempt(id, { n: 1, provider, kind: "fresh" })) {
          throw new Error("attempt 1 already claimed");
        }
        // The runner writes <1>/runner.json itself (its own pid).
        pid = spawnRunner(id, checkout, taskDigest);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        recordResult(id, { exitCode: null, outcome: "failed", error });
        if (!readOnly) releaseLease(checkout, id);
        throw new CliError("INTERNAL", `Could not start task runner: ${error}`);
      }
      // C1 compat only: C2a readers take the latest attempt's runner pid.
      recordRunner(id, { pid, startedAt: new Date().toISOString() });
      return { taskId: id };
    },
    ({ taskId }) => {
      log.success(`Started task ${taskId}`);
      console.log(`  Follow it with: cf task show ${taskId}`);
    },
  );
}

/** Hidden `cf task _run <id>`: the detached per-task runner. */
export async function taskRunnerCommand(id: string): Promise<void> {
  await runTask(id);
}

/** "resets <local time>", or "reset unknown" (resetsAt is epoch seconds). */
function resetLabel(resetsAt: unknown): string {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) {
    return "reset unknown";
  }
  return `resets ${new Date(resetsAt * 1000).toLocaleString()}`;
}

/** Provider of the latest attempt (C2a), else the task's. */
function currentProvider(t: TaskView): string {
  return sanitize(t.attempts?.at(-1)?.provider ?? t.provider);
}

/**
 * State, plus the reset of the latest pause when paused. A paused task's
 * latest attempt may be an abandoned claim: its pause sits on an earlier one.
 */
function stateLabel(t: TaskView): string {
  if (t.state !== "paused" || !t.attempts) return sanitize(t.state);
  const pause = t.attempts.filter((a) => a.pause).at(-1)?.pause;
  return `${sanitize(t.state)} (${sanitize(resetLabel(pause?.resetsAt))})`;
}

/** A task plus, when nobody will resume it, what to do about it. */
type HintedView = TaskView & { hint?: string };

/** No supervisor tick within 3 minutes (it runs every 60 s), or none ever. */
function supervisorIsStale(): boolean {
  const at = readHeartbeat();
  return at === undefined || isOlderThan(at, 3 * 60 * 1000);
}

/**
 * Add a `hint` to a paused C2a task whose latest runner is gone while no
 * supervisor ticks: nothing would resume it. `stale` is read once per command.
 */
function withHint(t: TaskView, stale: boolean): HintedView {
  if (!stale || !t.attempts || t.state !== "paused") return t;
  if (hasLiveRunner(t.id)) return t; // same liveness check as the tick
  const id = sanitize(t.id);
  return {
    ...t,
    hint: `Task ${id} is paused and no runner is waiting: run \`cf supervisor tick\`, install the supervisor with \`cf supervisor install\`, or free the checkout with \`cf task cancel ${id}\``,
  };
}

function printHints(tasks: HintedView[]): void {
  for (const t of tasks) if (t.hint) console.error(t.hint);
}

export async function taskListCommand(opts: Flags): Promise<void> {
  await run(
    opts.json,
    () => {
      const stale = supervisorIsStale();
      return listTasks().map((t) => withHint(t, stale));
    },
    (tasks) => {
      if (tasks.length === 0) {
        console.log("No tasks.");
        return;
      }
      for (const t of tasks) {
        const ro = t.readOnly ? "  [ro]" : "";
        console.log(
          `${sanitize(t.id)}  ${stateLabel(t)}  ${currentProvider(t)}${ro}  ${age(t.createdAt)}  ${oneLine(t.prompt, 60)}`,
        );
      }
      printHints(tasks);
    },
  );
}

/** One `cf task show` line per attempt (session ids are worker-reported). */
function attemptLine(a: AttemptSummary): string {
  const parts = [
    `${sanitize(String(a.n))}  ${sanitize(a.provider)}  ${sanitize(a.kind)}`,
  ];
  if (a.pid !== undefined) parts.push(`pid ${sanitize(String(a.pid))}`);
  if (a.sessionId) parts.push(`session ${sanitize(a.sessionId)}`);
  if (a.pause) {
    parts.push(
      `paused on ${sanitize(a.pause.source)}, ${sanitize(resetLabel(a.pause.resetsAt))}`,
    );
  }
  return `    ${parts.join("  ")}`;
}

function printShow(t: TaskView): void {
  const attempts = t.attempts;
  console.log(`Task ${sanitize(t.id)}  ${stateLabel(t)}`);
  console.log(
    `  provider:   ${currentProvider(t)}${t.readOnly ? " (read-only)" : ""}`,
  );
  console.log(`  checkout:   ${sanitize(t.checkout)}`);
  console.log(
    `  created:    ${sanitize(String(t.createdAt))} (${age(t.createdAt)} ago)`,
  );
  // C2a: the root runner.json/session.json are attempt 1's; use the attempts.
  const pid = attempts ? attempts.at(-1)?.pid : t.runner?.pid;
  if (attempts ? pid !== undefined : t.runner) {
    console.log(`  runner pid: ${sanitize(String(pid))}`);
  }
  if (!attempts && t.session) {
    console.log(`  session:    ${sanitize(t.session.sessionId)}`);
  }
  // C2a: the latest attempt's transcript, when its provider has one.
  const transcript = attempts
    ? attempts.at(-1)?.transcriptPath
    : t.session?.transcriptPath;
  if (transcript) console.log(`  transcript: ${sanitize(transcript)}`);
  if (attempts) {
    console.log("  attempts:");
    for (const a of attempts) console.log(attemptLine(a));
  }
  if (t.result) {
    console.log(`  exit code:  ${sanitize(String(t.result.exitCode ?? "-"))}`);
    console.log(`  outcome:    ${sanitize(String(t.result.outcome))}`);
  }
  console.log(`  prompt:     ${oneLine(t.prompt, 200)}`);

  const lines: string[] = [];
  // Indent continuation lines so multi-line worker text stays under the label.
  const indent = (text: string) => sanitize(text).replace(/\n/g, "\n    ");
  const add = (label: string, value: string | undefined) => {
    if (value) lines.push(`  ${label}: ${indent(value)}`);
  };
  if (t.done) {
    add("done", t.done.outcome);
    add("summary", t.done.summary);
    add("handoff", t.done.handoff);
  }
  add("last message", t.result?.lastMessage);
  add("error", t.result?.error);
  add("pause message", t.pause?.lastMessage);
  add("pause error", t.pause?.error);
  for (const a of t.pendingAsks) {
    const qid = sanitize(a.qid);
    lines.push(`  question ${qid}: ${indent(a.question)}`);
    lines.push(
      `    answer with: cf reply --task ${sanitize(t.id)} ${qid} "<answer>"`,
    );
  }
  if (lines.length > 0) {
    console.log("worker output (untrusted):");
    for (const l of lines) console.log(l);
  }
}

export async function taskShowCommand(id: string, opts: Flags): Promise<void> {
  await run(
    opts.json,
    () => withHint(readTask(id), supervisorIsStale()),
    (t) => {
      printShow(t);
      printHints([t]);
    },
  );
}

/**
 * SIGTERM the task's runner. runner.json is worker-writable, so only signal a
 * pid whose command line really is `cf task _run <id>`. Returns whether a
 * signal was sent.
 */
function signalRunner(id: string, pid: unknown): boolean {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 1) {
    return false;
  }
  const command = exec("ps", ["-ww", "-o", "command=", "-p", String(pid)]);
  if (!isRunnerCommand(command, id)) return false;
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw new CliError(
      "INTERNAL",
      `Could not signal runner ${pid}: ${(err as Error).message}`,
    );
  }
}

export async function taskCancelCommand(
  id: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      // cancel.json first: the runner reads it to record outcome "cancelled".
      let cancelled = false;
      try {
        recordCancel(id);
        cancelled = true;
      } catch (err) {
        if (!(err instanceof CliError && err.code === "ALREADY_FINISHED")) {
          throw err;
        }
      }
      // Even when finished: a worker can write done.json and keep running.
      // C2a: only the latest attempt's runner is current (a paused task may
      // have none: cancel.json alone ends it).
      const t = readTask(id);
      const pid = t.attempts ? t.attempts.at(-1)?.pid : t.runner?.pid;
      const signalled = signalRunner(id, pid);
      if (!cancelled && !signalled) {
        throw new CliError("ALREADY_FINISHED", `Task ${id} already finished`);
      }
      return { taskId: id, cancelled, signalled };
    },
    ({ taskId, cancelled, signalled }) =>
      log.success(
        !cancelled
          ? `Stopped the runner of finished task ${taskId}`
          : `Cancelled task ${taskId}${signalled ? "" : " (no running runner to stop)"}`,
      ),
  );
}
