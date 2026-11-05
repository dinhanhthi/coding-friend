// Best-effort reader of Claude Code's on-disk transcripts
// (`<claude>/projects/<project>/<uuid>.jsonl`). The entry format is internal to
// Claude Code and changes between versions: anything not recognized is
// skipped, a file with no recognized record is `unsupported`, never a crash.
//
// Allow-list: only `<claude>/projects/*/*.jsonl` is opened (regular files,
// never symlinks, never `agent-*`, never anything in `<uuid>/tool-results/`).
// Text is returned raw; redaction happens at the command layer.

import {
  closeSync,
  createReadStream,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  type Stats,
} from "fs";
import { homedir } from "os";
import { basename, join, sep } from "path";
import { createInterface } from "readline";

import { cloudRootOf, isCloudPlaceholder } from "./cloud-folders.js";
import { readCompleteLines } from "./jsonl-slice.js";
import { CliError } from "./output.js";
import {
  claudeProjectDirCandidates,
  claudeProjectDirName,
  claudeProjectsDir,
} from "./paths.js";
import type {
  ListOptions,
  ParsedRef,
  ReadOptions,
  SessionSummary,
  Transcript,
  TranscriptProvider,
  Turn,
} from "./transcript.js";

const HEAD_BYTES = 64 * 1024;
/** Fallback scan past the head, for a first record longer than HEAD_BYTES. */
const HEAD_SCAN_BYTES = 4 * 1024 * 1024;
const HEAD_SCAN_CHUNK = 1024 * 1024;
const DEFAULT_LIMIT = 50;
const HEAD_READS_PER_LIMIT = 4;
const ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
const ICLOUD_RE = /^\.(.+)\.jsonl\.icloud$/;
const NO_RECORDS = "no recognizable records";

interface Entry {
  id: string;
  path: string;
  st: Stats;
  /** 0: exact/legacy candidate of projectDir, 1: prefix dir, 2: other. */
  rank: number;
  placeholder: boolean;
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function validId(id: string): boolean {
  return ID_RE.test(id) && id !== "." && id !== "..";
}

/** Real dirs under `<claude>/projects`, ranked against `projectDir` when set. */
function projectDirs(projectDir?: string): { dir: string; rank: number }[] {
  const base = claudeProjectsDir();
  let names: string[];
  try {
    names = readdirSync(base);
  } catch {
    return [];
  }
  const exact = projectDir
    ? new Set(claudeProjectDirCandidates(projectDir))
    : null;
  const name = projectDir ? claudeProjectDirName(projectDir).name : "";
  const out: { dir: string; rank: number }[] = [];
  for (const n of names) {
    const dir = join(base, n);
    if (!lstatOrNull(dir)?.isDirectory()) continue;
    let rank = 2;
    if (exact?.has(dir)) rank = 0;
    else if (exact && n.startsWith(name + "-")) rank = 1;
    out.push({ dir, rank });
  }
  return out;
}

/**
 * The darwin dataless heuristic can flag tiny compressed files, so (as in
 * learn-notes) it only applies when the Claude dir sits in a cloud root. The
 * `.name.icloud` rule always applies.
 */
function claudeInCloud(): boolean {
  return cloudRootOf(claudeProjectsDir(), homedir(), process.platform) !== null;
}

/** Transcript entries of one project dir: `*.jsonl` and iCloud placeholders. */
function dirEntries(dir: string, rank: number, cloud: boolean): Entry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const name of names) {
    const icloud = ICLOUD_RE.exec(name);
    const id = icloud ? icloud[1] : name.slice(0, -".jsonl".length);
    if (!icloud && (name.startsWith(".") || !name.endsWith(".jsonl"))) continue;
    if (id.startsWith("agent-")) continue;
    const path = join(dir, name);
    const st = lstatOrNull(path);
    if (!st || !st.isFile()) continue;
    const placeholder =
      icloud !== null ||
      (cloud && isCloudPlaceholder(name, st, process.platform));
    out.push({ id, path, st, rank, placeholder });
  }
  return out;
}

