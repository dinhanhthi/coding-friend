import { randomBytes } from "crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";
import { CliError } from "../output.js";
import { orchestratorDir } from "../paths.js";

/**
 * File-backed task store. Every file has exactly one writer and is written
 * once (create-only), so no locks are needed; task state is derived on read.
 */

const ID_RE = /^[a-z0-9]{8}$/;
const JSON_ID_RE = /^[a-z0-9]{8}\.json$/;
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
export const MAX_TEXT = 4096;
/** Larger store files read as invalid (prompts arrive via argv: far smaller). */
const MAX_FILE_BYTES = 16 * 1024 * 1024;
/** Attempt numbers: 1..999, no leading zero (also a safe dir name). */
const ATTEMPT_RE = /^[1-9]\d{0,2}$/;

/**
 * Worker-reported session ids (Claude UUIDs, Codex thread ids) go into argv
 * (`--resume <id>`, `resume <id>`) and file names: no leading "-", no path
 * characters.
 */
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

/** How long a task (or lease) without runner.json counts as still spawning. */
export const SPAWN_GRACE_MS = 30_000;

export type Provider = "claude" | "codex";
export type DoneOutcome = "succeeded" | "failed";
export type ResultOutcome = DoneOutcome | "cancelled";
export type TaskState =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "paused";

export interface TaskRecord {
  schemaVersion: 1;
  id: string;
  provider: Provider;
  prompt: string;
  readOnly: boolean;
  checkout: string;
  createdAt: string;
}

export interface RunnerRecord {
  schemaVersion: 1;
  pid: number;
  startedAt: string;
}

export interface SessionRecord {
  schemaVersion: 1;
  sessionId: string;
  transcriptPath?: string;
}

export interface ResultRecord {
  schemaVersion: 1;
  exitCode: number | null;
  outcome: ResultOutcome;
  lastMessage?: string;
  error?: string;
  finishedAt: string;
}

export interface DoneRecord {
  schemaVersion: 1;
  outcome: DoneOutcome;
  summary: string;
  handoff?: string;
  finishedAt: string;
}

export interface CancelRecord {
  schemaVersion: 1;
  cancelledAt: string;
}

export interface AskRecord {
  schemaVersion: 1;
  qid: string;
  taskId: string;
  question: string;
  createdAt: string;
}

export interface AnswerRecord {
  schemaVersion: 1;
  qid: string;
  answer: string;
  answeredAt: string;
}

export type QuotaPolicy = "wait-then-switch" | "wait" | "switch";
export type AttemptKind = "fresh" | "resume" | "switch";

/** runs/<id>/dispatch.json: what `cf task run` dispatched (trusted). */
export interface DispatchRecord {
  schemaVersion: 1;
  /** sha256 of the task.json bytes at dispatch. */
  taskDigest: string;
  /**
   * Whether the checkout was a git repo at dispatch, before any worker ran
   * (codex eligibility).
   */
  isGitRepo: boolean;
  policy: {
    onQuota: QuotaPolicy;
    waitMinutes: number;
    fallback: Provider[];
    noFallback: boolean;
  };
  createdAt: string;
}

/** runs/<id>/<n>/attempt.json: create-once claim of attempt n. */
export interface AttemptRecord {
  schemaVersion: 1;
  n: number;
  provider: Provider;
  kind: AttemptKind;
  resumeSessionId?: string;
  /** The attempt's stdin is runs/<id>/<n>/context-bundle.md. */
  bundle?: boolean;
  createdAt: string;
}

/** runs/<id>/<n>/pause.json: attempt n stopped on a provider quota. */
export interface PauseRecord {
  schemaVersion: 1;
  provider: Provider;
  /** Epoch seconds of the announced reset, null when unknown. */
  resetsAt: number | null;
  /** Where the quota signal came from. */
  source: string;
  lastMessage?: string;
  error?: string;
  createdAt: string;
}

export interface AttemptEntry {
  attempt: AttemptRecord;
  runner?: RunnerRecord;
  session?: SessionRecord;
  pause?: PauseRecord;
}

