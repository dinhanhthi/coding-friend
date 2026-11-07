import { realpathSync } from "fs";
import { loadConfig } from "../lib/config.js";
import { run as exec } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { dispatchTask } from "../lib/orchestrator/dispatch.js";
import { followTask, type FollowData } from "../lib/orchestrator/follow.js";
import { resolveTaskPolicy } from "../lib/orchestrator/quota.js";
import { runTask } from "../lib/orchestrator/runner.js";
import {
  hasLiveRunner,
  isRunnerCommand,
  readHeartbeat,
} from "../lib/orchestrator/supervisor.js";
import {
  isModelName,
  isOlderThan,
  isProviderName,
  listTasks,
  PROVIDER_NAMES,
  readTask,
  recordCancel,
  type AttemptSummary,
  type TaskView,
} from "../lib/orchestrator/store.js";
import type { Turn } from "../lib/transcript.js";
import { resolveCheckoutRoot } from "../lib/project-root.js";

interface Flags {
  json?: boolean;
}

interface FollowFlags extends Flags {
  cursor?: string;
}

interface RunFlags extends Flags {
  provider?: string;
  /** Model for --provider only (overrides config task.models.<provider>). */
  model?: string;
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

/**
 * The task's checkout, and whether it is a git repo (before any worker ran).
 * Outside a repo the checkout is the cwd; whether the provider may run there
 * (`caps.nonGitReadOnly`) is dispatchTask's providerIneligibility check.
 */
function resolveCheckout(cwd: string): {
  checkout: string;
  isGitRepo: boolean;
} {
  const checkout = resolveCheckoutRoot(cwd);
  if (checkout) return { checkout, isGitRepo: true };
  return { checkout: realpathSync(cwd), isGitRepo: false };
}

export async function taskRunCommand(
  prompt: string,
  opts: RunFlags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const { provider, model } = opts;
      if (model !== undefined && provider === undefined) {
        throw new CliError("USAGE", "--model needs --provider");
      }
      if (!isProviderName(provider)) {
        throw new CliError(
          "USAGE",
          `--provider must be one of ${PROVIDER_NAMES.join(", ")}`,
        );
      }
      if (model !== undefined && !isModelName(model)) {
        throw new CliError(
          "USAGE",
          '--model must be a model name (no leading "-", no spaces or shell characters)',
        );
      }
      if (!prompt.trim()) throw new CliError("USAGE", "Prompt is empty");
      const readOnly = Boolean(opts.readOnly);
      const { checkout, isGitRepo } = resolveCheckout(process.cwd());
      // Before createTask: a config error leaves no task behind.
      const policy = resolveTaskPolicy(loadConfig(), {
        noFallback: opts.fallback === false,
      });
      const { taskId } = dispatchTask({
        prompt,
        provider,
        readOnly,
        checkout,
        isGitRepo,
        policy,
        ...(model !== undefined && { model }),
      });
      return { taskId };
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
  const command = exec("/bin/ps", ["-ww", "-o", "command=", "-p", String(pid)]);
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

/** Human `cf task follow`: poll interval, and the wait before the last drain. */
const FOLLOW_POLL_MS = 1000;

/** Like `cf session show`'s turns; every string is worker text. */
function printFollowTurn(turn: Turn): void {
  if (turn.kind !== "tool") {
    console.log(`## ${turn.kind === "user" ? "User" : "Assistant"}\n`);
    console.log(`${sanitize(turn.text)}\n`);
    return;
  }
  // Never the tool's output.
  console.log(sanitize(`- tool: ${turn.name} ${turn.args}`).trimEnd());
}

/** What one human follow has printed so far. */
interface FollowSeen {
  state?: string;
  attempt?: number;
  reasons: Set<string>;
  asks: Set<string>;
}

function printFollowPoll(d: FollowData, seen: FollowSeen): void {
  const t = d.task;
  const state = stateLabel(t);
  if (state !== seen.state) {
    seen.state = state;
    console.log(`Task ${sanitize(t.id)}  ${state}`);
  }
  if (d.attempt && d.attempt.n !== seen.attempt) {
    seen.attempt = d.attempt.n;
    const a = d.attempt;
    console.log(
      `--- attempt ${sanitize(String(a.n))}  ${sanitize(a.provider)}  ${sanitize(a.kind)} ---`,
    );
  }
  if (d.live.status === "unsupported" && d.live.reason) {
    const key = `${d.attempt?.n}:${d.live.reason}`;
    if (!seen.reasons.has(key)) {
      seen.reasons.add(key);
      log.warn(`No live transcript: ${sanitize(d.live.reason)}`);
    }
  }
  for (const turn of d.turns) printFollowTurn(turn);
  for (const a of t.pendingAsks) {
    if (seen.asks.has(a.qid)) continue;
    seen.asks.add(a.qid);
    const qid = sanitize(a.qid);
    console.log(`question ${qid}: ${sanitize(a.question)}`);
    console.log(
      `  answer with: cf reply --task ${sanitize(t.id)} ${qid} "<answer>"`,
    );
  }
}

/** The done summary and last message of a finished task (not redacted). */
function printFollowEnd(t: TaskView): void {
  const indent = (text: string) => sanitize(text).replace(/\n/g, "\n  ");
  if (t.done) {
    console.log(`done: ${sanitize(t.done.outcome)}`);
    if (t.done.summary) console.log(`summary:\n  ${indent(t.done.summary)}`);
  }
  if (t.result?.lastMessage) {
    console.log(`last message:\n  ${indent(t.result.lastMessage)}`);
  }
}

/**
 * Poll followTask every FOLLOW_POLL_MS (at once while `more`), printing what is
 * new, until the task is terminal and drained, or SIGINT. Resolves with the
 * last data, or null when interrupted.
 */
async function followLoop(
  id: string,
  cursor: string | undefined,
): Promise<FollowData | null> {
  const seen: FollowSeen = { reasons: new Set(), asks: new Set() };
  let timer: NodeJS.Timeout | undefined;
  let wake: (() => void) | undefined;
  let stopped = false;
  const onSigint = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    wake?.();
  };
  process.once("SIGINT", onSigint);
  try {
    // The transcript still grows a little after the task ends: once terminal
    // and drained, wait once more, then drain again.
    let lastWait = false;
    for (;;) {
      const d = followTask(id, cursor);
      cursor = d.cursor;
      printFollowPoll(d, seen);
      if (d.more || (d.terminal && lastWait && d.turns.length > 0)) continue;
      if (d.terminal) {
        if (lastWait) return d;
        lastWait = true;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, FOLLOW_POLL_MS);
      });
      timer = undefined;
      if (stopped) return null;
    }
  } finally {
    process.off("SIGINT", onSigint);
    if (timer) clearTimeout(timer);
  }
}

export async function taskFollowCommand(
  id: string,
  opts: FollowFlags,
): Promise<void> {
  if (opts.json) {
    await run(
      true,
      () => {
        const d = followTask(id, opts.cursor);
        return { ...d, task: withHint(d.task, supervisorIsStale()) };
      },
      () => {},
    );
    return;
  }
  await run(
    false,
    () => followLoop(id, opts.cursor),
    (d) => {
      if (d) printFollowEnd(d.task);
    },
  );
}
