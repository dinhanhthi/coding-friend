import { randomBytes } from "crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";
import { readJson } from "../json.js";
import { CliError } from "../output.js";
import { orchestratorDir } from "../paths.js";

/**
 * File-backed task store. Every file has exactly one writer and is written
 * once (create-only), so no locks are needed; task state is derived on read.
 */

const ID_RE = /^[a-z0-9]{8}$/;
const JSON_ID_RE = /^[a-z0-9]{8}\.json$/;
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const MAX_TEXT = 4096;

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
  | "interrupted";

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

export interface TaskView extends TaskRecord {
  state: TaskState;
  pendingAsks: AskRecord[];
  runner?: RunnerRecord;
  session?: SessionRecord;
  result?: ResultRecord;
  done?: DoneRecord;
  cancel?: CancelRecord;
}

// ─── helpers ────────────────────────────────────────────────────────────

export function newId(): string {
  return Array.from(randomBytes(8), (b) => ID_CHARS[b % ID_CHARS.length]).join(
    "",
  );
}

function assertId(id: string, kind: "task id" | "question id"): void {
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
function assertRealDir(dir: string): void {
  if (!isRealDir(dir)) {
    throw new CliError("INTERNAL", `refusing symlinked store dir ${dir}`);
  }
}

function read<T>(file: string): T | undefined {
  return readJson<T>(file) ?? undefined;
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
    writeFileSync(tmp, serialize(data), {
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

function deriveState(v: Omit<TaskView, "state">): TaskState {
  if (v.done && isDoneOutcome(v.done.outcome)) return v.done.outcome;
  if (v.cancel) return "cancelled";
  const r = v.result?.outcome;
  if (isDoneOutcome(r) || r === "cancelled") return r;
  if (v.runner && isPidAlive(v.runner.pid)) {
    return v.pendingAsks.length > 0 ? "waiting" : "running";
  }
  if (!v.runner && !isOlderThan(v.createdAt, SPAWN_GRACE_MS)) return "queued";
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
  for (const k of ["runner", "session", "result", "done", "cancel"] as const) {
    if (view[k] === undefined) delete view[k];
  }
  return { ...view, state: deriveState(view) };
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