/** Better copy of the same uuid: lower rank first, then newest mtime. */
function better(a: Entry, b: Entry): boolean {
  if (a.rank !== b.rank) return a.rank < b.rank;
  return a.st.mtimeMs > b.st.mtimeMs;
}

function collect(projectDir?: string): Entry[] {
  const cloud = claudeInCloud();
  const byId = new Map<string, Entry>();
  for (const { dir, rank } of projectDirs(projectDir)) {
    if (projectDir && rank === 2) continue;
    for (const e of dirEntries(dir, rank, cloud)) {
      const kept = byId.get(e.id);
      if (!kept || better(e, kept)) byId.set(e.id, e);
    }
  }
  return [...byId.values()].sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
}

/**
 * File of `claude:<uuid>` under `<claude>/projects/*`: with `projectDir`, a
 * copy in that project's dirs wins, else the newest mtime. Null when absent.
 * `placeholder` copies must not be opened.
 */
export function locateClaudeTranscript(
  uuid: string,
  opts: { projectDir?: string } = {},
): { path: string; placeholder: boolean } | null {
  if (!validId(uuid) || uuid.startsWith("agent-")) return null;
  const cloud = claudeInCloud();
  let best: Entry | null = null;
  for (const { dir, rank } of projectDirs(opts.projectDir)) {
    for (const name of [`${uuid}.jsonl`, `.${uuid}.jsonl.icloud`]) {
      const path = join(dir, name);
      const st = lstatOrNull(path);
      if (!st || !st.isFile()) continue;
      const placeholder =
        name.endsWith(".icloud") ||
        (cloud && isCloudPlaceholder(name, st, process.platform));
      const e: Entry = { id: uuid, path, st, rank, placeholder };
      if (!best || better(e, best)) best = e;
    }
  }
  return best ? { path: best.path, placeholder: best.placeholder } : null;
}

type Rec = Record<string, unknown>;

function asRecord(v: unknown): Rec | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Rec)
    : null;
}

function parseLine(line: string): Rec | null {
  if (!line.trim()) return null;
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return null;
  }
}

function serialize(input: unknown): string {
  if (typeof input === "string") return input;
  if (input === undefined) return "";
  try {
    return JSON.stringify(input) ?? "";
  } catch {
    return String(input);
  }
}

/** Text of a string or an array of `text` / `image` blocks. */
function blocksText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    const block = asRecord(b);
    if (block?.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    } else if (block?.type === "image") {
      parts.push("[image]");
    }
  }
  return parts.join("\n");
}

/** Shared state of one parse: turns, header fields and counters. */
class Parser {
  turns: Turn[] = [];
  skipped = 0;
  recognized = 0;
  title = "";
  cwd = "";
  startedAt = "";
  lastAt = "";
  version: string | undefined;
  private tools = new Map<string, Turn & { kind: "tool" }>();

  line(line: string): void {
    const rec = parseLine(line);
    if (!rec) {
      if (line.trim()) this.skipped++;
      return;
    }
    const message = asRecord(rec.message);
    const known =
      (rec.type === "user" || rec.type === "assistant") && message !== null;
    if (!known || rec.isSidechain === true || rec.isMeta === true) {
      this.skipped++;
      return;
    }
    this.recognized++;
    if (!this.cwd && typeof rec.cwd === "string") this.cwd = rec.cwd;
    if (this.version === undefined && typeof rec.version === "string") {
      this.version = rec.version;
    }
    if (typeof rec.timestamp === "string") {
      if (!this.startedAt) this.startedAt = rec.timestamp;
      this.lastAt = rec.timestamp;
    }
    if (rec.type === "user") this.user(message.content);
    else this.assistant(message.content);
  }

