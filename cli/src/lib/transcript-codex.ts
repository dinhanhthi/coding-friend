// Best-effort reader of Codex rollout files
// (`<codex>/sessions/YYYY/MM/DD/rollout-<YYYY-MM-DDTHH-MM-SS>-<thread>.jsonl`,
// plus `<codex>/archived_sessions/**`). The line format is internal to Codex
// and changes between versions: anything not recognized is skipped, a file
// with no recognized item is `unsupported`, never a crash.
//
// Allow-list: only `rollout-*.jsonl` under `<codex>/sessions/**` and
// `<codex>/archived_sessions/**` is opened (regular files, never symlinks).
// `.jsonl.zst` files are listed, never decoded. `auth.json`, `config.toml`
// and `history.jsonl` are never touched. Files are found by name only.
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
import { CliError } from "./output.js";
import { codexConfigDir } from "./paths.js";
import type {
  ListOptions,
  ParsedRef,
  ReadOptions,
  SessionSummary,
  Transcript,
  TranscriptProvider,
  Turn,
} from "./transcript.js";

const META_BYTES = 256 * 1024;
const DEFAULT_LIMIT = 50;
const MAX_SCAN = 2000;
/** sessions/YYYY/MM/DD is depth 3; archived_sessions layout is not documented. */
const MAX_DEPTH = 4;
const ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
const STEM_RE = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)$/;
const ICLOUD_RE = /^\.(rollout-.+\.jsonl(?:\.zst)?)\.icloud$/;
const NO_RECORDS = "no recognizable records";
const NO_META = "no session_meta";

interface Entry {
  /** Thread id from the file name (a `_<rollout_id>` suffix stripped). */
  id: string;
  valid: boolean;
  /** Reverted thread file `…-<id>_<rollout_id>.jsonl`. */
  variant: boolean;
  compressed: boolean;
  placeholder: boolean;
  archived: boolean;
  path: string;
  st: Stats;
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

/** Id parts of `rollout-*.jsonl[.zst]`, or null for any other name. */
function parseName(
  name: string,
): Pick<Entry, "id" | "valid" | "variant" | "compressed"> | null {
  if (!name.startsWith("rollout-")) return null;
  const compressed = name.endsWith(".jsonl.zst");
  if (!compressed && !name.endsWith(".jsonl")) return null;
  const stem = name.slice(0, -(compressed ? ".jsonl.zst" : ".jsonl").length);
  const m = STEM_RE.exec(stem);
  if (!m) {
    return {
      id: stem.slice("rollout-".length),
      valid: false,
      variant: false,
      compressed,
    };
  }
  const us = m[1].indexOf("_");
  const id = us === -1 ? m[1] : m[1].slice(0, us);
  return { id, valid: validId(id), variant: us !== -1, compressed };
}

/** As in transcript-claude: the dataless heuristic only applies in a cloud root. */
function codexInCloud(): boolean {
  return cloudRootOf(codexConfigDir(), homedir(), process.platform) !== null;
}

/**
 * Rollout entries under `dir`, name-descending at every level (date dirs are
 * zero-padded and file names start with the timestamp, so newest first).
 * A plain `.jsonl` hides its `.jsonl.zst` sibling.
 */
function* walk(
  dir: string,
  archived: boolean,
  cloud: boolean,
  depth = 0,
): Generator<Entry> {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  names.sort().reverse();
  const plain = new Set(names.filter((n) => n.endsWith(".jsonl")));
  for (const name of names) {
    const icloud = ICLOUD_RE.exec(name);
    const fileName = icloud ? icloud[1] : name;
    const parsed = parseName(fileName);
    if (name.startsWith(".") && !icloud) continue;
    const path = join(dir, name);
    if (!parsed) {
      if (depth < MAX_DEPTH && lstatOrNull(path)?.isDirectory()) {
        yield* walk(path, archived, cloud, depth + 1);
      }
      continue;
    }
    if (icloud && plain.has(fileName)) continue;
    if (parsed.compressed && plain.has(fileName.slice(0, -".zst".length))) {
      continue;
    }
    const st = lstatOrNull(path);
    if (!st || !st.isFile()) continue;
    const placeholder =
      icloud !== null ||
      (cloud && isCloudPlaceholder(name, st, process.platform));
    yield { ...parsed, placeholder, archived, path, st };
  }
}

/** Better file for the same thread id: plain, then exact name, then newest. */
function better(a: Entry, b: Entry): boolean {
  if (a.compressed !== b.compressed) return !a.compressed;
  if (a.variant !== b.variant) return !a.variant;
  return a.st.mtimeMs > b.st.mtimeMs;
}

/** Rollouts of `sessions` then `archived_sessions`, in walk order. */
function* rollouts(): Generator<Entry> {
  const home = codexConfigDir();
  const cloud = codexInCloud();
  yield* walk(join(home, "sessions"), false, cloud);
  yield* walk(join(home, "archived_sessions"), true, cloud);
}

/**
 * Rollouts one per thread id, in walk order. `capped` when the scan stopped
 * at MAX_SCAN files with more left.
 */
function collect(): { entries: Entry[]; capped: boolean } {
  const byKey = new Map<string, Entry>();
  let scanned = 0;
  for (const e of rollouts()) {
    if (scanned >= MAX_SCAN) {
      return { entries: [...byKey.values()], capped: true };
    }
    scanned++;
    const key = e.valid ? e.id : `\0${e.path}`;
    const kept = byKey.get(key);
    if (!kept || better(e, kept)) byKey.set(key, e);
  }
  return { entries: [...byKey.values()], capped: false };
}

/**
 * Best rollout of thread `id` over every file (no MAX_SCAN: `read` must find
 * old and archived threads). Name-only: no file is opened.
 */
function locate(id: string): Entry | undefined {
  let best: Entry | undefined;
  for (const e of rollouts()) {
    if (e.valid && e.id === id && (!best || better(e, best))) best = e;
  }
  return best;
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

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Texts of content items of the given type; `input_image` becomes `[image]`. */
function itemsText(content: unknown, textType: string): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const c of content) {
    const item = asRecord(c);
    if (item?.type === textType && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item?.type === "input_image") {
      parts.push("[image]");
    }
  }
  return parts.join("\n");
}

