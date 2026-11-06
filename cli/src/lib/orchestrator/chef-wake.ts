import { spawn, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import {
  closeSync,
  constants as fsc,
  fstatSync,
  openSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { readGlobalChefEnabled } from "../config.js";
import { notifyUser } from "../notify.js";
import {
  commitGateProblem,
  isPassingCheck,
  isTerminalState,
  shouldPauseForRejections,
  validateActions,
  type ChefFacts,
  type ChefFactsTask,
} from "./chef-actions.js";
import {
  buildDigest,
  type DigestFacts,
  type DigestTask,
} from "./chef-digest.js";
import {
  defaultExecDeps,
  errMsg,
  executeActions,
  pauseChef,
  steeringOf,
  type ChefExecDeps,
} from "./chef-exec.js";
import {
  diffSnapshots,
  fingerprintEquals,
  makeChefHooksDir,
  snapshotRepoGuard,
  snapshotSteering,
  type ChefFingerprint,
  type ChefSnapshot,
  type GitCtx,
} from "./chef-git.js";
import {
  chefDir,
  chefStatus,
  claimedWakeDir,
  claimWake,
  consecutiveRejectedWakes,
  listAsks,
  listChefs,
  listChefTasks,
  listDecisions,
  listMessages,
  listResumes,
  listWakes,
  makeChefPrivateDir,
  readChef,
  readFingerprint,
  readKnownHead,
  readLatestBaseline,
  readLatestReference,
  recordEvent,
  recordFingerprint,
  recordWakeResult,
  recordWakeRunner,
  recordWakeSession,
  writeSummary,
  type ChefRecord,
  type ChefTaskRecord,
  type WakeOutcome,
} from "./chef-store.js";
import { pendingEvents, wakesCountedForCap } from "./chef-triggers.js";
import {
  buildChefSpawn,
  finishChefRun,
  parseChefLine,
  type ChefRunResult,
  type ChefSpawnSpec,
  type ChefStreamAcc,
} from "./providers/chef.js";
import { resolveTaskPolicy } from "./quota.js";
import {
  createOnce,
  isSessionId,
  readTask,
  serialize,
  type TaskState,
  type TaskView,
} from "./store.js";

/**
 * One chef wake (C2b task 3.7): `cf chef _wake <id> <n>`, a detached
 * process the tick spawns after claiming wake n (env CF_CHEF_CLAIMED=1); a
 * manual run claims first. Lifecycle:
 *
 *   claim → runner.json (create-once; losing either exits) → re-check
 *   enabled/stop/pause/daily cap → after-fingerprints of ended tasks →
 *   steering + repo guard vs the latest baseline → working tree vs the
 *   latest reference mark (skipped while a writer/check task is not
 *   terminal) → digest → chef process (own group, 15 min timeout) →
 *   validateActions → result.json (ok + consumed, once) → executors →
 *   streak pause, or a fire-once `rejected-<n>` event when actions were
 *   rejected and the chef is still active (so it wakes again to see why).
 *
 * Every exit after runner.json writes result.json exactly once: `ok` right
 * after the actions parse (then they run), `quota`/`failed` at the end.
 * Only `ok` consumes events. No sleeping: a chef quota ends the wake and the
 * tick fires `chef-quota-<n>` after the reset.
 */

/** Chef process timeout (the whole process group is killed). */
export const CHEF_WAKE_TIMEOUT_MS = 15 * 60 * 1000;
/** SIGTERM → SIGKILL grace for the chef process group. */
const KILL_GRACE_MS = 5000;
/** Wait for buffered stdout after exit, in case a grandchild holds the pipe. */
const DRAIN_MS = 2000;
/** Bytes of chef stdout read before the run is killed as runaway. */
export const MAX_CHEF_STDOUT_BYTES = 32 * 1024 * 1024;
/** Bytes of wakes/<n>/output.json. */
const MAX_OUTPUT_JSON_BYTES = 1024 * 1024;
/** Bytes of wakes/<n>/wake.log. */
export const MAX_WAKE_LOG_BYTES = 256 * 1024;
const STDERR_TAIL = 2048;
/** Tasks listed in the digest (newest by dispatch seq, plus every unfinished one). */
const DIGEST_MAX_TASKS = 50;

const delay = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms).unref());