  private user(content: unknown): void {
    const text: string[] = [];
    const blocks = typeof content === "string" ? [content] : content;
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (typeof b === "string") {
        text.push(b);
        continue;
      }
      const block = asRecord(b);
      if (block?.type === "tool_result") {
        this.toolResult(block);
      } else {
        const t = blocksText([b]);
        if (t) text.push(t);
      }
    }
    const joined = text.join("\n");
    if (!joined) return;
    if (!this.title) this.title = joined;
    this.turns.push({ kind: "user", text: joined });
  }

  private toolResult(block: Rec): void {
    const output = blocksText(block.content);
    const id = typeof block.tool_use_id === "string" ? block.tool_use_id : "";
    const turn = id ? this.tools.get(id) : undefined;
    if (turn && turn.output === undefined) {
      turn.output = output;
      return;
    }
    this.turns.push({ kind: "tool", name: "", args: "", output });
  }

  private assistant(content: unknown): void {
    if (typeof content === "string") {
      if (content) this.turns.push({ kind: "assistant", text: content });
      return;
    }
    if (!Array.isArray(content)) return;
    let text: string[] = [];
    const flush = (): void => {
      if (text.length) {
        this.turns.push({ kind: "assistant", text: text.join("\n") });
      }
      text = [];
    };
    for (const b of content) {
      const block = asRecord(b);
      if (block?.type === "text" && typeof block.text === "string") {
        if (block.text) text.push(block.text);
      } else if (block?.type === "tool_use") {
        flush();
        const turn: Turn & { kind: "tool" } = {
          kind: "tool",
          name: typeof block.name === "string" ? block.name : "",
          args: serialize(block.input),
        };
        this.turns.push(turn);
        if (typeof block.id === "string") this.tools.set(block.id, turn);
      }
    }
    flush();
  }
}

function summaryOf(
  ref: string,
  st: Stats,
  p: Parser | null,
  status: SessionSummary["status"],
  reason?: string,
): SessionSummary {
  const mtime = st.mtime.toISOString();
  const s: SessionSummary = {
    ref,
    provider: "claude",
    source: "live",
    title: p?.title ?? "",
    cwd: p?.cwd ?? "",
    startedAt: p?.startedAt || mtime,
    updatedAt: mtime,
    bytes: st.size,
    status,
  };
  if (reason) s.reason = reason;
  if (p?.version !== undefined) s.formatVersion = p.version;
  return s;
}

/**
 * Parse the first ≤ 64 KB; a cut last line is dropped. When that head has no
 * recognized record (e.g. a first user line with an inline image), keep
 * reading in chunks up to 4 MiB; stops after the chunk holding the first
 * recognized record.
 */
function readHead(path: string, size: number): Parser {
  const p = new Parser();
  const fd = openSync(path, "r");
  try {
    let pos = 0;
    let rest = Buffer.alloc(0);
    for (;;) {
      const chunk = pos === 0 ? HEAD_BYTES : HEAD_SCAN_CHUNK;
      const buf = Buffer.alloc(
        Math.min(size, HEAD_SCAN_BYTES, pos + chunk) - pos,
      );
      const n = readSync(fd, buf, 0, buf.length, pos);
      pos += n;
      let data = Buffer.concat([rest, buf.subarray(0, n)]);
      const eof = n === 0 || pos >= size;
      if (eof) data = Buffer.concat([data, Buffer.from("\n")]);
      let start = 0;
      let nl = data.indexOf(0x0a);
      while (nl !== -1) {
        p.line(data.toString("utf8", start, nl));
        start = nl + 1;
        nl = data.indexOf(0x0a, start);
      }
      rest = data.subarray(start);
      if (eof || p.recognized > 0 || pos >= HEAD_SCAN_BYTES) break;
    }
  } finally {
    closeSync(fd);
  }
  return p;
}

/** `cwd` from the head of a Claude transcript; "" when absent or unreadable. */
export function readClaudeHeadCwd(path: string): string {
  const st = lstatOrNull(path);
  if (!st || !st.isFile()) return "";
  try {
    return readHead(path, st.size).cwd;
  } catch {
    return "";
  }
}

function inRoot(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(root + sep);
}