/** `function_call_output.output`: a string, or items whose `text` is joined. */
function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const o of output) {
    const item = asRecord(o);
    if (typeof item?.text === "string") parts.push(item.text);
  }
  return parts.join("\n");
}

interface Header {
  cwd: string;
  startedAt: string;
  version: string | undefined;
}

function metaHeader(rec: Rec | null): Header | null {
  const payload = asRecord(rec?.payload);
  if (rec?.type !== "session_meta" || !payload) return null;
  return {
    cwd: str(payload.cwd),
    startedAt: str(payload.timestamp) || str(rec.timestamp),
    version:
      typeof payload.cli_version === "string" ? payload.cli_version : undefined,
  };
}

/** Shared state of one parse: turns, header fields and counters. */
class Parser implements Header {
  turns: Turn[] = [];
  skipped = 0;
  recognized = 0;
  cwd = "";
  startedAt = "";
  lastAt = "";
  version: string | undefined;
  private meta = false;
  private tools = new Map<string, Turn & { kind: "tool" }>();

  line(line: string): void {
    const rec = parseLine(line);
    if (!rec) {
      if (line.trim()) this.skipped++;
      return;
    }
    if (typeof rec.timestamp === "string") {
      if (!this.startedAt) this.startedAt = rec.timestamp;
      this.lastAt = rec.timestamp;
    }
    const header = metaHeader(rec);
    if (header) {
      if (!this.meta) {
        this.meta = true;
        this.cwd = header.cwd;
        if (header.startedAt) this.startedAt = header.startedAt;
        this.version = header.version;
      }
      return;
    }
    const payload = asRecord(rec.payload);
    if (rec.type !== "response_item" || !payload) {
      this.skipped++;
      return;
    }
    if (payload.type === "message") this.message(payload);
    else if (payload.type === "function_call") this.call(payload);
    else if (payload.type === "function_call_output") this.output(payload);
    else this.skipped++;
  }

  private message(p: Rec): void {
    const textType =
      p.role === "user"
        ? "input_text"
        : p.role === "assistant"
          ? "output_text"
          : null;
    if (!textType) {
      // developer/system messages are injected context, not the conversation.
      this.skipped++;
      return;
    }
    this.recognized++;
    const text = itemsText(p.content, textType);
    if (text) this.turns.push({ kind: p.role as "user" | "assistant", text });
  }

  private call(p: Rec): void {
    this.recognized++;
    const turn: Turn & { kind: "tool" } = {
      kind: "tool",
      name: str(p.name),
      args: serialize(p.arguments),
    };
    this.turns.push(turn);
    if (typeof p.call_id === "string") this.tools.set(p.call_id, turn);
  }

