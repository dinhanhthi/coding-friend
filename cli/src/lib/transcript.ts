// Provider interface, session refs and redacted rendering for `cf session
// list|show|export` (B2). Pure module: providers (transcript-claude.ts,
// transcript-codex.ts) do the file I/O, this file only shapes and redacts.
//
// Rule: truncation always runs AFTER redaction, never before, so a cut can
// never split a secret and leave its tail unmatched.

import { CliError } from "./output.js";
import { redactText, runExportPipeline, type ExtraFilter } from "./redact.js";
import type { FilterStatus } from "./redact.js";

export const TOOL_ARGS_MAX_CHARS = 120;
export const TOOL_NAME_MAX_CHARS = 120;
export const TOOL_OUTPUT_MAX_CHARS = 2000;
export const TURN_MAX_BYTES = 1024 * 1024;
export const PAGE_MAX_BYTES = 4 * 1024 * 1024;
export const MARKDOWN_MAX_BYTES = 4 * 1024 * 1024;

export type ProviderId = "claude" | "codex";
export type RefKind = "claude" | "codex" | "saved" | "legacy";

export interface SessionSummary {
  ref: string;
  provider: ProviderId;
  source: "live" | "saved" | "legacy";
  title: string;
  cwd: string;
  startedAt: string;
  updatedAt: string;
  bytes: number;
  status: "ok" | "unsupported" | "placeholder";
  reason?: string;
  formatVersion?: string;
  warning?: string;
  archived?: boolean;
  saved?: { label: string; savedAt: string; machine: string };
}

export type Turn =
  | { kind: "user" | "assistant"; text: string }
  | { kind: "tool"; name: string; args: string; output?: string };

/**
 * Raw (unredacted) transcript as parsed by a provider. For tool turns `args`
 * holds the raw input serialized as a string; renderers summarize it.
 */
export interface Transcript {
  ref: string;
  provider: ProviderId;
  summary: SessionSummary;
  turns: Turn[];
  /** Records the parser did not recognize or ignored on purpose. */
  skipped: number;
  formatVersion?: string;
}

export interface ListOptions {
  projectDir?: string;
  limit?: number;
}

export interface ReadOptions {
  projectDir?: string;
}

export interface TranscriptProvider {
  id: string;
  list(
    opts: ListOptions,
  ): Promise<{ sessions: SessionSummary[]; truncated: boolean }>;
  read(ref: ParsedRef, opts: ReadOptions): Promise<Transcript>;
}

export interface ParsedRef {
  kind: RefKind;
  id: string;
}

export interface Redactions {
  total: number;
  byKind: Record<string, number>;
}

const REF_RE = /^(claude|codex|saved|legacy):([A-Za-z0-9._-]{1,200})$/;

/** Parse `claude:<uuid>`, `codex:<id>`, `saved:<folder>` or `legacy:<folder>`. */
export function parseRef(s: string): ParsedRef {
  const m = typeof s === "string" ? REF_RE.exec(s) : null;
  if (!m || m[2] === "." || m[2] === "..") {
    const shown = String(s).slice(0, 80);
    throw new CliError(
      "INVALID_ARGS",
      `Invalid session ref "${shown}": expected claude:<id>, codex:<id>, saved:<folder> or legacy:<folder>`,
    );
  }
  return { kind: m[1] as RefKind, id: m[2] };
}

function addCounts(
  into: Record<string, number>,
  from: Record<string, number>,
): void {
  for (const [kind, n] of Object.entries(from)) {
    into[kind] = (into[kind] ?? 0) + n;
  }
}

function toRedactions(byKind: Record<string, number>): Redactions {
  const total = Object.values(byKind).reduce((a, b) => a + b, 0);
  return { total, byKind };
}

const MARKER_START = "[REDACTED:";
const ELLIPSIS = "…";

/**
 * Cut `s` to at most `max` UTF-16 code units, ellipsis included. Never splits
 * a surrogate pair or a `[REDACTED:<kind>]` marker.
 */