/** One attempt in TaskView (no worker text: see `pause` for that). */
export interface AttemptSummary {
  n: number;
  provider: Provider;
  kind: AttemptKind;
  pid?: number;
  sessionId?: string;
  transcriptPath?: string;
  pause?: { resetsAt: number | null; source: string };
}

export interface TaskView extends TaskRecord {
  state: TaskState;
  pendingAsks: AskRecord[];
  runner?: RunnerRecord;
  session?: SessionRecord;
  result?: ResultRecord;
  done?: DoneRecord;
  cancel?: CancelRecord;
  /** Only for tasks with runs/<id>/ (C2a); absent for C1 tasks. */
  attempts?: AttemptSummary[];
  /** Pause of the latest attempt, when it has one. */
  pause?: PauseRecord & { n: number };
}

// ─── helpers ────────────────────────────────────────────────────────────

export function newId(): string {
  return Array.from(randomBytes(8), (b) => ID_CHARS[b % ID_CHARS.length]).join(
    "",
  );
}

export function assertId(
  id: string,
  kind: "task id" | "question id" | "chef id",
): void {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new CliError("USAGE", `Invalid ${kind}: ${JSON.stringify(id)}`);
  }
}

function cap(text: string): string {
  return text.slice(0, MAX_TEXT);
}

function now(): string {
  return new Date().toISOString();
}

function tasksDir(): string {
  const root = orchestratorDir();
  // Skip mkdir when present: sandboxed workers may write only their task dir.
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
  return join(root, "tasks");
}

function taskDir(id: string): string {
  assertId(id, "task id");
  return join(tasksDir(), id);
}

function assertAttempt(n: number): void {
  if (!Number.isInteger(n) || !ATTEMPT_RE.test(String(n))) {
    throw new CliError("USAGE", `Invalid attempt number: ${JSON.stringify(n)}`);
  }
}

/**
 * `<store>/runner/<id>` (C1), or `<store>/runner/<id>/<n>` for attempt n:
 * scratch dir of the task's runner, outside every worker's write scope
 * (workers write only their task dir and checkout).
 */
export function runnerPrivateDir(id: string, n?: number): string {
  assertId(id, "task id");
  const dir = join(orchestratorDir(), "runner", id);
  if (n === undefined) return dir;
  assertAttempt(n);
  return join(dir, String(n));
}

/**
 * Create `runnerPrivateDir(id, n)` 0700, one level at a time (no recursive
 * mkdir, no symlink followed). Only the leaf must be new: a leftover
 * `runner/<id>` parent (e.g. after a reboot) is fine for attempt dirs.
 */
export function makeRunnerPrivateDir(id: string, n?: number): string {
  const dir = runnerPrivateDir(id, n);
  const parents =
    n === undefined ? [dirname(dir)] : [dirname(dirname(dir)), dirname(dir)];
  for (const p of parents) mkdirReal(p);
  mkdirSync(dir, { mode: 0o700 }); // EEXIST → refuse
  assertRealDir(dir);
  return dir;
}

/** `<store>/runs/<id>`: trusted per-task records (path only, never created). */
export function runsDir(id: string): string {
  assertId(id, "task id");
  return join(orchestratorDir(), "runs", id);
}

function attemptDir(id: string, n: number): string {
  assertAttempt(n);
  return join(runsDir(id), String(n));
}

/**
 * Create `dir` 0700 if missing (parent must exist) and fail closed unless
 * it is a real directory: a symlink is never written through.
 */