// ─── deps ───────────────────────────────────────────────────────────────

/** Test seams; each default is the real runtime. */
export interface WakeOptions {
  spawn?: typeof spawn;
  /** Epoch seconds (the unit of chef-triggers and quota.ts). */
  now?: () => number;
  notify?: typeof notifyUser;
  /** `chef.enabled` from the global config. */
  readEnabled?: () => boolean;
  /** Git context of the chef (default: binaries/gitDir from chef.json, CF dirs). */
  gitCtx?: (chef: ChefRecord) => GitCtx;
  /** Executor deps to override (dispatchTask, commitPaths, ...). */
  exec?: Partial<ChefExecDeps>;
  /** Signal a process group (default process.kill(-pid)). */
  killGroup?: (pid: number, sig: NodeJS.Signals) => void;
  timeoutMs?: number;
  /** Process env (CF_CHEF_CLAIMED). */
  env?: NodeJS.ProcessEnv;
  pid?: number;
  /**
   * Terminate signal. Default: SIGTERM/SIGINT of this process. When given,
   * no process handlers are installed.
   */
  signal?: AbortSignal;
}

export type WakeRunOutcome =
  /** Another process owns this wake (claim or runner.json lost). */
  | "lost-claim"
  | "lost-runner"
  /** Disabled, stopped or paused at start: nothing ran. */
  | "blocked"
  /** This wake paused the chef before spawning it. */
  | "paused"
  | WakeOutcome;

export interface WakeRunResult {
  outcome: WakeRunOutcome;
  reason?: string;
  /** ok only: decisions of this wake's actions. */
  actions?: { index: number; type: string; status: string; reason?: string }[];
}

function defaultKillGroup(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch {
    // group gone
  }
}

/** Git context of a chef: everything pinned in chef.json, cwd never the checkout. */
export function chefGitCtx(chef: ChefRecord): GitCtx {
  return {
    gitBin: chef.binaries.git,
    gitDir: chef.gitDir,
    checkout: chef.checkout,
    hooksDir: makeChefHooksDir(chef.id),
    neutralCwd: makeChefPrivateDir(chef.id),
  };
}

// ─── wake files ─────────────────────────────────────────────────────────

/**
 * Append-only, capped wakes/<n>/wake.log (O_APPEND, never through a
 * symlink): the tick also points the wake's stdio at it.
 */