export function truncateChars(s: string, max: number): string {
  if (s.length <= max) return s;
  let n = Math.max(0, max - ELLIPSIS.length);
  if (n > 0 && isHighSurrogate(s.charCodeAt(n - 1))) n--;
  const open = n > 0 ? s.lastIndexOf(MARKER_START, n - 1) : -1;
  if (open !== -1) {
    const close = s.indexOf("]", open);
    if (close === -1 || close >= n) n = open;
  }
  // A cut that ends on a partial `[REDAC` would be counted again by a later
  // redaction pass, so drop that prefix too.
  for (let k = Math.min(n, MARKER_START.length - 1); k > 0; k--) {
    if (s.startsWith(MARKER_START.slice(0, k), n - k)) {
      n -= k;
      break;
    }
  }
  return s.slice(0, n) + ELLIPSIS;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Longest prefix of `s` whose UTF-8 encoding fits in `maxBytes`. */
export function truncateUtf8(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s) <= maxBytes) return s;
  // Each code unit is at most 3 UTF-8 bytes, so the answer is in [lo, hi].
  let lo = Math.min(s.length, Math.floor(maxBytes / 3));
  let hi = Math.min(s.length, maxBytes);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (Buffer.byteLength(s.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  let n = lo;
  if (n > 0 && isHighSurrogate(s.charCodeAt(n - 1))) n--;
  return s.slice(0, n);
}

function serializeInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (input === undefined) return "";
  try {
    return JSON.stringify(input) ?? "";
  } catch {
    return String(input);
  }
}

function summarizeTool(
  input: unknown,
  home?: string,
): { text: string; counts: Record<string, number> } {
  // A string is passed as is (Codex arguments are already a JSON string);
  // anything else is serialized. Redact first, then cut.
  const r = redactText(serializeInput(input), { home });
  return { text: truncateChars(r.text, TOOL_ARGS_MAX_CHARS), counts: r.counts };
}

/**
 * Short, redacted one-line summary of a tool call's input (≤ 120 chars).
 * `name` is part of the signature for per-tool summaries; the generic summary
 * does not use it.
 */
export function toolSummary(
  _name: string,
  input: unknown,
  home?: string,
): string {
  return summarizeTool(input, home).text;
}

/**
 * Redact turns for `session show`. Call it on the requested slice only
 * (`turns.slice(offset, offset + limit)`), then pass the result to
 * `pageTurns`. Tool output is dropped unless `includeToolOutput`, otherwise
 * redacted and cut to 2000 chars.
 */
export function renderTurnsForShow(
  turns: Turn[],
  opts: { includeToolOutput: boolean; home?: string },
): { turns: Turn[]; redactions: Redactions } {
  const counts: Record<string, number> = {};
  const redact = (s: string): string => {
    const r = redactText(s, { home: opts.home });
    addCounts(counts, r.counts);
    return r.text;
  };
  const out = turns.map((turn): Turn => {
    if (turn.kind !== "tool") {
      return { kind: turn.kind, text: redact(turn.text) };
    }
    const args = summarizeTool(turn.args, opts.home);
    addCounts(counts, args.counts);
    const rendered: Turn = {
      kind: "tool",
      name: truncateChars(redact(turn.name), TOOL_NAME_MAX_CHARS),
      args: args.text,
    };
    if (opts.includeToolOutput && turn.output !== undefined) {
      rendered.output = truncateChars(
        redact(turn.output),
        TOOL_OUTPUT_MAX_CHARS,
      );
    }
    return rendered;
  });
  return { turns: out, redactions: toRedactions(counts) };
}

function turnBytes(turn: Turn): number {
  return Buffer.byteLength(JSON.stringify(turn));
}

const CUT_NOTE = "\n[truncated]";

/** Cut the long field of an already redacted turn so it serializes ≤ 1 MiB. */
function cutTurn(turn: Turn): { turn: Turn; cut: boolean } {
  let bytes = turnBytes(turn);
  if (bytes <= TURN_MAX_BYTES) return { turn, cut: false };
  const body = turn.kind === "tool" ? (turn.output ?? "") : turn.text;
  let target = Buffer.byteLength(body);
  let cur: Turn = turn;
  // Removing k UTF-8 bytes of text removes at least k JSON bytes, so this
  // converges in one or two rounds; the bound is a safety net.
  for (let i = 0; i < 8 && bytes > TURN_MAX_BYTES; i++) {
    target = Math.max(
      0,
      target - (bytes - TURN_MAX_BYTES) - Buffer.byteLength(CUT_NOTE) - 16,
    );
    const kept = truncateUtf8(body, target) + CUT_NOTE;
    cur =
      cur.kind === "tool" ? { ...cur, output: kept } : { ...cur, text: kept };
    bytes = turnBytes(cur);
  }
  return { turn: cur, cut: true };
}

/**
 * Byte budget of one `show` page. `turns` are already redacted and start at
 * `offset` in the full transcript of `total` turns. A single turn above
 * 1 MiB (serialized) is cut; turns are added while the running total of
 * serialized UTF-8 bytes stays ≤ 4 MiB. The first turn always fits.
 * `nextOffset` points at the first turn not returned, or is null when the
 * page reaches the end of the transcript.
 */
