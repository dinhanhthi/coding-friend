import { spawn, type ChildProcess } from "child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { randomBytes } from "crypto";
import { dirname, join } from "path";
import { run as exec } from "../exec.js";
import { orchestratorDir } from "../paths.js";
import { releaseLease } from "./lease.js";
import { eligibleProviders } from "./providers/eligible.js";
import { decideNext } from "./quota.js";
import { checkoutIsGitRepo, claimNextAttempt, digest } from "./runner.js";
import {
  assertRealDir,
  isPidAlive,
  listAttempts,
  listTasks,
  mkdirReal,
  readDispatch,
  readRegularFile,
  recordResult,
  runsDir,
  serialize,
  type AttemptEntry,
  type TaskRecord,
  type TaskView,
} from "./store.js";

/**
 * Supervisor tick (`cf supervisor tick`, run by launchd every 60 s): adopts
 * paused C2a tasks whose runner is gone (reboot, crash, kill) by claiming
 * the next attempt and spawning a new runner. A live runner owns its task
 * until it ends, so the tick never touches a task whose runner still runs.
 */

/**
 * Open runs/<id>/runner.log for append (0600). runs/<id>/ is outside every
 * worker's write scope, unlike the task dir; still, never follow a symlink
 * or open anything but a regular file there.
 */
function openRunnerLog(id: string): number {
  const dir = runsDir(id);
  mkdirReal(dirname(dir));
  mkdirReal(dir);
  const fd = openSync(
    join(dir, "runner.log"),
    constants.O_WRONLY |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );
  try {
    if (!fstatSync(fd).isFile()) throw new Error("runner.log is not a file");
  } catch (err) {
    closeSync(fd);
    throw err;
  }
  return fd;
}

/**
 * Spawn the detached runner (`cf task _run <id>`); its stdio goes to
 * runs/<id>/runner.log. `taskDigest` (sha256 of task.json) lets the runner
 * refuse a task.json rewritten after dispatch; `cwd` is the checkout.
 */