export function wakeLogger(id: string, n: number): (line: string) => void {
  let file: string;
  try {
    file = join(claimedWakeDir(id, n), "wake.log");
  } catch {
    return () => {};
  }
  return (line: string) => {
    let fd: number | undefined;
    try {
      fd = openSync(
        file,
        fsc.O_WRONLY | fsc.O_APPEND | fsc.O_CREAT | fsc.O_NOFOLLOW,
        0o600,
      );
      const st = fstatSync(fd);
      if (!st.isFile() || st.size >= MAX_WAKE_LOG_BYTES) return;
      const text = `${new Date().toISOString()} ${line.replace(/[\r\n]+/g, " ")}\n`;
      writeSync(fd, text.slice(0, MAX_WAKE_LOG_BYTES - st.size));
    } catch {
      // logging never fails a wake
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };
}

/** Create-once text file in wakes/<n>/ (0600). */
function writeWakeText(dir: string, name: string, text: string): boolean {
  try {
    writeFileSync(join(dir, name), text, {
      encoding: "utf-8",
      mode: 0o600,
      flag: "wx",
    });
    return true;
  } catch {
    return false;
  }
}

/** sha256 of the canonical fingerprint JSON, short (digest display only). */
function fingerprintId(fp: ChefFingerprint): string {
  const changed = Object.keys(fp?.changed ?? {})
    .sort()
    .map((k) => [k, fp.changed[k]]);
  const canonical = JSON.stringify([
    fp?.head,
    changed,
    [...(fp?.skipped ?? [])].sort(),
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

// ─── summary (statusline) ───────────────────────────────────────────────

/**
 * Rewrite `chefs/summary.json` from every chef: `paused` = chefs paused now;
 * `inbox` = chef questions (asks) newer than that chef's latest resume or
 * user message (`cf chef resume`/`say` count as the user having seen them).
 * Stopped chefs count for neither.
 */
export function updateChefSummary(): void {
  let inbox = 0;
  let paused = 0;
  for (const chef of listChefs()) {
    const state = chefStatus(chef.id).state;
    if (state === "stopped") continue;
    if (state === "paused") paused++;
    const seen = Math.max(
      0,
      listResumes(chef.id).at(-1)?.seq ?? 0,
      listMessages(chef.id).at(-1)?.seq ?? 0,
    );
    inbox += listAsks(chef.id).filter((a) => a.seq > seen).length;
  }
  writeSummary({ inbox, paused });
}

// ─── signals ────────────────────────────────────────────────────────────

interface Trap {
  signal: AbortSignal;
  /** Pid of the running chef process group, 0 when none. */
  childPid: number;
  killTimer?: NodeJS.Timeout;
  dispose(): void;
}

function trapSignals(
  external: AbortSignal | undefined,
  killGroup: (pid: number, sig: NodeJS.Signals) => void,
): Trap {
  const abort = new AbortController();
  const onSignal = () => {
    if (!abort.signal.aborted) abort.abort();
    const pid = trap.childPid;
    if (trap.killTimer || pid <= 1) return;
    killGroup(pid, "SIGTERM");
    trap.killTimer = setTimeout(() => killGroup(pid, "SIGKILL"), KILL_GRACE_MS);
    trap.killTimer.unref();
  };
  const trap: Trap = {
    signal: abort.signal,
    childPid: 0,
    dispose() {
      if (external) external.removeEventListener("abort", onSignal);
      else {
        process.off("SIGTERM", onSignal);
        process.off("SIGINT", onSignal);
      }
      if (trap.killTimer) clearTimeout(trap.killTimer);
    },
  };
  if (external) {
    if (external.aborted) abort.abort();
    else external.addEventListener("abort", onSignal);
  } else {
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);
  }
  return trap;
}

// ─── chef process ───────────────────────────────────────────────────────

interface ChefProcessRun {
  exitCode: number | null;
  acc: ChefStreamAcc;
  timedOut: boolean;
  overflow: boolean;
  spawnError?: string;
  stderrTail: string;
}

/** Spawn the chef (cwd = spec.cwd, own group), parse its stream until it exits. */
async function runChefProcess(
  spec: ChefSpawnSpec,
  opts: {
    spawn: typeof spawn;
    killGroup: (pid: number, sig: NodeJS.Signals) => void;
    timeoutMs: number;
    trap: Trap;
    onSession: (sessionId: string) => void;
  },
): Promise<ChefProcessRun> {
  const acc: ChefStreamAcc = {};
  const { trap } = opts;
  let child: ChildProcess;
  try {
    child = opts.spawn(spec.cmd, spec.args, {
      cwd: spec.cwd, // CF-owned empty dir, never the checkout
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true, // own process group: timeout and SIGTERM signal -pid
    });
  } catch (err) {
    return {
      exitCode: null,
      acc,
      timedOut: false,
      overflow: false,
      spawnError: errMsg(err),
      stderrTail: "",
    };
  }
  const pid = child.pid ?? 0;
  trap.childPid = pid;
  let timedOut = false;
  let overflow = false;
  let killTimer: NodeJS.Timeout | undefined;
  const kill = () => {
    if (pid <= 1 || killTimer) return;
    opts.killGroup(pid, "SIGTERM");
    killTimer = setTimeout(() => opts.killGroup(pid, "SIGKILL"), KILL_GRACE_MS);
    killTimer.unref();
  };
  // Ref'd: cleared in finally; keeps the wake alive while the chef runs.
  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, opts.timeoutMs);

  try {
    let spawnError: string | undefined;
    const exited = new Promise<number | null>((resolve) => {
      child.once("error", (err) => {
        spawnError = err.message;
        resolve(null);
      });
      child.once("exit", (code) => resolve(code));
    });
    child.stdin?.on("error", () => {}); // EPIPE when the chef exits early
    child.stdin?.end(spec.stdin);

    let bytes = 0;
    let sessionSeen = false;
    const stdout = child.stdout!;
    stdout.on("data", (chunk: Buffer | string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_CHEF_STDOUT_BYTES && !overflow) {
        overflow = true;
        kill();
      }
    });
    const rl = createInterface({ input: stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (overflow) return;
      parseChefLine(spec.provider, line, acc);
      if (!sessionSeen && acc.sessionId) {
        sessionSeen = true;
        opts.onSession(acc.sessionId);
      }
    });
    const stdoutClosed = new Promise<void>((r) => rl.once("close", r));

    let stderrTail = "";
    child.stderr?.setEncoding("utf-8");
    child.stderr?.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL);
    });

    const exitCode = await exited;
    await Promise.race([stdoutClosed, delay(DRAIN_MS)]);
    rl.close();
    stdout.destroy();
    child.stderr?.destroy();
    return { exitCode, acc, timedOut, overflow, spawnError, stderrTail };
  } finally {
    clearTimeout(timer);
    if (killTimer || trap.killTimer) {
      // Killed: take down what is left of the group.
      if (killTimer) clearTimeout(killTimer);
      opts.killGroup(pid, "SIGKILL");
    }
    trap.childPid = 0;
  }
}

