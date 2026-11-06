import { createHash, randomBytes } from "crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, join } from "path";
import { CliError } from "../output.js";
import { orchestratorDir } from "../paths.js";
import {
  assertId,
  assertRealDir,
  createOnce,
  type DispatchRecord,
  isOlderThan,
  isPidAlive,
  isProviderName,
  isSessionId,
  MAX_TEXT,
  mkdirReal,
  type Provider,
  readRegularFile,
  serialize,
  SPAWN_GRACE_MS,
} from "./store.js";
import { PROVIDERS } from "./providers/index.js";

/**
 * Trusted chef store `<store>/chefs/<id>/`, outside every worker's write
 * scope. Same rules as store.ts: every file has one writer and is created
 * once, every dir is created 0700 one level at a time and checked real, and
 * chef state (paused, stopped, quota-wait) is derived on read, never stored.
 *
 * Ordering never uses clocks: `nextSeq` hands out create-once numbers from
 * `seq/`, and every record that must be ordered (baselines, fingerprints,
 * task dispatches, pauses, resumes, commits, decisions, messages, asks)
 * carries one; numbered records are named by their seq.
 */

const ID_RE = /^[a-z0-9]{8}$/;
/** Wake numbers and seqs: 1..999999999, no leading zero (safe file name). */
const NUM_RE = /^[1-9]\d{0,8}$/;
const NUM_JSON_RE = /^[1-9]\d{0,8}\.json$/;
/** Event and fingerprint keys become file names. */
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const KEY_JSON_RE = /^[a-z0-9][a-z0-9-]{0,80}\.json$/;
const TASK_JSON_RE = /^[a-z0-9]{8}\.json$/;
const AFTER_TASK_RE = /^after-([a-z0-9]{8})$/;
const AFTER_COMMIT_PREFIX = "after-commit-";
/** Seq numbers lost to concurrent claimers before nextSeq gives up. */
const MAX_SEQ_TRIES = 1000;

// ─── types ──────────────────────────────────────────────────────────────

export type ChefTaskRole = "writer" | "check" | "other";
export type WakeOutcome = "ok" | "quota" | "failed";
export type ChefState = "active" | "paused" | "stopped" | "quota-wait";

/** Produced by the fingerprint code (Phase 2); stored as opaque JSON here. */
export type ChefFingerprint = unknown;
/** Repo config / hooks / steering snapshot (Phase 2); opaque here. */
export type ChefSnapshot = unknown;

/** Resolved `chef.*` limits, snapshotted at start (the tick has no project cwd). */
export interface ChefLimits {
  minWakeMinutes: number;
  maxWakesPerDay: number;
  maxTasksPerWake: number;
  maxConcurrentTasks: number;
  schedule: string[];
  notify: boolean;
}

/** chef.json: everything `cf chef start` resolved once (trusted). */
export interface ChefRecord {
  schemaVersion: 1;
  id: string;
  provider: Provider;
  planDir: string;
  checkout: string;
  isGitRepo: boolean;
  /** realpath of the git dir, pinned at start. */
  gitDir: string;
  branch: string;
  headAtStart: string;
  sessionUuid: string;
  limits: ChefLimits;
  taskPolicy: DispatchRecord["policy"];
  /**
   * Absolute paths resolved at start, keyed by provider name (the value is
   * the path of `PROVIDERS[p].bin`); only git and the chef's provider are
   * always present.
   */
  binaries: { git: string } & Partial<Record<Provider, string>>;
  commit: boolean;
  /** Hooks active at start (they never run in a chef commit). */
  hooks: { hooksPath: string | null; files: string[] };
  configDigest: string;
  /** Start baseline (head = headAtStart, seq = startSeq). */
  baseline: { fingerprint: ChefFingerprint; snapshot: ChefSnapshot };
  /** seq of the start baseline: always 0, so nextSeq starts at 1. */
  startSeq: 0;
  createdAt: string;
}

/** A baseline: start (chef.json) or resumes/<seq>.json. */
export interface ChefBaseline {
  source: "start" | "resume";
  seq: number;
  /** Known HEAD sha of refs/heads/<branch>. */
  head: string;
  fingerprint: ChefFingerprint;
  snapshot: ChefSnapshot;
}

/** resumes/<seq>.json: new baseline written by `cf chef resume`. */
export interface ChefResume {
  schemaVersion: 1;
  seq: number;
  knownHead: string;
  fingerprint: ChefFingerprint;
  snapshot: ChefSnapshot;
  /** Highest claimed wake at resume: the rejected-wake streak restarts after it. */
  afterWake: number;
  createdAt: string;
}