async function list(
  opts: ListOptions,
): Promise<{ sessions: SessionSummary[]; truncated: boolean }> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const root = opts.projectDir;
  const maxReads = HEAD_READS_PER_LIMIT * limit;
  const entries = collect(root);
  const sessions: SessionSummary[] = [];
  let reads = 0;
  let i = 0;
  for (; i < entries.length; i++) {
    if (sessions.length >= limit || reads >= maxReads) break;
    const e = entries[i];
    const ref = `claude:${e.id}`;
    // Without a readable cwd a row can't be filtered, so under projectDir it
    // is kept only from the project's own (exact or legacy) dirs.
    const unfiltered = !root || e.rank === 0;
    if (!validId(e.id)) {
      if (unfiltered)
        sessions.push(summaryOf(ref, e.st, null, "unsupported", "name"));
      continue;
    }
    if (e.placeholder) {
      if (unfiltered) sessions.push(summaryOf(ref, e.st, null, "placeholder"));
      continue;
    }
    reads++;
    let p: Parser;
    try {
      p = readHead(e.path, e.st.size);
    } catch {
      continue;
    }
    if (p.recognized === 0) {
      if (unfiltered) {
        sessions.push(summaryOf(ref, e.st, p, "unsupported", NO_RECORDS));
      }
      continue;
    }
    if (root && !inRoot(p.cwd, root)) continue;
    sessions.push(summaryOf(ref, e.st, p, "ok"));
  }
  // Only the head-read cap truncates: files were left unread before `limit`.
  return {
    sessions,
    truncated: i < entries.length && sessions.length < limit,
  };
}

/**
 * Parse a Claude transcript at an explicit path (saved sessions). Symlinks and
 * non-files are refused; a file with no recognized record comes back
 * `unsupported`, never as a throw.
 */
export async function readTranscriptFile(
  path: string,
  ref = `claude:${basename(path, ".jsonl")}`,
): Promise<Transcript> {
  const st = lstatOrNull(path);
  if (!st || !st.isFile()) {
    throw new CliError("NOT_FOUND", `Session transcript not found: ${ref}`);
  }
  const p = new Parser();
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) p.line(line);
  const ok = p.recognized > 0;
  const summary = ok
    ? summaryOf(ref, st, p, "ok")
    : summaryOf(ref, st, p, "unsupported", NO_RECORDS);
  if (ok && p.lastAt) summary.updatedAt = p.lastAt;
  return {
    ref,
    provider: "claude",
    summary,
    turns: ok ? p.turns : [],
    skipped: p.skipped,
    formatVersion: p.version,
  };
}

/** Turns of one byte-offset slice of a transcript; see readCompleteLines. */
export interface TranscriptSlice {
  turns: Turn[];
  nextOffset: number;
  size: number;
  /** Lines over LINE_MAX_BYTES passed over (not the non-turn lines). */
  skipped: number;
  /** More complete lines may follow `nextOffset`. */
  truncated: boolean;
}

/**
 * Turns from the complete lines of `path` after `offset` (at most `maxBytes`
 * raw bytes). Parser state does not carry over between slices, so a tool
 * result whose tool_use was in an earlier slice (an orphan) is dropped.
 */
export function readClaudeTranscriptSlice(
  path: string,
  offset: number,
  maxBytes: number,
): TranscriptSlice {
  const st = lstatOrNull(path);
  if (!st || !st.isFile()) {
    throw new CliError("NOT_FOUND", "Session transcript not found");
  }
  const slice = readCompleteLines(path, offset, maxBytes);
  const p = new Parser();
  for (const line of slice.lines) p.line(line);
  return {
    turns: p.turns.filter((t) => t.kind !== "tool" || t.name !== ""),
    nextOffset: slice.nextOffset,
    size: slice.size,
    skipped: slice.skipped,
    truncated: slice.truncated,
  };
}

async function read(ref: ParsedRef, opts: ReadOptions): Promise<Transcript> {
  if (ref.kind !== "claude") {
    throw new CliError("INVALID_ARGS", `Not a Claude session ref: ${ref.kind}`);
  }
  const found = locateClaudeTranscript(ref.id, opts);
  if (!found) {
    throw new CliError("NOT_FOUND", `Claude session not found: ${ref.id}`);
  }
  if (found.placeholder) {
    throw new CliError("NOT_FOUND", `Claude session not downloaded: ${ref.id}`);
  }
  return readTranscriptFile(found.path, `claude:${ref.id}`);
}

export const claudeProvider: TranscriptProvider = { id: "claude", list, read };