// ─── facts ──────────────────────────────────────────────────────────────

interface TaskInfo {
  record: ChefTaskRecord;
  view?: TaskView;
  /** Store state; a vanished/unreadable task reads as failed (fail closed). */
  state: TaskState;
}

function loadTasks(id: string): TaskInfo[] {
  return listChefTasks(id).map((record) => {
    try {
      const view = readTask(record.taskId);
      return { record, view, state: view.state };
    } catch {
      return { record, state: "failed" as TaskState };
    }
  });
}

function isWriterRole(t: TaskInfo): boolean {
  return t.record.role === "writer" || t.record.role === "check";
}

function factsTask(id: string, t: TaskInfo): ChefFactsTask {
  const fp = (key: string) =>
    (readFingerprint(id, key)?.fingerprint as ChefFingerprint | undefined) ??
    null;
  return {
    taskId: t.record.taskId,
    role: t.record.role,
    state: t.state,
    dispatchSeq: t.record.dispatchSeq,
    before: fp(`before-${t.record.taskId}`),
    after: isTerminalState(t.state) ? fp(`after-${t.record.taskId}`) : null,
  };
}

/** ChefFacts for validateActions (plain data, no fs/git afterwards). */
function buildFacts(
  id: string,
  chef: ChefRecord,
  tasks: TaskInfo[],
  baselineSeq: number,
  current: ChefFingerprint | null,
): ChefFacts {
  const running = tasks.filter((t) => !isTerminalState(t.state));
  const pendingAsks: ChefFacts["pendingAsks"] = [];
  for (const t of running) {
    for (const a of t.view?.pendingAsks ?? []) {
      pendingAsks.push({ qid: a.qid, taskId: t.record.taskId });
    }
  }
  return {
    chef: {
      checkout: chef.checkout,
      commit: chef.commit === true,
      steering: steeringOf(chef),
    },
    tasks: tasks.map((t) => factsTask(id, t)),
    baselineSeq,
    currentFingerprint: current,
    pendingAsks,
    running: {
      tasks: running.length,
      writers: running.filter(isWriterRole).length,
    },
  };
}

function digestFingerprint(fp: ChefFingerprint | null) {
  return fp
    ? { id: fingerprintId(fp), changed: Object.keys(fp.changed ?? {}).length }
    : undefined;
}