/** pauses/<seq>.json */
export interface ChefPause {
  schemaVersion: 1;
  seq: number;
  reason: string;
  wake?: number;
  createdAt: string;
}

/** stop.json */
export interface ChefStop {
  schemaVersion: 1;
  reason?: string;
  stoppedAt: string;
}

/** events/<key>.json: fire-once trigger pointer. */
export interface ChefEvent {
  schemaVersion: 1;
  key: string;
  detail?: string;
  createdAt: string;
}

/** wakes/<n>/claim.json */
export interface WakeClaim {
  schemaVersion: 1;
  n: number;
  pid: number;
  createdAt: string;
}

export interface WakeRunner {
  schemaVersion: 1;
  pid: number;
  startedAt: string;
}

export interface WakeSession {
  schemaVersion: 1;
  sessionId: string;
}

/**
 * wakes/<n>/result.json, written exactly once per wake. Only `ok` carries
 * `consumed` (the event keys this wake delivered).
 */
export interface WakeResult {
  schemaVersion: 1;
  n: number;
  outcome: WakeOutcome;
  consumed?: string[];
  /** Actions the validator rejected in this wake. */
  rejected?: number;
  /** Epoch seconds of the chef's own quota reset (outcome quota). */
  resetsAt?: number | null;
  error?: string;
  finishedAt: string;
}

/** wakes/<n>/pause.json: why wake n paused the chef (informational). */
export interface WakePause {
  schemaVersion: 1;
  reason: string;
  createdAt: string;
}

export interface WakeEntry {
  n: number;
  claim: WakeClaim;
  runner?: WakeRunner;
  session?: WakeSession;
  result?: WakeResult;
  pause?: WakePause;
}

/** tasks/<taskId>.json: a task this chef dispatched. */
export interface ChefTaskRecord {
  schemaVersion: 1;
  taskId: string;
  role: ChefTaskRole;
  wake: number;
  /** seq allocated before dispatchTask (claim order). */
  dispatchSeq: number;
  createdAt: string;
}

/** fingerprints/<key>.json (`before-<tid>`, `after-<tid>`, `after-commit-<seq>`). */
export interface ChefFingerprintRecord {
  schemaVersion: 1;
  key: string;
  seq: number;
  fingerprint: ChefFingerprint;
  createdAt: string;
}

/** decisions/<seq>.json: one per action (accepted or rejected). */
export interface ChefDecision {
  schemaVersion: 1;
  seq: number;
  wake: number;
  /** Index of the action in the wake's output. */
  index: number;
  kind: string;
  status: string;
  reason?: string;
  taskId?: string;
  action?: unknown;
  createdAt: string;
}

/** messages/<seq>.json: user → chef (`cf chef say`). */
export interface ChefMessage {
  schemaVersion: 1;
  seq: number;
  text: string;
  createdAt: string;
}

/** asks/<seq>.json: chef → user. */
export interface ChefAsk {
  schemaVersion: 1;
  seq: number;
  wake: number;
  question: string;
  createdAt: string;
}

/** commits/<seq>.json */
export interface ChefCommitRecord {
  schemaVersion: 1;
  seq: number;
  wake: number;
  outcome: "committed" | "refused" | "failed";
  paths: string[];
  message: string;
  /** Expected HEAD the commit was built on. */
  parent?: string;
  /** New sha of refs/heads/<branch> (outcome committed). */
  head?: string;
  reason?: string;
  createdAt: string;
}

/** chefs/by-checkout/<sha256(realpath checkout)>.json */
interface CheckoutClaim {
  schemaVersion: 1;
  checkout: string;
  chefId: string;
  createdAt: string;
}

/** chefs/summary.json: statusline cache. */
export interface ChefSummary {
  schemaVersion: 1;
  inbox: number;
  paused: number;
  updatedAt: string;
}

export interface ChefStatus {
  state: ChefState;
  stop?: ChefStop;
  pause?: ChefPause;
  /** quota-wait only: reset of the latest wake's quota (null when unknown). */
  resetsAt?: number | null;
}

// ─── helpers ────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function cap(text: string): string {
  return String(text).slice(0, MAX_TEXT);
}

