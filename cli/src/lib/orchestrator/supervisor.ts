import { spawn, type ChildProcess } from "child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { randomBytes } from "crypto";
import { dirname, join } from "path";
import { readGlobalChefEnabled } from "../config.js";
import { run as exec } from "../exec.js";
import { orchestratorDir } from "../paths.js";
import {
  chefStatus,
  claimedWakeDir,
  claimWake,
  isOrphanedClaim,
  listChefs,
  listWakes,
  makeChefPrivateDir,
  markClaimFailed,
  recordPause,
  type ChefRecord,
} from "./chef-store.js";
import { boundNotify } from "./chef-exec.js";
import {
  collectTriggers,
  pendingEvents,
  shouldWake,
  TASK_ENDED_STATES,
} from "./chef-triggers.js";
import { updateChefSummary } from "./chef-wake.js";
import { releaseLease } from "./lease.js";
import { eligibleProviders } from "./providers/eligible.js";
import { decideNext } from "./quota.js";
import {
  checkoutIsGitRepo,
  claimNextAttempt,
  digest,
  removeStorePaths,
  taskCleanupPaths,
} from "./runner.js";
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

/** Whether the words of `command` hold `seq` in a row (whole words, not prefixes). */
function hasWordSequence(
  command: string | null | undefined,
  seq: string[],
): boolean {
  const words = command?.trim().split(/\s+/) ?? [];
  return words.some((_, i) => seq.every((s, j) => words[i + j] === s));
}

/**
 * Whether `command` (a `ps -o command=` line) is the runner of task `id`:
 * its words hold `task _run <id>`, the id a whole word (not a prefix).
 */
export function isRunnerCommand(
  command: string | null | undefined,
  id: string,
): boolean {
  return hasWordSequence(command, ["task", "_run", id]);
}

