import { randomBytes } from "crypto";
import {
  existsSync,
  linkSync,
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
  mkdirSync(root, { recursive: true, mode: 0o700 });
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
  return dir;
}

function read<T>(file: string): T | undefined {
  return readJson<T>(file) ?? undefined;
}

/**
 * Create `file` with `data` only if it does not exist yet: write a unique
 * tmp file in the same dir, then hard-link it into place (atomic, never a
 * partial read). Returns false when the file already existed.
 */
function createOnce(file: string, data: unknown): boolean {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(
    dir,
    `.${basename(file)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", {
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

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
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
  if (!v.runner) return "queued";
  return "interrupted";
}

function buildView(dir: string): TaskView | undefined {
  const task = read<TaskRecord>(join(dir, "task.json"));
  if (!task || typeof task.id !== "string") return undefined;
  const pendingAsks = listIds(join(dir, "asks"), JSON_ID_RE)
    .filter((qid) => !existsSync(join(dir, "answers", `${qid}.json`)))
    .map((qid) => read<AskRecord>(join(dir, "asks", `${qid}.json`)))
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

/** Find an ask by qid alone (scans every task; volume is tiny). */
export function findAsk(qid: string): AskRecord | undefined {
  assertId(qid, "question id");
  const dir = tasksDir();
  for (const id of listIds(dir, ID_RE)) {
    const ask = read<AskRecord>(join(dir, id, "asks", `${qid}.json`));
    // Trust the location, not the file's own ids.
    if (ask && typeof ask === "object") return { ...ask, qid, taskId: id };
  }
  return undefined;
}

function answerFile(ask: AskRecord): string {
  return join(taskDir(ask.taskId), "answers", `${ask.qid}.json`);
}

/** Create an ask, or reuse the most recent ask of this task with the same text. */
export function createAsk(
  taskId: string,
  question: string,
): { qid: string; answer?: string } {
  const dir = existingTaskDir(taskId);
  const text = cap(question);
  const same = listIds(join(dir, "asks"), JSON_ID_RE)
    .map((qid) => read<AskRecord>(join(dir, "asks", `${qid}.json`)))
    .filter((a): a is AskRecord => !!a && a.question === text)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (same) {
    const answer = readAnswer(same.qid);
    return answer === undefined ? { qid: same.qid } : { qid: same.qid, answer };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const qid = newId();
    if (findAsk(qid)) continue;
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

export function readAnswer(qid: string): string | undefined {
  const ask = findAsk(qid);
  if (!ask) return undefined;
  const answer = read<AnswerRecord>(answerFile(ask));
  return typeof answer?.answer === "string" ? answer.answer : undefined;
}

export function reply(qid: string, answer: string): AnswerRecord {
  const ask = findAsk(qid);
  if (!ask) throw new CliError("NOT_FOUND", `Question ${qid} not found`);
  const record: AnswerRecord = {
    schemaVersion: 1,
    qid,
    answer,
    answeredAt: now(),
  };
  if (!createOnce(answerFile(ask), record)) {
    throw new CliError("ALREADY_FINISHED", `Question ${qid} already answered`);
  }
  return record;
}