/** DigestFacts for buildDigest (worker text only for tasks ended this wake). */
function buildDigestFacts(
  c: Ctx,
  chef: ChefRecord,
  tasks: TaskInfo[],
  fx: ChefFacts,
  events: ReturnType<typeof pendingEvents>,
  endedNow: Set<string>,
): DigestFacts {
  const { id, n } = c;
  const byId = new Map(fx.tasks.map((t) => [t.taskId, t]));
  const shown = [...tasks]
    .sort((a, b) => b.record.dispatchSeq - a.record.dispatchSeq)
    .filter((t, i) => i < DIGEST_MAX_TASKS || !isTerminalState(t.state));
  const digestTasks: DigestTask[] = shown.map((t) => {
    const f = byId.get(t.record.taskId);
    const before = digestFingerprint(f?.before ?? null);
    const after = digestFingerprint(f?.after ?? null);
    const d: DigestTask = {
      taskId: t.record.taskId,
      role: t.record.role,
      state: t.state,
      wake: t.record.wake,
      dispatchSeq: t.record.dispatchSeq,
      fingerprint: {
        ...(before && { before }),
        ...(after && { after }),
      },
    };
    if (t.record.role === "check" && f && isTerminalState(t.state)) {
      d.check = isPassingCheck(f) ? "passed" : "failed";
    }
    if (endedNow.has(t.record.taskId) && t.view) {
      if (t.view.done?.summary) d.summary = t.view.done.summary;
      if (t.view.done?.handoff) d.handoff = t.view.done.handoff;
      if (t.view.result?.lastMessage) d.lastMessage = t.view.result.lastMessage;
    }
    return d;
  });

  const asks: DigestFacts["asks"] = [];
  for (const t of tasks) {
    if (isTerminalState(t.state)) continue;
    for (const a of t.view?.pendingAsks ?? []) {
      asks.push({ qid: a.qid, taskId: t.record.taskId, question: a.question });
    }
  }
  const sayKeys = new Set(events.map((e) => e.key));
  const messages = listMessages(id)
    .filter((m) => sayKeys.has(`say-${m.seq}`))
    .map((m) => ({ seq: m.seq, text: m.text }));

  // Rejections of the previous ok wake (none when it was clean).
  const prev = listWakes(id)
    .filter((w) => w.n < n && w.result?.outcome === "ok")
    .at(-1);
  const rejected = prev
    ? listDecisions(id)
        .filter((d) => d.wake === prev.n && d.status === "rejected")
        .map((d) => ({ index: d.index, kind: d.kind, reason: d.reason ?? "" }))
    : [];

  const gate = commitGateProblem(fx);
  return {
    chef: {
      id: chef.id,
      provider: chef.provider,
      planDir: chef.planDir,
      checkout: chef.checkout,
      branch: chef.branch,
      commit: chef.commit,
      hooks: chef.hooks,
    },
    wake: n,
    limits: {
      maxTasksPerWake: chef.limits.maxTasksPerWake,
      maxConcurrentTasks: chef.limits.maxConcurrentTasks,
      maxWakesPerDay: chef.limits.maxWakesPerDay,
      wakesUsed: fx.wakesToday ?? 0,
      runningTasks: fx.running.tasks,
      writerRunning: fx.running.writers > 0,
    },
    tasks: digestTasks,
    asks,
    messages,
    gate: { ready: gate === null, missing: gate ? [gate] : [] },
    ...(fx.currentFingerprint && {
      changedPaths: Object.keys(fx.currentFingerprint.changed ?? {}),
    }),
    rejected,
    events: events.map((e) => ({
      key: e.key,
      ...(e.detail !== undefined && { detail: e.detail }),
      createdAt: e.createdAt,
    })),
  };
}

// ─── wake ───────────────────────────────────────────────────────────────

interface Ctx {
  id: string;
  n: number;
  now: () => number;
  log: (line: string) => void;
  exec: ChefExecDeps;
  trap: Trap;
  opts: WakeOptions;
}

/** result.json (create-once); false when it already existed. */
function finish(c: Ctx, data: Parameters<typeof recordWakeResult>[2]): boolean {
  const ok = recordWakeResult(c.id, c.n, data);
  if (!ok) c.log("result.json already existed: not rewritten");
  c.log(
    `result: ${data.outcome}${data.error ? ` (${data.error})` : ""}${
      data.consumed ? `, consumed ${data.consumed.length} events` : ""
    }`,
  );
  return ok;
}