/** Whether `command` is wake `n` of chef `id`: its words hold `chef _wake <id> <n>`. */
export function isWakeCommand(
  command: string | null | undefined,
  id: string,
  n: number,
): boolean {
  return hasWordSequence(command, ["chef", "_wake", id, String(n)]);
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
    eligible: eligibleProviders(
      {
        checkout: task.checkout,
        isGitRepo: checkoutIsGitRepo(dispatch),
        readOnly: task.readOnly,
        models: dispatch.policy.models,
      },
      dispatch.policy.noFallback
        ? [latest.provider]
        : [...new Set([latest.provider, ...dispatch.policy.fallback])],
    ),
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

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the workspace and `cleanupPaths` an ended task left behind (its
 * runner died before `end()`). A live runner keeps them: the state alone is
 * not enough, done.json (worker-written) ends it while the worker still runs.
 */
function cleanupEnded(
  view: TaskView,
  ps: NonNullable<TickOptions["ps"]>,
): void {
  if (!TASK_ENDED_STATES.includes(view.state)) return;
  const orchDir = orchestratorDir();
  const paths = taskCleanupPaths(view, orchDir).filter(exists);
  if (paths.length === 0) return;
  const alive = view.attempts
    ? latestRunnerAlive(view.id, listAttempts(view.id), ps)
    : !!view.runner && isRunnerAlive(view.id, view.runner.pid, ps);
  if (!alive) removeStorePaths(orchDir, paths, "supervisor");
}

/**
 * One supervisor pass: write the heartbeat, adopt every paused C2a task
 * whose runner is gone and whose next attempt is due (C1 tasks, without
 * runs/, are never adopted), then remove the leftovers of ended tasks.
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
  // After adoption: a task failed just now is cleaned in this same tick.
  for (const view of listTasks()) {
    try {
      cleanupEnded(view, deps.ps);
    } catch (err) {
      console.error(`supervisor: task ${view.id}: cleanup: ${String(err)}`);
    }
  }
  // The chef pass reports on stderr only: TickSummary stays the C2a shape.
  try {
    tickChefs({ now, spawn: deps.spawn, ps: deps.ps });
  } catch (err) {
    console.error(`supervisor: chefs: ${String(err)}`);
  }
  return summary;
}

// ─── chef pass ──────────────────────────────────────────────────────────

/**
 * Open chefs/<id>/wakes/<n>/wake.log for append (0600). The wake dir is in
 * the trusted chef store; still, never follow a symlink or open anything
 * but a regular file there.
 */
function openWakeLog(id: string, n: number): number {
  const fd = openSync(
    join(claimedWakeDir(id, n), "wake.log"),
    constants.O_WRONLY |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );
  try {
    if (!fstatSync(fd).isFile()) throw new Error("wake.log is not a file");
  } catch (err) {
    closeSync(fd);
    throw err;
  }
  return fd;
}

/**
 * Spawn the detached wake runner (`cf chef _wake <id> <n>`) for wake `n`,
 * already claimed by this tick (`CF_CHEF_CLAIMED=1`). Its cwd is the chef's
 * neutral private dir, never the checkout; stdio goes to wakes/<n>/wake.log.
 */
function spawnWake(
  id: string,
  n: number,
  spawnFn: typeof spawn = spawn,
): number {
  const cwd = makeChefPrivateDir(id);
  const script = realpathSync(process.argv[1]);
  const fd = openWakeLog(id, n);
  try {
    const child: ChildProcess = spawnFn(
      process.execPath,
      [...process.execArgv, script, "chef", "_wake", id, String(n)],
      {
        detached: true,
        stdio: ["ignore", fd, fd],
        cwd,
        // cwd changes: pass the store dir absolute, not a relative override.
        env: {
          ...process.env,
          CF_ORCHESTRATOR_DIR: orchestratorDir(),
          CF_CHEF_CLAIMED: "1",
        },
      },
    );
    child.once("error", () => {}); // reported via the missing pid below
    if (!child.pid) throw new Error("wake process did not start");
    child.unref();
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

/** Chef ids per outcome of one chef pass (stderr only, not in TickSummary). */
export interface ChefTickSummary {
  woken: string[];
  paused: string[];
  skipped: string[];
}

type ChefOutcome = keyof ChefTickSummary;

/** One chef: resolve orphaned claims, record triggers, maybe claim and spawn a wake. */
function tickChef(
  chef: ChefRecord,
  now: number,
  deps: Required<Omit<TickOptions, "now">>,
): ChefOutcome {
  const id = chef.id;
  const state = chefStatus(id).state;
  if (state === "stopped" || state === "paused") return "skipped";

  // A wake writes result.json (ok) before it executes its actions, so a
  // live runner counts whether or not its result exists.
  const isAlive = (n: number, pid: number) =>
    isPidAlive(pid) && isWakeCommand(deps.ps(pid), id, n);
  const wakes = listWakes(id);
  if (wakes.some((w) => w.runner && isAlive(w.n, w.runner.pid))) {
    return "skipped";
  }
  for (const w of wakes) {
    if (isOrphanedClaim(w, (r) => isAlive(w.n, r.pid))) {
      markClaimFailed(
        id,
        w.n,
        w.runner ? "wake runner died without a result" : "wake never started",
      );
    }
  }

  collectTriggers({ chefId: id, now });
  const decision = shouldWake({ chef, events: pendingEvents(id), now });
  if (!decision.wake) {
    if (!decision.pause) return "skipped";
    const reason = `daily wake cap reached (${chef.limits.maxWakesPerDay} wakes in 24 h)`;
    recordPause(id, { reason });
    console.error(`supervisor: chef ${id}: paused, daily wake cap reached`);
    void boundNotify(chef, (line) =>
      console.error(`supervisor: chef ${id}: ${line}`),
    )(`Coding Friend chef ${id} paused`, reason);
    return "paused";
  }

  // Create-once: of two racing ticks (or a manual run), only one gets wake n.
  const n = Math.max(0, ...listWakes(id).map((w) => w.n)) + 1;
  if (!claimWake(id, n)) return "skipped";
  let pid: number;
  try {
    pid = spawnWake(id, n, deps.spawn);
  } catch (err) {
    markClaimFailed(
      id,
      n,
      `Could not start chef wake: ${(err as Error).message}`,
    );
    throw err;
  }
  console.error(`supervisor: chef ${id}: wake ${n} started (pid ${pid})`);
  return "woken";
}

/**
 * Chef pass of the tick: when `chef.enabled` (global config) is on, for each
 * chef neither stopped nor paused and without a live wake, mark orphaned
 * claims failed, record fire-once triggers and, when `shouldWake` allows,
 * claim the next wake and spawn its runner for that same n. Store reads and
 * the spawn only: never git, never a provider. Errors are caught per chef.
 */
export function tickChefs(options: TickOptions = {}): ChefTickSummary {
  const summary: ChefTickSummary = { woken: [], paused: [], skipped: [] };
  if (!readGlobalChefEnabled()) return summary;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const deps = {
    spawn: options.spawn ?? spawn,
    ps: options.ps ?? defaultPs,
  };
  for (const chef of listChefs()) {
    let outcome: ChefOutcome;
    try {
      outcome = tickChef(chef, now, deps);
    } catch (err) {
      console.error(`supervisor: chef ${chef.id}: ${String(err)}`);
      outcome = "skipped";
    }
    summary[outcome].push(chef.id);
  }
  // A tick pause changes the statusline counter (a wake refreshes it itself).
  if (summary.paused.length > 0) {
    try {
      updateChefSummary();
    } catch (err) {
      console.error(`supervisor: chefs: summary: ${String(err)}`);
    }
  }
  return summary;
}
