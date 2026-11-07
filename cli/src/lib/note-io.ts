import { createHash, randomBytes } from "crypto";
import {
  chmodSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "fs";
import { basename, dirname, join, sep } from "path";
import { parse } from "yaml";
import { CliError } from "./output.js";

/** Notes (memory, learn) and stdin bodies are capped at 1 MiB. */
export const MAX_NOTE_BYTES = 1024 * 1024;

const BOM = "﻿";
// Control chars, NUL included, plus DEL.
const CONTROL_RE = /[\x00-\x1f\x7f]/;

export interface Note {
  /** Parsed YAML (YAML 1.2 core schema, so dates stay `YYYY-MM-DD` strings); `{}` when absent or unparseable. */
  frontmatter: Record<string, unknown>;
  /** The whole frontmatter block, from the opening `---` through the closing `---` line and its line ending; `""` when absent. */
  frontmatterRaw: string;
  /** Body after the frontmatter block (BOM removed). */
  content: string;
  /** sha256 (hex) of the raw file bytes. */
  sha256: string;
  mtime: string;
}

interface Split {
  bom: string;
  /** Full frontmatter block incl. delimiters, or null when the file has none. */
  block: string | null;
  /** YAML between the delimiters. */
  yaml: string;
  body: string;
  eol: "\n" | "\r\n";
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function validSegment(s: string): boolean {
  return (
    s.trim() !== "" &&
    s !== "." &&
    s !== ".." &&
    !s.startsWith("-") &&
    !s.includes("/") &&
    !s.includes("\\") &&
    !CONTROL_RE.test(s)
  );
}

/**
 * Resolve `<category>/<slug>` to the real path of `<root>/<category>/<slug>.md`.
 * Bad grammar → INVALID_ARGS; missing → NOT_FOUND; outside realpath(root) → INVALID_VALUE.
 */
export function resolveNotePath(root: string, id: string): string {
  const segments = id.split("/");
  if (segments.length !== 2 || !segments.every(validSegment)) {
    throw new CliError(
      "INVALID_ARGS",
      `Invalid note id (expected <category>/<slug>): ${JSON.stringify(id)}`,
    );
  }
  const [category, slug] = segments;
  let realRoot: string;
  let real: string;
  try {
    realRoot = realpathSync(root);
    real = realpathSync(join(root, category, `${slug}.md`));
  } catch {
    throw new CliError("NOT_FOUND", `Note not found: ${id}`);
  }
  if (!real.startsWith(realRoot + sep)) {
    throw new CliError("INVALID_VALUE", `Note is outside its root: ${id}`);
  }
  if (!statSync(real).isFile()) {
    throw new CliError("NOT_FOUND", `Note not found: ${id}`);
  }
  return real;
}

function readRaw(path: string): { buf: Buffer; st: Stats; sha: string } {
  let st: Stats;
  try {
    st = statSync(path);
  } catch {
    throw new CliError("NOT_FOUND", `Note not found: ${path}`);
  }
  if (!st.isFile()) throw new CliError("NOT_FOUND", `Not a file: ${path}`);
  if (st.size > MAX_NOTE_BYTES) {
    throw new CliError("INVALID_VALUE", `Note is larger than 1 MiB: ${path}`);
  }
  const buf = readFileSync(path);
  if (buf.length > MAX_NOTE_BYTES) {
    throw new CliError("INVALID_VALUE", `Note is larger than 1 MiB: ${path}`);
  }
  return { buf, st, sha: sha256(buf) };
}

function checkMatch(path: string, actual: string, ifMatch: string): void {
  if (actual !== ifMatch.trim().toLowerCase()) {
    throw new CliError(
      "CONFLICT",
      `Note changed since it was read (sha256 mismatch): ${path}`,
    );
  }
}

/**
 * Split text into BOM, frontmatter block and body. The block opens with `---`
 * on the first line and closes at the next line that is exactly `---`.
 * An opening `---` without a closing line is `unterminated`.
 */
function split(text: string): Split | "unterminated" {
  const bom = text.startsWith(BOM) ? BOM : "";
  const rest = text.slice(bom.length);
  const open = /^---(\r?\n)/.exec(rest);
  if (!open) {
    const eol = /\r?\n/.exec(rest)?.[0] === "\r\n" ? "\r\n" : "\n";
    return { bom, block: null, yaml: "", body: rest, eol };
  }
  const eol = open[1] === "\r\n" ? "\r\n" : "\n";
  // Closing delimiter: a whole line `---` (multiline `^`, so never mid-line).
  const close = /^---[ \t]*(\r?\n|$)/m;
  const after = rest.slice(open[0].length);
  const m = close.exec(after);
  if (!m) return "unterminated";
  const end = open[0].length + m.index + m[0].length;
  return {
    bom,
    block: rest.slice(0, end),
    yaml: after.slice(0, m.index),
    body: rest.slice(end),
    eol,
  };
}

function parseYaml(src: string): Record<string, unknown> {
  try {
    const data: unknown = parse(src, { logLevel: "error" });
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function readNote(path: string): Note {
  const { buf, st, sha } = readRaw(path);
  const text = buf.toString("utf8");
  const s = split(text);
  const mtime = st.mtime.toISOString();
  if (s === "unterminated") {
    return {
      frontmatter: {},
      frontmatterRaw: "",
      content: text.replace(/^﻿/, ""),
      sha256: sha,
      mtime,
    };
  }
  return {
    frontmatter: parseYaml(s.yaml),
    frontmatterRaw: s.block ?? "",
    content: s.body,
    sha256: sha,
    mtime,
  };
}

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Set the top-level `updated:` value (keeping its quote style), or add the line before the closing `---`. */
function setUpdated(block: string, eol: string, today: string): string {
  const line = /^(updated:[ \t]*)(.*?)([ \t]+#.*)?(\r?)$/m;
  const m = line.exec(block);
  if (m) {
    const q = m[2].startsWith('"') ? '"' : m[2].startsWith("'") ? "'" : "";
    const key = /\s$/.test(m[1]) ? m[1] : `${m[1]} `;
    const repl = `${key}${q}${today}${q}${m[3] ?? ""}${m[4]}`;
    return block.slice(0, m.index) + repl + block.slice(m.index + m[0].length);
  }
  const close = block.lastIndexOf("---");
  return `${block.slice(0, close)}updated: ${today}${eol}${block.slice(close)}`;
}

/** Write via a temp file in the same dir + rename; the temp is removed on failure. */
export function atomicWrite(path: string, data: Buffer, mode: number): void {
  const tmp = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(tmp, data, { flag: "wx", mode });
    chmodSync(tmp, mode);
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // tmp may not exist
    }
    throw err;
  }
}

/**
 * Replace the body of a note. Refuses with CONFLICT if the file's sha256 is
 * not `ifMatch`. The frontmatter block stays byte-for-byte, except `updated:`
 * (set to today, added if missing). Keeps BOM, CRLF/LF and file mode.
 */
export function replaceBody(
  path: string,
  newBody: string,
  ifMatch: string,
): { sha256: string; updated: string } {
  const { buf, st, sha } = readRaw(path);
  checkMatch(path, sha, ifMatch);

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      buf,
    );
  } catch {
    throw new CliError("INVALID_VALUE", `Note is not valid UTF-8: ${path}`);
  }
  const s = split(text);
  if (s === "unterminated") {
    throw new CliError(
      "INVALID_VALUE",
      `Note has an unterminated frontmatter block: ${path}`,
    );
  }

  const today = localToday();
  const body = newBody.replace(/^﻿/, "").split(/\r?\n/).join(s.eol);
  let head = "";
  if (s.block !== null) {
    head = setUpdated(s.block, s.eol, today);
    if (body && !head.endsWith("\n")) head += s.eol;
  }
  const out = Buffer.from(s.bom + head + body, "utf8");
  atomicWrite(path, out, st.mode & 0o777);
  return { sha256: sha256(out), updated: today };
}

/** Delete a note; with `ifMatch`, refuses with CONFLICT if the file changed. */
export function deleteNote(path: string, ifMatch?: string): void {
  if (ifMatch !== undefined) checkMatch(path, readRaw(path).sha, ifMatch);
  try {
    unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("NOT_FOUND", `Note not found: ${path}`);
    }
    throw err;
  }
}

/** Read a note body piped on stdin (strict UTF-8, at most `max` bytes). */
export async function readBodyFromStdin(
  max: number = MAX_NOTE_BYTES,
  stream: NodeJS.ReadStream = process.stdin,
): Promise<string> {
  if (stream.isTTY) {
    throw new CliError("INVALID_ARGS", "--stdin needs the body piped on stdin");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += b.length;
    if (size > max) {
      stream.destroy();
      throw new CliError("INVALID_VALUE", "body too large");
    }
    chunks.push(b);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw new CliError("INVALID_VALUE", "body is not valid UTF-8");
  }
}