function isRealDir(dir: string): boolean {
  try {
    return lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function readRecord<T>(file: string): T | undefined {
  const bytes = readRegularFile(file);
  if (!bytes) return undefined;
  try {
    const v = JSON.parse(bytes.toString("utf-8")) as unknown;
    return v && typeof v === "object" ? (v as T) : undefined;
  } catch {
    return undefined;
  }
}

function assertNum(n: number, kind: string): void {
  if (!Number.isInteger(n) || !NUM_RE.test(String(n))) {
    throw new CliError("USAGE", `Invalid ${kind}: ${JSON.stringify(n)}`);
  }
}

function assertKey(key: string, kind: string): void {
  if (typeof key !== "string" || !KEY_RE.test(key)) {
    throw new CliError("USAGE", `Invalid ${kind}: ${JSON.stringify(key)}`);
  }
}

/** Store root (created like tasksDir), checked real. */
function storeRoot(): string {
  const root = orchestratorDir();
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
  assertRealDir(root);
  return root;
}

/** Real subdirs of `dir` named by `re`, or [] (symlinked or missing dir). */
function listNames(dir: string, re: RegExp): string[] {
  if (!dir || !isRealDir(dir)) return [];
  try {
    return readdirSync(dir).filter((n) => re.test(n));
  } catch {
    return [];
  }
}

// ─── paths ──────────────────────────────────────────────────────────────

/** `<store>/chefs` (path only). */
export function chefsDir(): string {
  return join(orchestratorDir(), "chefs");
}

/** `<store>/chefs/<id>` (path only). */
export function chefDir(id: string): string {
  assertId(id, "chef id");
  return join(chefsDir(), id);
}

/** chefs/ (and the store root), created 0700 and checked real. */
function makeChefsDir(): string {
  storeRoot();
  const dir = chefsDir();
  mkdirReal(dir);
  return dir;
}

/** Dir of an existing chef (every level real, chef.json present), else NOT_FOUND. */
function existingChefDir(id: string): string {
  const dir = chefDir(id);
  for (const d of [orchestratorDir(), chefsDir(), dir]) {
    try {
      lstatSync(d);
    } catch {
      throw new CliError("NOT_FOUND", `Chef ${id} not found`);
    }
    assertRealDir(d);
  }
  if (!existsSync(join(dir, "chef.json"))) {
    throw new CliError("NOT_FOUND", `Chef ${id} not found`);
  }
  return dir;
}

/** chefs/<id>/<name>/ created 0700 (chef must exist), checked real. */
function makeChefSubdir(id: string, name: string): string {
  const dir = join(existingChefDir(id), name);
  mkdirReal(dir);
  return dir;
}

/** chefs/<id>/<name>/ when chefs/<id> and it are real dirs, else "". */
function readableChefSubdir(id: string, name: string): string {
  const dir = join(chefDir(id), name);
  return isRealDir(chefsDir()) && isRealDir(chefDir(id)) && isRealDir(dir)
    ? dir
    : "";
}

/**
 * chefs/<id>/private (CF scratch, neutral cwd for git and version checks),
 * private/<n> (per-wake temp index) or private/cwd (empty Codex cwd);
 * created 0700 one level at a time, checked real.
 */
export function makeChefPrivateDir(id: string, sub?: number | "cwd"): string {
  const dir = makeChefSubdir(id, "private");
  if (sub === undefined) return dir;
  if (sub !== "cwd") assertNum(sub, "wake number");
  const leaf = join(dir, String(sub));
  mkdirReal(leaf);
  return leaf;
}

// ─── chefs ──────────────────────────────────────────────────────────────

/**
 * Create chef.json for `input.id` (from `newId()`, chosen by the caller so
 * it can claim the checkout first). Refuses an id that already names a chef
 * or a task.
 */
export function createChef(
  input: Omit<ChefRecord, "schemaVersion" | "startSeq" | "createdAt">,
): ChefRecord {
  assertId(input.id, "chef id");
  if (
    !isProviderName(input.provider) ||
    PROVIDERS[input.provider]?.caps.chef !== true
  ) {
    throw new CliError("USAGE", `Invalid provider: ${String(input.provider)}`);
  }
  for (const name of ["git", input.provider] as const) {
    if (typeof input.binaries?.[name] !== "string") {
      throw new CliError("USAGE", `Chef has no ${name} binary`);
    }
  }
  if (!isSessionId(input.sessionUuid)) {
    throw new CliError("USAGE", "Invalid chef session id");
  }
  const root = storeRoot();
  if (existsSync(join(root, "tasks", input.id))) {
    throw new CliError("USAGE", `Chef id ${input.id} is a task id`);
  }
  makeChefsDir();
  const dir = chefDir(input.id);
  mkdirReal(dir);
  const record: ChefRecord = {
    ...input,
    schemaVersion: 1,
    startSeq: 0,
    createdAt: now(),
  };
  if (!createOnce(join(dir, "chef.json"), record)) {
    throw new CliError("USAGE", `Chef ${input.id} already exists`);
  }
  return record;
}

export function readChef(id: string): ChefRecord {
  const dir = existingChefDir(id);
  const chef = readRecord<ChefRecord>(join(dir, "chef.json"));
  // Content must agree with its location.
  if (!chef || chef.schemaVersion !== 1 || chef.id !== basename(dir)) {
    throw new CliError("NOT_FOUND", `Chef ${id} not found`);
  }
  return chef;
}

/** All readable chefs, newest first. */
export function listChefs(): ChefRecord[] {
  const out: ChefRecord[] = [];
  for (const id of listNames(chefsDir(), ID_RE)) {
    try {
      out.push(readChef(id));
    } catch {
      // unreadable or symlinked: skip
    }
  }
  return out.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}

// ─── one chef per checkout ──────────────────────────────────────────────

function checkoutClaimFile(checkout: string): string {
  let real: string;
  try {
    real = realpathSync(checkout);
  } catch {
    real = checkout;
  }
  const key = createHash("sha256").update(real).digest("hex");
  return join(chefsDir(), "by-checkout", `${key}.json`);
}

/**
 * Claim the checkout for chef `id` (create-once `by-checkout/<sha256(realpath)>.json`).
 * Throws LEASE_HELD when another chef already holds it.
 */
export function claimChefCheckout(checkout: string, id: string): void {
  assertId(id, "chef id");
  const real = realpathSync(checkout);
  makeChefsDir();
  mkdirReal(join(chefsDir(), "by-checkout"));
  const file = checkoutClaimFile(real);
  const record: CheckoutClaim = {
    schemaVersion: 1,
    checkout: real,
    chefId: id,
    createdAt: now(),
  };
  if (createOnce(file, record)) return;
  const holder = readRecord<CheckoutClaim>(file)?.chefId;
  throw new CliError(
    "LEASE_HELD",
    `A chef already exists for checkout ${real} (chef ${typeof holder === "string" ? holder : "unknown"})`,
  );
}

/** Remove the checkout claim only when chef `id` holds it (idempotent). */
export function releaseChefCheckout(checkout: string, id: string): void {
  assertId(id, "chef id");
  const dir = join(chefsDir(), "by-checkout");
  if (!isRealDir(chefsDir()) || !isRealDir(dir)) return;
  const file = checkoutClaimFile(checkout);
  if (readRecord<CheckoutClaim>(file)?.chefId !== id) return;
  try {
    unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ─── seq ────────────────────────────────────────────────────────────────

/**
 * Next seq of chef `id`: create-once `seq/<n>` for the lowest n above every
 * existing one; on a lost race try the next. Claim order is the only order
 * (never clocks); the first seq is 1 (the start baseline is seq 0).
 */
export function nextSeq(id: string): number {
  const dir = makeChefSubdir(id, "seq");
  let n = Math.max(0, ...listNames(dir, NUM_RE).map(Number)) + 1;
  for (let i = 0; i < MAX_SEQ_TRIES; i++, n++) {
    if (createOnce(join(dir, String(n)), { schemaVersion: 1, seq: n })) {
      return n;
    }
  }
  throw new CliError("INTERNAL", `Could not allocate a seq for chef ${id}`);
}

/** Write `<subdir>/<seq>.json` for a fresh seq; returns the record. */
function createSeqRecord<T>(
  id: string,
  subdir: string,
  build: (seq: number) => T,
): T {
  const dir = makeChefSubdir(id, subdir);
  const seq = nextSeq(id);
  const record = build(seq);
  if (!createOnce(join(dir, `${seq}.json`), record)) {
    throw new CliError("INTERNAL", `${subdir}/${seq}.json already exists`);
  }
  return record;
}

/** Records of `<subdir>/<seq>.json` whose `seq` agrees with the name, by seq. */
function listSeqRecords<T extends { seq: number }>(
  id: string,
  subdir: string,
): T[] {
  const dir = readableChefSubdir(id, subdir);
  return listNames(dir, NUM_JSON_RE)
    .map((name) => {
      const r = readRecord<T>(join(dir, name));
      return r && r.seq === Number(name.slice(0, -5)) ? r : undefined;
    })
    .filter((r): r is T => !!r)
    .sort((a, b) => a.seq - b.seq);
}

// ─── events (fire-once) ─────────────────────────────────────────────────

/** Create events/<key>.json; false when the event already fired. */
export function recordEvent(id: string, key: string, detail?: string): boolean {
  assertKey(key, "event key");
  const dir = makeChefSubdir(id, "events");
  const record: ChefEvent = { schemaVersion: 1, key, createdAt: now() };
  if (detail !== undefined) record.detail = cap(detail);
  return createOnce(join(dir, `${key}.json`), record);
}

/** Every event of chef `id`, oldest first. */
export function listEvents(id: string): ChefEvent[] {
  const dir = readableChefSubdir(id, "events");
  return listNames(dir, KEY_JSON_RE)
    .map((name) => {
      const e = readRecord<ChefEvent>(join(dir, name));
      return e && e.key === name.slice(0, -5) ? e : undefined;
    })
    .filter((e): e is ChefEvent => !!e)
    .sort(
      (a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt)) ||
        a.key.localeCompare(b.key),
    );
}

// ─── wakes ──────────────────────────────────────────────────────────────

/**
 * Claim wake n (create-once wakes/<n>/claim.json). Returns false when wake
 * n was already claimed: the claim keeps the tick and a manual run apart.
 */
export function claimWake(id: string, n: number): boolean {
  assertNum(n, "wake number");
  const wakes = makeChefSubdir(id, "wakes");
  const dir = join(wakes, String(n));
  mkdirReal(dir);
  const claim: WakeClaim = {
    schemaVersion: 1,
    n,
    pid: process.pid,
    createdAt: now(),
  };
  return createOnce(join(dir, "claim.json"), claim);
}

/** wakes/<n> of a claimed wake (real dirs all the way), else NOT_FOUND. */
export function claimedWakeDir(id: string, n: number): string {
  assertNum(n, "wake number");
  const chef = existingChefDir(id);
  const wakes = join(chef, "wakes");
  const dir = join(wakes, String(n));
  for (const d of [wakes, dir]) {
    try {
      lstatSync(d);
    } catch {
      throw new CliError("NOT_FOUND", `Wake ${n} of chef ${id} not claimed`);
    }
    assertRealDir(d);
  }
  if (!existsSync(join(dir, "claim.json"))) {
    throw new CliError("NOT_FOUND", `Wake ${n} of chef ${id} not claimed`);
  }
  return dir;
}

/** Returns false when the wake's runner.json already existed. */
export function recordWakeRunner(
  id: string,
  n: number,
  data: { pid: number; startedAt: string },
): boolean {
  const record: WakeRunner = {
    schemaVersion: 1,
    pid: data.pid,
    startedAt: data.startedAt,
  };
  return createOnce(join(claimedWakeDir(id, n), "runner.json"), record);
}

/** Returns false when session.json already existed; throws on an unsafe id. */
export function recordWakeSession(
  id: string,
  n: number,
  data: { sessionId: string },
): boolean {
  if (!isSessionId(data.sessionId)) {
    throw new CliError(
      "USAGE",
      `Invalid session id: ${JSON.stringify(String(data.sessionId).slice(0, 200))}`,
    );
  }
  const record: WakeSession = { schemaVersion: 1, sessionId: data.sessionId };
  return createOnce(join(claimedWakeDir(id, n), "session.json"), record);
}

/**
 * Write wakes/<n>/result.json, exactly once per wake (false when it already
 * existed). Only outcome `ok` keeps `consumed`: a quota or failed wake leaves
 * its events pending.
 */
export function recordWakeResult(
  id: string,
  n: number,
  data: {
    outcome: WakeOutcome;
    consumed?: string[];
    rejected?: number;
    resetsAt?: number | null;
    error?: string;
  },
): boolean {
  if (!["ok", "quota", "failed"].includes(data.outcome)) {
    throw new CliError(
      "USAGE",
      `Invalid wake outcome: ${String(data.outcome)}`,
    );
  }
  const record: WakeResult = {
    schemaVersion: 1,
    n,
    outcome: data.outcome,
    finishedAt: now(),
  };
  if (data.outcome === "ok" && data.consumed !== undefined) {
    for (const key of data.consumed) assertKey(key, "event key");
    record.consumed = [...data.consumed];
  }
  if (data.rejected !== undefined) record.rejected = data.rejected;
  if (data.resetsAt !== undefined) record.resetsAt = data.resetsAt;
  if (data.error !== undefined) record.error = cap(data.error);
  return createOnce(join(claimedWakeDir(id, n), "result.json"), record);
}

/** Returns false when the wake's pause.json already existed. */
export function recordWakePause(
  id: string,
  n: number,
  data: { reason: string },
): boolean {
  const record: WakePause = {
    schemaVersion: 1,
    reason: cap(data.reason),
    createdAt: now(),
  };
  return createOnce(join(claimedWakeDir(id, n), "pause.json"), record);
}

/**
 * Mark a claimed wake failed: create-once result.json with outcome `failed`
 * and no `consumed`, so its events stay pending and n+1 can be claimed.
 * Returns false when the wake already had a result (never overwritten).
 */
export function markClaimFailed(id: string, n: number, error: string): boolean {
  return recordWakeResult(id, n, { outcome: "failed", error });
}

/**
 * A claim without result.json whose runner never started within
 * SPAWN_GRACE_MS, or whose runner is dead. `isAlive` defaults to a pid check;
 * the tick passes its `ps` command-line check.
 */
export function isOrphanedClaim(
  entry: WakeEntry,
  isAlive: (runner: WakeRunner) => boolean = (r) => isPidAlive(r.pid),
): boolean {
  if (entry.result) return false;
  if (!entry.runner) return isOlderThan(entry.claim.createdAt, SPAWN_GRACE_MS);
  return !isAlive(entry.runner);
}

/** Claimed wakes of chef `id`, by n, with their records. */
export function listWakes(id: string): WakeEntry[] {
  const wakes = readableChefSubdir(id, "wakes");
  const entries: WakeEntry[] = [];
  for (const name of listNames(wakes, NUM_RE)) {
    const dir = join(wakes, name);
    if (!isRealDir(dir)) continue;
    const claim = readRecord<WakeClaim>(join(dir, "claim.json"));
    // Content must agree with its location.
    if (!claim || claim.n !== Number(name)) continue;
    const entry: WakeEntry = { n: claim.n, claim };
    const runner = readRecord<WakeRunner>(join(dir, "runner.json"));
    const session = readRecord<WakeSession>(join(dir, "session.json"));
    const result = readRecord<WakeResult>(join(dir, "result.json"));
    const pause = readRecord<WakePause>(join(dir, "pause.json"));
    if (runner) entry.runner = runner;
    if (session) entry.session = session;
    if (result && result.n === claim.n) entry.result = result;
    if (pause) entry.pause = pause;
    entries.push(entry);
  }
  return entries.sort((a, b) => a.n - b.n);
}

// ─── pause / resume / stop ──────────────────────────────────────────────

export function recordPause(
  id: string,
  data: { reason: string; wake?: number },
): ChefPause {
  if (data.wake !== undefined) assertNum(data.wake, "wake number");
  return createSeqRecord<ChefPause>(id, "pauses", (seq) => {
    const r: ChefPause = {
      schemaVersion: 1,
      seq,
      reason: cap(data.reason),
      createdAt: now(),
    };
    if (data.wake !== undefined) r.wake = data.wake;
    return r;
  });
}

/**
 * Write resumes/<seq>.json: the new baseline (current fingerprint, snapshot,
 * and the sha of refs/heads/<branch> the caller read after checking
 * `symbolic-ref HEAD`). Lifts every earlier pause and restarts the
 * rejected-wake streak. A clean checkout is not required.
 */
export function recordResume(
  id: string,
  data: {
    knownHead: string;
    fingerprint: ChefFingerprint;
    snapshot: ChefSnapshot;
  },
): ChefResume {
  const afterWake = Math.max(0, ...listWakes(id).map((w) => w.n));
  return createSeqRecord<ChefResume>(id, "resumes", (seq) => ({
    schemaVersion: 1,
    seq,
    knownHead: data.knownHead,
    fingerprint: data.fingerprint,
    snapshot: data.snapshot,
    afterWake,
    createdAt: now(),
  }));
}

/** Returns false when stop.json already existed. */
export function recordStop(
  id: string,
  data: { reason?: string } = {},
): boolean {
  const record: ChefStop = { schemaVersion: 1, stoppedAt: now() };
  if (data.reason !== undefined) record.reason = cap(data.reason);
  return createOnce(join(existingChefDir(id), "stop.json"), record);
}

export function listPauses(id: string): ChefPause[] {
  return listSeqRecords<ChefPause>(id, "pauses");
}

export function listResumes(id: string): ChefResume[] {
  return listSeqRecords<ChefResume>(id, "resumes");
}

/**
 * Derived chef state: stopped (stop.json) > paused (latest pause seq above
 * latest resume seq) > quota-wait (the highest claimed wake ended with
 * outcome quota and no wake was claimed after it) > active.
 */
export function chefStatus(id: string): ChefStatus {
  const dir = existingChefDir(id);
  const stop = readRecord<ChefStop>(join(dir, "stop.json"));
  if (stop) return { state: "stopped", stop };
  const pause = listPauses(id).at(-1);
  const resume = listResumes(id).at(-1);
  if (pause && pause.seq > (resume?.seq ?? 0)) {
    return { state: "paused", pause };
  }
  const result = listWakes(id).at(-1)?.result;
  if (result?.outcome === "quota") {
    return {
      state: "quota-wait",
      resetsAt: typeof result.resetsAt === "number" ? result.resetsAt : null,
    };
  }
  return { state: "active" };
}

/**
 * Ok wakes in a row (latest first) with rejected actions, since the latest
 * resume. Quota, failed and unfinished wakes neither count nor break it.
 */
export function consecutiveRejectedWakes(id: string): number {
  const after = listResumes(id).at(-1)?.afterWake ?? 0;
  let count = 0;
  for (const w of listWakes(id).reverse()) {
    if (w.n <= after) break;
    if (w.result?.outcome !== "ok") continue;
    if ((w.result.rejected ?? 0) === 0) break;
    count++;
  }
  return count;
}

// ─── baselines / known HEAD ─────────────────────────────────────────────

/** Latest baseline by seq: start (seq 0, chef.json) or the latest resume. */
export function readLatestBaseline(id: string): ChefBaseline {
  const chef = readChef(id);
  const resume = listResumes(id).at(-1);
  if (resume) {
    return {
      source: "resume",
      seq: resume.seq,
      head: resume.knownHead,
      fingerprint: resume.fingerprint,
      snapshot: resume.snapshot,
    };
  }
  return {
    source: "start",
    seq: chef.startSeq,
    head: chef.headAtStart,
    fingerprint: chef.baseline?.fingerprint,
    snapshot: chef.baseline?.snapshot,
  };
}

/**
 * Latest known HEAD sha of the chef's branch, by seq: start, the latest
 * resume, or the latest chef commit (outcome committed).
 */
export function readKnownHead(id: string): string {
  const baseline = readLatestBaseline(id);
  let head = baseline.head;
  let seq = baseline.seq;
  for (const c of listCommits(id)) {
    if (
      c.outcome === "committed" &&
      typeof c.head === "string" &&
      c.seq > seq
    ) {
      head = c.head;
      seq = c.seq;
    }
  }
  return head;
}

// ─── tasks / fingerprints ───────────────────────────────────────────────

/**
 * Record a task this chef dispatched (create-once tasks/<taskId>.json).
 * `dispatchSeq` comes from `nextSeq` before `dispatchTask`.
 */
export function recordTaskRole(
  id: string,
  taskId: string,
  data: { role: ChefTaskRole; wake: number; dispatchSeq: number },
): boolean {
  assertId(taskId, "task id");
  if (!["writer", "check", "other"].includes(data.role)) {
    throw new CliError("USAGE", `Invalid task role: ${String(data.role)}`);
  }
  assertNum(data.wake, "wake number");
  assertNum(data.dispatchSeq, "seq");
  const record: ChefTaskRecord = {
    schemaVersion: 1,
    taskId,
    role: data.role,
    wake: data.wake,
    dispatchSeq: data.dispatchSeq,
    createdAt: now(),
  };
  return createOnce(
    join(makeChefSubdir(id, "tasks"), `${taskId}.json`),
    record,
  );
}

/** Tasks of chef `id`, by dispatchSeq. */
export function listChefTasks(id: string): ChefTaskRecord[] {
  const dir = readableChefSubdir(id, "tasks");
  return listNames(dir, TASK_JSON_RE)
    .map((name) => {
      const t = readRecord<ChefTaskRecord>(join(dir, name));
      return t && t.taskId === name.slice(0, 8) ? t : undefined;
    })
    .filter((t): t is ChefTaskRecord => !!t)
    .sort((a, b) => a.dispatchSeq - b.dispatchSeq);
}

/**
 * Create-once fingerprints/<key>.json with a fresh seq; undefined when the
 * key was already recorded.
 */
export function recordFingerprint(
  id: string,
  key: string,
  fingerprint: ChefFingerprint,
): ChefFingerprintRecord | undefined {
  assertKey(key, "fingerprint key");
  const dir = makeChefSubdir(id, "fingerprints");
  const record: ChefFingerprintRecord = {
    schemaVersion: 1,
    key,
    seq: nextSeq(id),
    fingerprint,
    createdAt: now(),
  };
  return createOnce(join(dir, `${key}.json`), record) ? record : undefined;
}

export function readFingerprint(
  id: string,
  key: string,
): ChefFingerprintRecord | undefined {
  assertKey(key, "fingerprint key");
  const dir = readableChefSubdir(id, "fingerprints");
  if (!dir) return undefined;
  const r = readRecord<ChefFingerprintRecord>(join(dir, `${key}.json`));
  return r && r.key === key ? r : undefined;
}

/** Every fingerprint record of chef `id`, by seq. */
export function listFingerprints(id: string): ChefFingerprintRecord[] {
  const dir = readableChefSubdir(id, "fingerprints");
  return listNames(dir, KEY_JSON_RE)
    .map((name) => {
      const r = readRecord<ChefFingerprintRecord>(join(dir, name));
      return r && r.key === name.slice(0, -5) && Number.isInteger(r.seq)
        ? r
        : undefined;
    })
    .filter((r): r is ChefFingerprintRecord => !!r)
    .sort((a, b) => a.seq - b.seq);
}

/**
 * The reference mark for unintended-change detection: the highest-seq record
 * among the latest baseline (start/resume), `after-commit-<seq>`, and
 * `after-<tid>` of writer/check tasks (`other` tasks never count).
 */
export function readLatestReference(id: string): {
  key: string;
  seq: number;
  fingerprint: ChefFingerprint;
} {
  const baseline = readLatestBaseline(id);
  let best = {
    key: baseline.source === "start" ? "start" : `resume-${baseline.seq}`,
    seq: baseline.seq,
    fingerprint: baseline.fingerprint,
  };
  const roles = new Map(listChefTasks(id).map((t) => [t.taskId, t.role]));
  for (const r of listFingerprints(id)) {
    if (r.seq <= best.seq) continue;
    const task = AFTER_TASK_RE.exec(r.key)?.[1];
    const isMark =
      r.key.startsWith(AFTER_COMMIT_PREFIX) ||
      (task !== undefined &&
        (roles.get(task) === "writer" || roles.get(task) === "check"));
    if (isMark) best = { key: r.key, seq: r.seq, fingerprint: r.fingerprint };
  }
  return best;
}

// ─── decisions / messages / asks / commits ──────────────────────────────

export function recordDecision(
  id: string,
  data: Omit<ChefDecision, "schemaVersion" | "seq" | "createdAt">,
): ChefDecision {
  assertNum(data.wake, "wake number");
  return createSeqRecord<ChefDecision>(id, "decisions", (seq) => {
    const r: ChefDecision = {
      schemaVersion: 1,
      seq,
      wake: data.wake,
      index: data.index,
      kind: cap(data.kind),
      status: cap(data.status),
      createdAt: now(),
    };
    if (data.reason !== undefined) r.reason = cap(data.reason);
    if (data.taskId !== undefined) r.taskId = data.taskId;
    if (data.action !== undefined) r.action = data.action;
    return r;
  });
}

export function listDecisions(id: string): ChefDecision[] {
  return listSeqRecords<ChefDecision>(id, "decisions");
}

/** `cf chef say`: user → chef (text capped). */
export function recordMessage(id: string, text: string): ChefMessage {
  return createSeqRecord<ChefMessage>(id, "messages", (seq) => ({
    schemaVersion: 1,
    seq,
    text: cap(text),
    createdAt: now(),
  }));
}

export function listMessages(id: string): ChefMessage[] {
  return listSeqRecords<ChefMessage>(id, "messages");
}

/** Chef → user question (inbox). */
export function recordAsk(
  id: string,
  data: { wake: number; question: string },
): ChefAsk {
  assertNum(data.wake, "wake number");
  return createSeqRecord<ChefAsk>(id, "asks", (seq) => ({
    schemaVersion: 1,
    seq,
    wake: data.wake,
    question: cap(data.question),
    createdAt: now(),
  }));
}

export function listAsks(id: string): ChefAsk[] {
  return listSeqRecords<ChefAsk>(id, "asks");
}

export function recordCommit(
  id: string,
  data: Omit<ChefCommitRecord, "schemaVersion" | "seq" | "createdAt">,
): ChefCommitRecord {
  assertNum(data.wake, "wake number");
  return createSeqRecord<ChefCommitRecord>(id, "commits", (seq) => {
    const r: ChefCommitRecord = {
      schemaVersion: 1,
      seq,
      wake: data.wake,
      outcome: data.outcome,
      paths: [...data.paths],
      message: cap(data.message),
      createdAt: now(),
    };
    if (data.parent !== undefined) r.parent = data.parent;
    if (data.head !== undefined) r.head = data.head;
    if (data.reason !== undefined) r.reason = cap(data.reason);
    return r;
  });
}

export function listCommits(id: string): ChefCommitRecord[] {
  return listSeqRecords<ChefCommitRecord>(id, "commits");
}

// ─── summary (statusline cache) ─────────────────────────────────────────

/** Replace chefs/summary.json atomically (tmp + rename, 0600). */
export function writeSummary(data: { inbox: number; paused: number }): void {
  const dir = makeChefsDir();
  const file = join(dir, "summary.json");
  const tmp = join(
    dir,
    `.summary.json.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const summary: ChefSummary = {
    schemaVersion: 1,
    inbox: data.inbox,
    paused: data.paused,
    updatedAt: now(),
  };
  try {
    writeFileSync(tmp, serialize(summary), {
      encoding: "utf-8",
      mode: 0o600,
      flag: "wx",
    });
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