  private output(p: Rec): void {
    this.recognized++;
    const output = outputText(p.output);
    const id = str(p.call_id);
    const turn = id ? this.tools.get(id) : undefined;
    if (turn && turn.output === undefined) {
      turn.output = output;
      return;
    }
    this.turns.push({ kind: "tool", name: "", args: "", output });
  }
}

function summaryOf(
  e: Entry,
  h: Header | null,
  status: SessionSummary["status"],
  reason?: string,
): SessionSummary {
  const mtime = e.st.mtime.toISOString();
  const cwd = h?.cwd ?? "";
  // Line 1 has no prompt, and the first `user` items are often injected
  // context, so the title is the project folder name.
  const s: SessionSummary = {
    ref: `codex:${e.id}`,
    provider: "codex",
    source: "live",
    title: cwd ? basename(cwd) : "",
    cwd,
    startedAt: h?.startedAt || mtime,
    updatedAt: mtime,
    bytes: e.st.size,
    status,
  };
  if (reason) s.reason = reason;
  if (h?.version !== undefined) s.formatVersion = h.version;
  if (e.archived) s.archived = true;
  return s;
}

/** `session_meta` of line 1 (≤ 256 KB), or null when cut or absent. */
function readMeta(path: string, size: number): Header | null {
  const buf = Buffer.alloc(Math.min(size, META_BYTES));
  const fd = openSync(path, "r");
  let n: number;
  try {
    n = readSync(fd, buf, 0, buf.length, 0);
  } finally {
    closeSync(fd);
  }
  const nl = buf.subarray(0, n).indexOf(0x0a);
  if (nl === -1 && size > n) return null;
  return metaHeader(parseLine(buf.toString("utf8", 0, nl === -1 ? n : nl)));
}

function inRoot(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(root + sep);
}

async function list(
  opts: ListOptions,
): Promise<{ sessions: SessionSummary[]; truncated: boolean }> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const root = opts.projectDir;
  const { entries, capped } = collect();
  const sessions: SessionSummary[] = [];
  for (const e of entries) {
    if (sessions.length >= limit) break;
    // Without a readable cwd a row can't be filtered, so it is dropped under
    // projectDir.
    if (!e.valid) {
      if (!root) sessions.push(summaryOf(e, null, "unsupported", "name"));
      continue;
    }
    if (e.placeholder) {
      if (!root) sessions.push(summaryOf(e, null, "placeholder"));
      continue;
    }
    if (e.compressed) {
      if (!root) sessions.push(summaryOf(e, null, "unsupported", "compressed"));
      continue;
    }
    let h: Header | null;
    try {
      h = readMeta(e.path, e.st.size);
    } catch {
      continue;
    }
    if (!h) {
      if (!root) sessions.push(summaryOf(e, null, "unsupported", NO_META));
      continue;
    }
    if (root && !inRoot(h.cwd, root)) continue;
    sessions.push(summaryOf(e, h, "ok"));
  }
  // Only the scan cap truncates: files were left unscanned before `limit`.
  return { sessions, truncated: capped && sessions.length < limit };
}

async function read(ref: ParsedRef, _opts: ReadOptions): Promise<Transcript> {
  if (ref.kind !== "codex") {
    throw new CliError("INVALID_ARGS", `Not a Codex session ref: ${ref.kind}`);
  }
  const e = validId(ref.id) ? locate(ref.id) : undefined;
  if (!e) {
    throw new CliError("NOT_FOUND", `Codex session not found: ${ref.id}`);
  }
  if (e.placeholder) {
    throw new CliError("NOT_FOUND", `Codex session not downloaded: ${ref.id}`);
  }
  const base = { ref: `codex:${e.id}`, provider: "codex" as const };
  if (e.compressed) {
    const summary = summaryOf(e, null, "unsupported", "compressed");
    return { ...base, summary, turns: [], skipped: 0 };
  }
  const st = lstatOrNull(e.path);
  if (!st || !st.isFile()) {
    throw new CliError("NOT_FOUND", `Codex session not found: ${ref.id}`);
  }
  const p = new Parser();
  const rl = createInterface({
    input: createReadStream(e.path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) p.line(line);
  const ok = p.recognized > 0;
  const entry = { ...e, st };
  const summary = ok
    ? summaryOf(entry, p, "ok")
    : summaryOf(entry, p, "unsupported", NO_RECORDS);
  if (ok && p.lastAt) summary.updatedAt = p.lastAt;
  return {
    ...base,
    summary,
    turns: ok ? p.turns : [],
    skipped: p.skipped,
    formatVersion: p.version,
  };
}

export const codexProvider: TranscriptProvider = { id: "codex", list, read };