export function pageTurns(
  turns: Turn[],
  opts: { offset: number; total: number },
): { turns: Turn[]; truncated: boolean; nextOffset: number | null } {
  const page: Turn[] = [];
  let running = 0;
  let truncated = false;
  for (const raw of turns) {
    const { turn, cut } = cutTurn(raw);
    const bytes = turnBytes(turn);
    if (page.length > 0 && running + bytes > PAGE_MAX_BYTES) {
      truncated = true;
      break;
    }
    if (cut) truncated = true;
    page.push(turn);
    running += bytes;
  }
  const next = opts.offset + page.length;
  return {
    turns: page,
    truncated,
    nextOffset: next < opts.total ? next : null,
  };
}

function fenceFor(body: string): string {
  let longest = 0;
  for (const m of body.matchAll(/`+/g)) {
    longest = Math.max(longest, m[0].length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

export interface RenderedMarkdown {
  /** At most 4 MiB of UTF-8, cut after redaction. */
  markdown: string;
  /** Untruncated Markdown: printed by human export, later also by `--out`. */
  fullMarkdown: string;
  /** UTF-8 bytes of `fullMarkdown`. */
  bytes: number;
  truncated: boolean;
  /** Counted on the full Markdown. */
  redactions: Redactions;
  filter: { name: string | null; status: FilterStatus };
}

type Piece =
  | { kind: "user" | "assistant"; seg: number }
  | { kind: "tool"; name: number; args: number; output?: number };

/**
 * Export pipeline steps 1-6: regex redaction and optional filter on every
 * content segment, cut after redaction, assemble Markdown, then one more
 * regex pass over the whole Markdown.
 */
export async function renderMarkdown(
  transcript: Transcript,
  opts: {
    includeToolOutput: boolean;
    filter?: ExtraFilter;
    home?: string;
    timeoutMs: number;
  },
): Promise<RenderedMarkdown> {
  const counts: Record<string, number> = {};
  const segments: string[] = [];
  const push = (s: string): number => segments.push(s) - 1;

  const titleSeg = push(transcript.summary.title);
  const cwdSeg = push(transcript.summary.cwd);
  const pieces: Piece[] = transcript.turns.map((turn): Piece => {
    if (turn.kind !== "tool") return { kind: turn.kind, seg: push(turn.text) };
    // Args are summarized (redacted, then cut) before the pipeline; a second
    // redaction pass over them counts 0, so nothing is counted twice.
    const args = summarizeTool(turn.args, opts.home);
    addCounts(counts, args.counts);
    const piece: Piece = {
      kind: "tool",
      name: push(turn.name),
      args: push(args.text),
    };
    if (opts.includeToolOutput && turn.output !== undefined) {
      piece.output = push(turn.output);
    }
    return piece;
  });

  const result = await runExportPipeline(segments, {
    filter: opts.filter,
    timeoutMs: opts.timeoutMs,
    home: opts.home,
  });
  addCounts(counts, result.counts);
  const seg = result.segments;

  const lines: string[] = [];
  const title = truncateChars(seg[titleSeg].replace(/\s+/g, " ").trim(), 200);
  lines.push(`# ${title || "Session"}`, "");
  lines.push(`- ref: ${transcript.ref}`);
  lines.push(`- provider: ${transcript.provider}`);
  if (seg[cwdSeg]) lines.push(`- cwd: ${seg[cwdSeg]}`);
  if (transcript.summary.startedAt) {
    lines.push(`- started: ${transcript.summary.startedAt}`);
  }
  lines.push("");
  for (const piece of pieces) {
    if (piece.kind !== "tool") {
      const heading = piece.kind === "user" ? "## User" : "## Assistant";
      lines.push(heading, "", seg[piece.seg], "");
      continue;
    }
    const name = truncateChars(
      seg[piece.name].replace(/\s+/g, " ").trim(),
      TOOL_NAME_MAX_CHARS,
    );
    const args = seg[piece.args].replace(/\s+/g, " ").trim();
    lines.push(`- tool: ${name} ${args}`.trimEnd());
    if (piece.output !== undefined) {
      const body = truncateChars(seg[piece.output], TOOL_OUTPUT_MAX_CHARS);
      const fence = fenceFor(body);
      lines.push("", fence, body, fence, "");
    }
  }

  const final = redactText(lines.join("\n").trimEnd() + "\n", {
    home: opts.home,
  });
  addCounts(counts, final.counts);
  const fullMarkdown = final.text;
  const markdown = truncateUtf8(fullMarkdown, MARKDOWN_MAX_BYTES);
  return {
    markdown,
    fullMarkdown,
    bytes: Buffer.byteLength(fullMarkdown),
    truncated: markdown.length !== fullMarkdown.length,
    redactions: toRedactions(counts),
    filter: result.filter,
  };
}