export function spawnRunner(
  id: string,
  cwd: string,
  taskDigest: string,
  spawnFn: typeof spawn = spawn,
): number {
  const fd = openRunnerLog(id);
  try {
    const child: ChildProcess = spawnFn(
      process.execPath,
      [...process.execArgv, process.argv[1], "task", "_run", id],
      {
        detached: true,
        stdio: ["ignore", fd, fd],
        cwd,
        // cwd changes: pass the store dir absolute, not a relative override.
        env: {
          ...process.env,
          CF_ORCHESTRATOR_DIR: orchestratorDir(),
          CF_TASK_DIGEST: taskDigest,
          CF_TASK_CHECKOUT: cwd,
        },
      },
    );
    child.once("error", () => {}); // reported via the missing pid below
    if (!child.pid) throw new Error("runner process did not start");
    child.unref();
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

/** `<store>/supervisor`: heartbeat (and the launchd tick log). */
export function supervisorDir(): string {
  return join(orchestratorDir(), "supervisor");
}

/** Replace supervisor/heartbeat.json atomically (tmp + rename, 0600). */
function writeHeartbeat(now: number): void {
  const root = orchestratorDir();
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
  assertRealDir(root);
  const dir = supervisorDir();
  mkdirReal(dir);
  const file = join(dir, "heartbeat.json");
  const tmp = join(
    dir,
    `.heartbeat.json.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(
      tmp,
      serialize({
        schemaVersion: 1,
        pid: process.pid,
        at: new Date(now * 1000).toISOString(),
      }),
      { encoding: "utf-8", mode: 0o600, flag: "wx" },
    );
    renameSync(tmp, file); // replaces a symlink itself, never its target
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // tmp may not exist if the write failed
    }
    throw err;
  }
}

/** Test seams; each default is the real runtime. */
export interface TickOptions {
  /** Epoch seconds (the unit of quota.ts). */
  now?: number;
  spawn?: typeof spawn;
  /** `ps -o command=` of `pid`, null when there is no such process. */
  ps?: (pid: number) => string | null;
}

/**
 * Ids per outcome. `skipped`: paused tasks left alone (live runner, not due
 * yet, claim lost to another starter, or an error logged to stderr).
 */
export interface TickSummary {
  adopted: string[];
  failed: string[];
  skipped: string[];
}

const defaultPs = (pid: number) =>
  exec("ps", ["-ww", "-o", "command=", "-p", String(pid)]);

/**
 * Whether `command` (a `ps -o command=` line) is the runner of task `id`:
 * its words hold `task _run <id>`, the id a whole word (not a prefix).
 */
export function isRunnerCommand(
  command: string | null | undefined,
  id: string,
): boolean {
  const words = command?.trim().split(/\s+/) ?? [];
  return words.some(
    (w, i) => w === "task" && words[i + 1] === "_run" && words[i + 2] === id,
  );
}

/**
 * Whether `pid` is still the runner of task `id`: alive and its command line
 * is `cf task _run <id>` (after a reboot the pid may belong to anything).
 */
function isRunnerAlive(
  id: string,
  pid: number,
  ps: NonNullable<TickOptions["ps"]>,
): boolean {
  return isPidAlive(pid) && isRunnerCommand(ps(pid), id);
}

/** Whether the latest runner ever started (an abandoned claim has none) still runs. */
function latestRunnerAlive(
  id: string,
  attempts: AttemptEntry[],
  ps: NonNullable<TickOptions["ps"]>,
): boolean {
  const runner = attempts.filter((e) => e.runner).at(-1)?.runner;
  return !!runner && isRunnerAlive(id, runner.pid, ps);
}

/** Whether task `id` has a live runner (false: a paused task is orphaned). */
export function hasLiveRunner(
  id: string,
  ps: NonNullable<TickOptions["ps"]> = defaultPs,
): boolean {
  return latestRunnerAlive(id, listAttempts(id), ps);
}

/** supervisor/heartbeat.json `at` (ISO), undefined when never written or unreadable. */
export function readHeartbeat(): string | undefined {
  const bytes = readRegularFile(join(supervisorDir(), "heartbeat.json"));
  if (!bytes) return undefined;
  try {
    const at = (JSON.parse(bytes.toString("utf-8")) as { at?: unknown }).at;
    return typeof at === "string" ? at : undefined;
  } catch {
    return undefined;
  }
}

type Outcome = "adopted" | "failed" | "skipped";

/**
 * End the task failed (root result.json) and free its checkout. "skipped"
 * when a racing tick wrote the result first.
 */
function fail(id: string, checkout: string, error: string): Outcome {
  const recorded = recordResult(id, {
    exitCode: null,
    outcome: "failed",
    error,
  });
  // releaseLease removes the lease only when this task holds it.
  releaseLease(checkout, id);
  return recorded ? "failed" : "skipped";
}

/** Adopt one paused C2a task if its runner is gone and its next attempt is due. */
function adopt(
  view: TaskView,
  now: number,
  deps: Required<Omit<TickOptions, "now">>,
): Outcome {
  const id = view.id;
  const attempts = listAttempts(id);
  if (latestRunnerAlive(id, attempts, deps.ps)) return "skipped";
  const latest = attempts.at(-1)?.attempt;
  const dispatch = readDispatch(id);
  if (!latest || !dispatch) return "skipped";

  // Same check as the runner: task.json must be the bytes dispatched.
  const taskDir = join(orchestratorDir(), "tasks", id);
  const bytes = readRegularFile(join(taskDir, "task.json"));
  if (!bytes || digest(bytes) !== dispatch.taskDigest) {
    return fail(id, view.checkout, "task.json changed after dispatch");
  }
  // Parse the bytes just hashed: checkout and prompt come from them.
  const task = JSON.parse(bytes.toString("utf-8")) as TaskRecord;
  if (task.id !== id) {
    return fail(id, view.checkout, "task.json changed after dispatch");
  }

  const decision = decideNext({
    policy: dispatch.policy,
    attempts,
    now,
    eligible: eligibleProviders(checkoutIsGitRepo(dispatch)),
  });
  if (decision.kind === "fail") return fail(id, task.checkout, decision.reason);
  if (decision.at > now) return "skipped";

  // Create-once: of two racing starters, only one gets attempt n + 1.
  const claim = claimNextAttempt(task, latest.n, decision);
  if (!claim) return "skipped";
  try {
    spawnRunner(id, task.checkout, dispatch.taskDigest, deps.spawn);
  } catch (err) {
    return fail(
      id,
      task.checkout,
      `Could not start task runner: ${(err as Error).message}`,
    );
  }
  return "adopted";
}

/**
 * One supervisor pass: write the heartbeat, then adopt every paused C2a task
 * whose runner is gone and whose next attempt is due. C1 tasks (no runs/)
 * are never touched.
 */
export function tickOnce(options: TickOptions = {}): TickSummary {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const deps = {
    spawn: options.spawn ?? spawn,
    ps: options.ps ?? defaultPs,
  };
  writeHeartbeat(now);
  const summary: TickSummary = { adopted: [], failed: [], skipped: [] };
  for (const view of listTasks()) {
    if (!view.attempts || view.state !== "paused") continue;
    let outcome: Outcome;
    try {
      outcome = adopt(view, now, deps);
    } catch (err) {
      console.error(`supervisor: task ${view.id}: ${String(err)}`);
      outcome = "skipped";
    }
    summary[outcome].push(view.id);
  }
  return summary;
}