export function mkdirReal(dir: string): void {
  try {
    mkdirSync(dir, { mode: 0o700 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  assertRealDir(dir);
}

/** runs/ and runs/<id>/ (and runs/<id>/<n>/ for n), each level checked. */
function makeRunsDir(id: string, n?: number): string {
  existingTaskDir(id); // also creates the store root when missing
  const dir = runsDir(id);
  mkdirReal(dirname(dir));
  mkdirReal(dir);
  if (n === undefined) return dir;
  const sub = attemptDir(id, n);
  mkdirReal(sub);
  return sub;
}

/** Attempt dir of a claimed attempt (real dirs all the way), else NOT_FOUND. */
function claimedAttemptDir(id: string, n: number): string {
  const dir = attemptDir(id, n);
  for (const d of [dirname(dirname(dir)), dirname(dir), dir]) {
    try {
      lstatSync(d);
    } catch {
      throw new CliError("NOT_FOUND", `Attempt ${n} of task ${id} not claimed`);
    }
    assertRealDir(d);
  }
  if (!existsSync(join(dir, "attempt.json"))) {
    throw new CliError("NOT_FOUND", `Attempt ${n} of task ${id} not claimed`);
  }
  return dir;
}

/** runs/<id> when runs/ and runs/<id> are real dirs, else "" (read nothing). */
function readableRunsDir(id: string): string {
  const dir = runsDir(id);
  return isRealDir(dirname(dir)) && isRealDir(dir) ? dir : "";
}

/** Task dir of an existing task, else NOT_FOUND. */
function existingTaskDir(id: string): string {
  const dir = taskDir(id);
  if (!existsSync(join(dir, "task.json"))) {
    throw new CliError("NOT_FOUND", `Task ${id} not found`);
  }
  assertRealDir(dir);
  return dir;
}

/** True when `dir` is a real directory (lstat: a symlink is not). */
function isRealDir(dir: string): boolean {
  try {
    return lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Workers can swap their own store subdirs for symlinks: never write through one. */
export function assertRealDir(dir: string): void {
  if (!isRealDir(dir)) {
    throw new CliError("INTERNAL", `refusing symlinked store dir ${dir}`);
  }
}

/**
 * Bytes of a regular file of at most `max` bytes, else undefined. Workers
 * write their task dir: O_NOFOLLOW refuses a symlink and O_NONBLOCK keeps a
 * planted FIFO from blocking the read (fstat then rejects it).
 */
export function readRegularFile(
  file: string,
  max = MAX_FILE_BYTES,
): Buffer | undefined {
  let fd: number;
  try {
    fd = openSync(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch {
    return undefined;
  }
  try {
    const st = fstatSync(fd);
    return st.isFile() && st.size <= max ? readFileSync(fd) : undefined;
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

function read<T>(file: string): T | undefined {
  const bytes = readRegularFile(file);
  if (!bytes) return undefined;
  try {
    return (JSON.parse(bytes.toString("utf-8")) as T) ?? undefined;
  } catch {
    return undefined;
  }
}

/** The exact bytes createOnce writes for `data`. */
export function serialize(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}

/**
 * Create `file` with `data` only if it does not exist yet: write a unique
 * tmp file in the same dir, then hard-link it into place (atomic, never a
 * partial read). Returns false when the file already existed.
 */
export function createOnce(file: string, data: unknown): boolean {
  return createOnceText(file, serialize(data));
}

/** createOnce for raw text (same tmp + hard-link, mode 0600). */
function createOnceText(file: string, text: string): boolean {
  const dir = dirname(file);
  // lstat, not existsSync: a dangling symlink must not count as missing.
  if (!isRealDir(dir)) {
    try {
      lstatSync(dir);
    } catch {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    assertRealDir(dir);
  }
  const tmp = join(
    dir,
    `.${basename(file)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(tmp, text, {
      encoding: "utf-8",
      mode: 0o600,
    });
    linkSync(tmp, file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // tmp may not exist if the write failed
    }
  }
}

function listIds(dir: string, re: RegExp): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => re.test(n))
      .map((n) => n.slice(0, 8));
  } catch {
    return [];
  }
}

/** True when `iso` is older than `ms`, or is not a valid timestamp. */
export function isOlderThan(iso: string, ms: number): boolean {
  const t = Date.parse(iso);
  return !Number.isFinite(t) || Date.now() - t > ms;
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

// ─── tasks ──────────────────────────────────────────────────────────────

export function createTask(input: {
  provider: Provider;
  prompt: string;
  readOnly: boolean;
  checkout: string;
}): TaskRecord {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    const task: TaskRecord = {
      schemaVersion: 1,
      id,
      provider: input.provider,
      prompt: input.prompt,
      readOnly: input.readOnly,
      checkout: input.checkout,
      createdAt: now(),
    };
    if (createOnce(join(taskDir(id), "task.json"), task)) return task;
  }
  throw new CliError("INTERNAL", "Could not allocate a unique task id");
}

function isDoneOutcome(v: unknown): v is DoneOutcome {
  return v === "succeeded" || v === "failed";
}

/**
 * `latest` is the task's highest claimed attempt (C2a); without one the task
 * is a C1 task and derives from its root runner.json.
 */
function deriveState(
  v: Omit<TaskView, "state">,
  latest?: AttemptEntry,
): TaskState {
  if (v.done && isDoneOutcome(v.done.outcome)) return v.done.outcome;
  if (v.cancel) return "cancelled";
  const r = v.result?.outcome;
  if (isDoneOutcome(r) || r === "cancelled") return r;
  if (latest) return deriveAttemptState(v, latest);
  if (v.runner && isPidAlive(v.runner.pid)) {
    return v.pendingAsks.length > 0 ? "waiting" : "running";
  }
  if (!v.runner && !isOlderThan(v.createdAt, SPAWN_GRACE_MS)) return "queued";
  return "interrupted";
}

/** State of a C2a task from its latest attempt (after done/cancel/result). */
function deriveAttemptState(
  v: Omit<TaskView, "state">,
  latest: AttemptEntry,
): TaskState {
  // No claim n+1 after a pause (latest is the highest n): paused, live or not.
  if (latest.pause) return "paused";
  const runner = latest.runner;
  if (runner && isPidAlive(runner.pid)) {
    return v.pendingAsks.length > 0 ? "waiting" : "running";
  }
  if (!runner) {
    if (!isOlderThan(latest.attempt.createdAt, SPAWN_GRACE_MS)) return "queued";
    // A switch/resume claim whose runner never started: still paused.
    if (latest.attempt.n >= 2) return "paused";
  }
  return "interrupted";
}

function buildView(dir: string): TaskView | undefined {
  const task = read<TaskRecord>(join(dir, "task.json"));
  if (!task || typeof task.id !== "string") return undefined;
  const answers = join(dir, "answers");
  const answered = (qid: string) =>
    isRealDir(answers) && existsSync(join(answers, `${qid}.json`));
  const pendingAsks = listIds(askDir(dir), JSON_ID_RE)
    .filter((qid) => !answered(qid))
    .map((qid) => readAskAt(dir, qid))
    .filter((a): a is AskRecord => !!a && typeof a.question === "string")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const view: Omit<TaskView, "state"> = {
    ...task,
    id: basename(dir),
    pendingAsks,
    runner: read<RunnerRecord>(join(dir, "runner.json")),
    session: read<SessionRecord>(join(dir, "session.json")),
    result: read<ResultRecord>(join(dir, "result.json")),
    done: read<DoneRecord>(join(dir, "done.json")),
    cancel: read<CancelRecord>(join(dir, "cancel.json")),
  };
  const entries = listAttempts(view.id);
  const last = entries[entries.length - 1];
  if (last) {
    view.attempts = entries.map(summarizeAttempt);
    if (last.pause) view.pause = { ...last.pause, n: last.attempt.n };
  }
  for (const k of [
    "runner",
    "session",
    "result",
    "done",
    "cancel",
    "attempts",
    "pause",
  ] as const) {
    if (view[k] === undefined) delete view[k];
  }
  return { ...view, state: deriveState(view, last) };
}

function summarizeAttempt(e: AttemptEntry): AttemptSummary {
  const s: AttemptSummary = {
    n: e.attempt.n,
    provider: e.attempt.provider,
    kind: e.attempt.kind,
  };
  if (e.runner) s.pid = e.runner.pid;
  if (e.session) s.sessionId = e.session.sessionId;
  if (e.session?.transcriptPath) s.transcriptPath = e.session.transcriptPath;
  if (e.pause) {
    s.pause = { resetsAt: e.pause.resetsAt, source: e.pause.source };
  }
  return s;
}

export function readTask(id: string): TaskView {
  const view = buildView(taskDir(id));
  if (!view) throw new CliError("NOT_FOUND", `Task ${id} not found`);
  return view;
}

/** All readable tasks, newest first. */
export function listTasks(): TaskView[] {
  const dir = tasksDir();
  return listIds(dir, ID_RE)
    .map((id) => buildView(join(dir, id)))
    .filter((v): v is TaskView => !!v)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// ─── task facts (one writer each, create-once) ──────────────────────────

/** Returns false when runner.json already existed. */
export function recordRunner(
  id: string,
  data: { pid: number; startedAt: string },
): boolean {
  return createOnce(join(existingTaskDir(id), "runner.json"), {
    schemaVersion: 1,
    pid: data.pid,
    startedAt: data.startedAt,
  });
}

/** Returns false when session.json already existed. */
export function recordSession(
  id: string,
  data: { sessionId: string; transcriptPath?: string },
): boolean {
  return createOnce(join(existingTaskDir(id), "session.json"), {
    schemaVersion: 1,
    ...data,
  });
}

/** Returns false when result.json already existed. */
export function recordResult(
  id: string,
  data: {
    exitCode: number | null;
    outcome: ResultOutcome;
    lastMessage?: string;
    error?: string;
  },
): boolean {
  const record: ResultRecord = {
    schemaVersion: 1,
    exitCode: data.exitCode,
    outcome: data.outcome,
    finishedAt: now(),
  };
  if (data.lastMessage !== undefined)
    record.lastMessage = cap(data.lastMessage);
  if (data.error !== undefined) record.error = cap(data.error);
  return createOnce(join(existingTaskDir(id), "result.json"), record);
}

export function recordDone(
  id: string,
  data: { outcome: DoneOutcome; summary: string; handoff?: string },
): DoneRecord {
  const record: DoneRecord = {
    schemaVersion: 1,
    outcome: data.outcome,
    summary: cap(data.summary),
    finishedAt: now(),
  };
  if (data.handoff !== undefined) record.handoff = cap(data.handoff);
  const dir = existingTaskDir(id);
  if (existsSync(join(dir, "cancel.json"))) {
    throw new CliError("ALREADY_FINISHED", `Task ${id} was cancelled`);
  }
  if (!createOnce(join(dir, "done.json"), record)) {
    throw new CliError("ALREADY_FINISHED", `Task ${id} is already done`);
  }
  return record;
}

export function recordCancel(id: string): CancelRecord {
  const dir = existingTaskDir(id);
  for (const f of ["done.json", "result.json", "cancel.json"]) {
    if (existsSync(join(dir, f))) {
      throw new CliError("ALREADY_FINISHED", `Task ${id} already finished`);
    }
  }
  const record: CancelRecord = { schemaVersion: 1, cancelledAt: now() };
  if (!createOnce(join(dir, "cancel.json"), record)) {
    throw new CliError("ALREADY_FINISHED", `Task ${id} already finished`);
  }
  return record;
}

// ─── runs/<id>/: dispatch and attempts (trusted, create-once) ────────────

/** Returns false when dispatch.json already existed. */
export function recordDispatch(
  id: string,
  data: Pick<DispatchRecord, "taskDigest" | "isGitRepo" | "policy">,
): boolean {
  const record: DispatchRecord = {
    schemaVersion: 1,
    taskDigest: data.taskDigest,
    isGitRepo: data.isGitRepo,
    policy: { ...data.policy, fallback: [...data.policy.fallback] },
    createdAt: now(),
  };
  return createOnce(join(makeRunsDir(id), "dispatch.json"), record);
}

export function readDispatch(id: string): DispatchRecord | undefined {
  const dir = readableRunsDir(id);
  return dir ? read<DispatchRecord>(join(dir, "dispatch.json")) : undefined;
}

/**
 * Claim attempt n (create-once attempt.json). Returns false when attempt n
 * was already claimed: the claim is what keeps two starters apart.
 */
export function claimAttempt(
  id: string,
  data: Omit<AttemptRecord, "schemaVersion" | "createdAt">,
): boolean {
  const record: AttemptRecord = {
    schemaVersion: 1,
    n: data.n,
    provider: data.provider,
    kind: data.kind,
    createdAt: now(),
  };
  if (data.resumeSessionId !== undefined) {
    record.resumeSessionId = data.resumeSessionId;
  }
  if (data.bundle !== undefined) record.bundle = data.bundle;
  return createOnce(join(makeRunsDir(id, data.n), "attempt.json"), record);
}

/** Returns false when the attempt's runner.json already existed. */
export function recordAttemptRunner(
  id: string,
  n: number,
  data: { pid: number; startedAt: string },
): boolean {
  return createOnce(join(claimedAttemptDir(id, n), "runner.json"), {
    schemaVersion: 1,
    pid: data.pid,
    startedAt: data.startedAt,
  });
}

/**
 * Returns false when the attempt's session.json already existed. Throws on a
 * session id that is not safe to resume with (see isSessionId).
 */
export function recordAttemptSession(
  id: string,
  n: number,
  data: { sessionId: string; transcriptPath?: string },
): boolean {
  if (!isSessionId(data.sessionId)) {
    throw new CliError(
      "USAGE",
      `Invalid session id: ${JSON.stringify(String(data.sessionId).slice(0, 200))}`,
    );
  }
  return createOnce(join(claimedAttemptDir(id, n), "session.json"), {
    schemaVersion: 1,
    ...data,
  });
}

/** Returns false when the attempt's pause.json already existed. */
export function recordPause(
  id: string,
  n: number,
  data: Omit<PauseRecord, "schemaVersion" | "createdAt">,
): boolean {
  const record: PauseRecord = {
    schemaVersion: 1,
    provider: data.provider,
    resetsAt: data.resetsAt,
    source: data.source,
    createdAt: now(),
  };
  if (data.lastMessage !== undefined) {
    record.lastMessage = cap(data.lastMessage);
  }
  if (data.error !== undefined) record.error = cap(data.error);
  return createOnce(join(claimedAttemptDir(id, n), "pause.json"), record);
}

/** Returns false when the attempt's context-bundle.md already existed. */
export function writeBundle(id: string, n: number, text: string): boolean {
  return createOnceText(
    join(claimedAttemptDir(id, n), "context-bundle.md"),
    text,
  );
}

/** The context bundle of attempt n, if written. */
export function readBundle(id: string, n: number): string | undefined {
  assertAttempt(n);
  const runs = readableRunsDir(id);
  const dir = runs && join(runs, String(n));
  if (!dir || !isRealDir(dir)) return undefined;
  return readRegularFile(join(dir, "context-bundle.md"))?.toString("utf-8");
}

/**
 * Claimed attempts of a task, sorted by n, with each attempt's runner,
 * session and pause. Empty for C1 tasks (no runs/<id>/) and symlinked dirs.
 */
export function listAttempts(id: string): AttemptEntry[] {
  const runs = readableRunsDir(id);
  if (!runs) return [];
  let names: string[];
  try {
    names = readdirSync(runs);
  } catch {
    return [];
  }
  const entries: AttemptEntry[] = [];
  for (const name of names) {
    if (!ATTEMPT_RE.test(name)) continue;
    const dir = join(runs, name);
    if (!isRealDir(dir)) continue;
    const attempt = read<AttemptRecord>(join(dir, "attempt.json"));
    // Content must agree with its location.
    if (!attempt || attempt.n !== Number(name)) continue;
    const entry: AttemptEntry = { attempt };
    const runner = read<RunnerRecord>(join(dir, "runner.json"));
    const session = read<SessionRecord>(join(dir, "session.json"));
    const pause = read<PauseRecord>(join(dir, "pause.json"));
    if (runner) entry.runner = runner;
    if (session) entry.session = session;
    if (pause) entry.pause = pause;
    entries.push(entry);
  }
  return entries.sort((a, b) => a.attempt.n - b.attempt.n);
}

// ─── asks / answers ─────────────────────────────────────────────────────

/** A task's asks/ dir, or "" (lists nothing) when it is a symlink. */
function askDir(dir: string): string {
  const asks = join(dir, "asks");
  return isRealDir(asks) ? asks : "";
}

/** The ask `qid` of task dir `dir`, unless its own ids disagree with its location. */
function readAskAt(dir: string, qid: string): AskRecord | undefined {
  const asks = askDir(dir);
  if (!asks) return undefined;
  const ask = read<AskRecord>(join(asks, `${qid}.json`));
  if (!ask || typeof ask !== "object") return undefined;
  return ask.qid === qid && ask.taskId === basename(dir) ? ask : undefined;
}

/** Every ask with this qid (scans every task, or just `taskId`; volume is tiny). */
function findAsks(qid: string, taskId?: string): AskRecord[] {
  assertId(qid, "question id");
  const dir = tasksDir();
  const ids = taskId === undefined ? listIds(dir, ID_RE) : [taskId];
  return ids
    .map((id) => readAskAt(taskDir(id), qid))
    .filter((a): a is AskRecord => !!a);
}

/**
 * Find an ask by qid, within `taskId` when given. A qid in several tasks is
 * ambiguous: a worker can plant another task's (readable) qid in its own dir.
 */
export function findAsk(qid: string, taskId?: string): AskRecord | undefined {
  const asks = findAsks(qid, taskId);
  if (asks.length > 1) {
    const ids = asks.map((a) => a.taskId).sort();
    throw new CliError(
      "USAGE",
      `qid ${qid} is ambiguous (tasks ${ids.join(", ")}); pass --task <id>`,
    );
  }
  return asks[0];
}

/** answers/ of the ask's task, or "" (nothing to read) when it is a symlink. */
function answerDir(ask: AskRecord): string {
  const answers = join(taskDir(ask.taskId), "answers");
  return isRealDir(answers) ? answers : "";
}

/** Create an ask, or reuse the most recent ask of this task with the same text. */
export function createAsk(
  taskId: string,
  question: string,
): { qid: string; answer?: string } {
  const dir = existingTaskDir(taskId);
  const text = cap(question);
  const same = listIds(askDir(dir), JSON_ID_RE)
    .map((qid) => readAskAt(dir, qid))
    .filter((a): a is AskRecord => !!a && a.question === text)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (same) {
    const answer = readAnswer(same.qid, taskId);
    return answer === undefined ? { qid: same.qid } : { qid: same.qid, answer };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const qid = newId();
    if (findAsks(qid).length > 0) continue;
    const ask: AskRecord = {
      schemaVersion: 1,
      qid,
      taskId,
      question: text,
      createdAt: now(),
    };
    if (createOnce(join(dir, "asks", `${qid}.json`), ask)) return { qid };
  }
  throw new CliError("INTERNAL", "Could not allocate a unique question id");
}

export function readAnswer(qid: string, taskId?: string): string | undefined {
  const ask = findAsk(qid, taskId);
  const dir = ask && answerDir(ask);
  if (!dir) return undefined;
  const answer = read<AnswerRecord>(join(dir, `${qid}.json`));
  return typeof answer?.answer === "string" ? answer.answer : undefined;
}

export function reply(
  qid: string,
  answer: string,
  taskId?: string,
): AnswerRecord {
  const ask = findAsk(qid, taskId);
  if (!ask) throw new CliError("NOT_FOUND", `Question ${qid} not found`);
  const file = join(existingTaskDir(ask.taskId), "answers", `${qid}.json`);
  const record: AnswerRecord = {
    schemaVersion: 1,
    qid,
    answer,
    answeredAt: now(),
  };
  if (!createOnce(file, record)) {
    throw new CliError("ALREADY_FINISHED", `Question ${qid} already answered`);
  }
  return record;
}