async function pauseBeforeSpawn(
  c: Ctx,
  chef: ChefRecord,
  reason: string,
): Promise<WakeRunResult> {
  await pauseChef(chef, c.n, reason, c.exec);
  finish(c, { outcome: "failed", error: `paused before spawning: ${reason}` });
  return { outcome: "paused", reason };
}

/**
 * Run wake n of chef `id`. Never throws once runner.json is written: every
 * path ends with result.json. The `cf chef _wake` command ignores the
 * returned outcome (tests read it).
 */
export async function runWake(
  id: string,
  n: number,
  options: WakeOptions = {},
): Promise<WakeRunResult> {
  const env = options.env ?? process.env;
  if (env.CF_CHEF_CLAIMED !== "1" && !claimWake(id, n)) {
    return { outcome: "lost-claim", reason: `wake ${n} already claimed` };
  }
  try {
    const started = recordWakeRunner(id, n, {
      pid: options.pid ?? process.pid,
      startedAt: new Date().toISOString(),
    });
    if (!started) {
      return { outcome: "lost-runner", reason: "runner.json already exists" };
    }
  } catch (err) {
    return { outcome: "lost-claim", reason: errMsg(err) };
  }

  const log = wakeLogger(id, n);
  const killGroup = options.killGroup ?? defaultKillGroup;
  const trap = trapSignals(options.signal, killGroup);
  const c: Ctx = {
    id,
    n,
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
    log,
    // Bound to the chef once it is read; placeholder until then.
    exec: undefined as unknown as ChefExecDeps,
    trap,
    opts: options,
  };
  log(`wake ${n} of chef ${id} started (pid ${options.pid ?? process.pid})`);
  try {
    return await wakeBody(c);
  } catch (err) {
    const error = `wake failed: ${errMsg(err)}`;
    log(error);
    try {
      finish(c, { outcome: "failed", error });
    } catch (e) {
      log(`could not write result.json: ${errMsg(e)}`);
    }
    return { outcome: "failed", reason: error };
  } finally {
    trap.dispose();
    // The wake owns private/<n>/ (temp index, Codex schema and -o files).
    try {
      rmSync(join(chefDir(id), "private", String(n)), {
        recursive: true,
        force: true,
      });
    } catch (err) {
      log(`could not remove private/${n}: ${errMsg(err)}`);
    }
    try {
      updateChefSummary();
    } catch (err) {
      log(`could not update chefs/summary.json: ${errMsg(err)}`);
    }
  }
}

async function wakeBody(c: Ctx): Promise<WakeRunResult> {
  const { id, n, log, opts } = c;
  const chef = readChef(id);
  c.exec = {
    ...defaultExecDeps(chef, log, opts.notify ?? notifyUser),
    ...(opts.readEnabled && { readEnabled: opts.readEnabled }),
    ...opts.exec,
  };
  const exec = c.exec;

  // ── re-check: the tick decided a moment ago, things may have changed ──
  if (!exec.readEnabled()) {
    finish(c, {
      outcome: "failed",
      error: "chef disabled (chef.enabled=false)",
    });
    return { outcome: "blocked", reason: "disabled" };
  }
  const state = chefStatus(id).state;
  if (state === "stopped" || state === "paused") {
    finish(c, { outcome: "failed", error: `chef ${state} at wake start` });
    return { outcome: "blocked", reason: state };
  }
  const now = c.now();
  const cap = chef.limits?.maxWakesPerDay;
  const others = listWakes(id).filter((w) => w.n !== n);
  if (typeof cap === "number" && wakesCountedForCap(others, now) >= cap) {
    return pauseBeforeSpawn(c, chef, `daily wake cap reached (${cap} in 24 h)`);
  }

  // ── fingerprints and guards, before any digest or provider ──
  const ctx = (opts.gitCtx ?? chefGitCtx)(chef);
  let tasks = loadTasks(id);
  const busy = tasks.some((t) => isWriterRole(t) && !isTerminalState(t.state));
  const knownHead = readKnownHead(id);
  let current: ChefFingerprint;
  try {
    current = exec.computeFingerprint(ctx, knownHead);
  } catch (err) {
    return pauseBeforeSpawn(c, chef, `fingerprint failed: ${errMsg(err)}`);
  }
  // (1) after-fingerprints of every chef task ended since the last wake.
  for (const t of tasks) {
    if (!isTerminalState(t.state)) continue;
    const key = `after-${t.record.taskId}`;
    if (readFingerprint(id, key)) continue;
    if (recordFingerprint(id, key, current)) {
      log(`recorded ${key} (${t.record.role}, ${t.state})`);
    }
  }
  // Steering + repo guard vs the latest baseline, always (even when busy).
  const baseline = readLatestBaseline(id);
  try {
    const base = (baseline.snapshot ?? {}) as Partial<ChefSnapshot>;
    const repo = diffSnapshots(base.repo ?? {}, snapshotRepoGuard(ctx));
    if (repo.length) {
      return pauseBeforeSpawn(
        c,
        chef,
        `repository config changed: ${repo.slice(0, 10).join(", ")}`,
      );
    }
    const steering = diffSnapshots(
      base.steering ?? {},
      snapshotSteering(ctx, chef.planDir),
    );
    if (steering.length) {
      return pauseBeforeSpawn(
        c,
        chef,
        `steering file changed: ${steering.slice(0, 10).join(", ")}`,
      );
    }
  } catch (err) {
    return pauseBeforeSpawn(c, chef, `steering guard failed: ${errMsg(err)}`);
  }
  // (2) working tree vs the latest reference mark; (3) skipped while busy.
  if (!busy) {
    const ref = readLatestReference(id);
    if (!ref.fingerprint || !fingerprintEqualsSafe(current, ref.fingerprint)) {
      return pauseBeforeSpawn(
        c,
        chef,
        `working tree changed outside chef tasks since ${ref.key}`,
      );
    }
  } else {
    log("a writer/check task is not finished: working tree not compared");
  }

  // ── digest ──
  tasks = loadTasks(id);
  const events = pendingEvents(id);
  const consumed = events.map((e) => e.key);
  const endedNow = new Set(
    consumed
      .filter((k) => k.startsWith("task-ended-"))
      .map((k) => k.slice("task-ended-".length)),
  );
  const fx = buildFacts(id, chef, tasks, baseline.seq, busy ? null : current);
  fx.wakesToday = wakesCountedForCap(listWakes(id), now);
  const digestFacts = buildDigestFacts(c, chef, tasks, fx, events, endedNow);
  const digest = buildDigest(digestFacts);
  const wakeDir = claimedWakeDir(id, n);
  writeWakeText(wakeDir, "digest.md", digest);

  // ── chef process ──
  if (c.trap.signal.aborted) {
    finish(c, {
      outcome: "failed",
      error: "wake terminated before the chef ran",
    });
    return { outcome: "failed", reason: "terminated" };
  }
  const previous = [...listWakes(id)]
    .reverse()
    .find((w) => w.n !== n && w.session && isSessionId(w.session.sessionId));
  let spec: ChefSpawnSpec;
  try {
    // Throws for a provider without a chef registry entry or a missing binary.
    spec = buildChefSpawn({
      chef,
      wake: n,
      digest,
      ...(previous?.session && {
        resume: { sessionId: previous.session.sessionId },
      }),
    });
  } catch (err) {
    const error = `chef spawn not built: ${errMsg(err)}`;
    log(error);
    finish(c, { outcome: "failed", error });
    return { outcome: "failed", reason: error };
  }
  log(`spawning ${spec.provider} chef${previous ? " (resume)" : ""}`);
  let sessionRecorded = false;
  const recordSession = (sessionId: string) => {
    if (sessionRecorded) return;
    sessionRecorded = true;
    try {
      recordWakeSession(id, n, { sessionId });
    } catch (err) {
      log(`could not record session: ${errMsg(err)}`);
    }
  };
  const proc = await runChefProcess(spec, {
    spawn: opts.spawn ?? spawn,
    killGroup: opts.killGroup ?? defaultKillGroup,
    timeoutMs: opts.timeoutMs ?? CHEF_WAKE_TIMEOUT_MS,
    trap: c.trap,
    onSession: recordSession,
  });
  if (proc.stderrTail.trim()) log(`chef stderr: ${proc.stderrTail.trim()}`);
  let run: ChefRunResult;
  if (c.trap.signal.aborted) {
    run = { outcome: "failed", error: "wake terminated (SIGTERM)" };
  } else if (proc.timedOut) {
    run = {
      outcome: "failed",
      error: `chef timed out after ${Math.round((opts.timeoutMs ?? CHEF_WAKE_TIMEOUT_MS) / 1000)} s`,
    };
  } else if (proc.overflow) {
    run = { outcome: "failed", error: "chef output over the size cap" };
  } else if (proc.spawnError) {
    run = {
      outcome: "failed",
      error: `chef did not start: ${proc.spawnError}`,
    };
  } else {
    run = finishChefRun(spec, proc.acc, proc.exitCode);
  }
  if (run.sessionId) recordSession(run.sessionId);

  if (run.outcome === "quota") {
    // Keep the session; the tick wakes the chef after the reset.
    const resetsAt =
      run.resetsAt ?? c.now() + resolveTaskPolicy({}).waitMinutes * 60;
    finish(c, {
      outcome: "quota",
      resetsAt,
      ...(run.error !== undefined && { error: run.error }),
    });
    return { outcome: "quota", reason: `resets at ${resetsAt}` };
  }
  if (run.outcome === "failed") {
    finish(c, { outcome: "failed", error: run.error });
    return { outcome: "failed", reason: run.error };
  }

  // ── validate, result.json once, then execute ──
  const validation = validateActions({
    output: run.output,
    facts: fx,
    providerProblem: exec.providerProblem,
    limits: {
      maxTasksPerWake: chef.limits.maxTasksPerWake,
      maxConcurrentTasks: chef.limits.maxConcurrentTasks,
    },
  });
  const outputJson = serialize(run.output);
  if (Buffer.byteLength(outputJson) <= MAX_OUTPUT_JSON_BYTES) {
    createOnce(join(wakeDir, "output.json"), run.output);
  } else {
    log("output.json not written: over the size cap");
  }
  if (validation.schemaError) {
    finish(c, { outcome: "failed", error: validation.schemaError });
    return { outcome: "failed", reason: validation.schemaError };
  }
  // Another process (the tick's orphan path) already wrote result.json: the
  // events stay pending for the next wake, so executing here would duplicate.
  if (
    !finish(c, {
      outcome: "ok",
      consumed,
      rejected: validation.rejected.length,
    })
  ) {
    return {
      outcome: "failed",
      reason: "result.json already written by another process",
    };
  }
  log(
    `chef summary: ${validation.summary ?? ""}; ${validation.accepted.length} accepted, ${validation.rejected.length} rejected`,
  );
  const actions = await executeActions(
    {
      chef,
      wake: n,
      ctx,
      gateFingerprint: fx.currentFingerprint,
      pendingAsks: fx.pendingAsks,
      signal: c.trap.signal,
      deps: exec,
    },
    validation,
  );
  const streak = consecutiveRejectedWakes(id);
  if (shouldPauseForRejections(streak) && chefStatus(id).state === "active") {
    await pauseChef(
      chef,
      n,
      `${streak} wakes in a row had rejected actions`,
      exec,
    );
  } else if (
    validation.rejected.length > 0 &&
    chefStatus(id).state === "active"
  ) {
    // A rejected-only wake leaves nothing that would wake the chef again: a
    // fire-once event brings it back after minWakeMinutes to see why (also
    // when other actions ran; the streak pause and the daily cap bound it).
    recordEvent(
      id,
      `rejected-${n}`,
      `wake ${n} had ${validation.rejected.length} rejected action${validation.rejected.length === 1 ? "" : "s"} (reasons under Rejected actions of the previous wake)`,
    );
  }
  return { outcome: "ok", actions };
}

function fingerprintEqualsSafe(a: ChefFingerprint, b: unknown): boolean {
  try {
    return fingerprintEquals(a, b as ChefFingerprint);
  } catch {
    return false;
  }
}
