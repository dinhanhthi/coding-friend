// `cf task follow`: incremental, redacted turns of a task's worker transcript.
// The transcript is located by the session id each attempt recorded (never by
// a stored path) and read by byte offset; an opaque cursor carries the
// position from one call to the next.

import { homedir } from "os";

import { CliError } from "../output.js";
import {
  locateClaudeTranscript,
  readClaudeTranscriptSlice,
  type TranscriptSlice,
} from "../transcript-claude.js";
import {
  locateCodexRollout,
  readCodexRolloutSlice,
} from "../transcript-codex.js";
import {
  pageTurns,
  renderTurnsForShow,
  type Redactions,
  type Turn,
} from "../transcript.js";
import {
  isPidAlive,
  isSessionId,
  readTask,
  type AttemptKind,
  type Provider,
  type TaskState,
  type TaskView,
} from "./store.js";

/** States after which the task never changes again (`paused` is not one). */
export const FOLLOW_TERMINAL: readonly TaskState[] = [
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
];

/** Raw transcript bytes read per call. */
export const FOLLOW_READ_BYTES = 1024 * 1024;

/** `v1` (start) or `v1.<attempt>.<sessionId>.<byteOffset>`; never a path. */
const CURSOR_RE =
  /^v1(?:\.([1-9]\d{0,2})\.([A-Za-z0-9][A-Za-z0-9_-]{7,127})\.(\d{1,15}))?$/;

export interface FollowAttempt {
  n: number;
  provider: Provider;
  kind: AttemptKind;
}

export interface FollowLive {
  supported: boolean;
  status: "ok" | "pending" | "unsupported";
  reason?: string;
}

export interface FollowData {
  /** As `task show --json`; the command adds `hint`. */
  task: TaskView & { hint?: string };
  /** In FOLLOW_TERMINAL and the runner has exited (or wrote result.json). */
  terminal: boolean;
  /** The attempt `turns` and `live` belong to. */
  attempt: FollowAttempt | null;
  live: FollowLive;
  /** Redacted, never with tool output. */
  turns: Turn[];
  cursor: string;
  /** Call again at once: more lines, or a later attempt to move to. */
  more: boolean;
  /** The cursor was past the end of the file: read again from 0. */
  reset: boolean;
  /** Turns were cut or dropped by the page byte budget. */
  truncated: boolean;
  /** Transcript lines too long to read. */
  skipped: number;
  redactions: Redactions;
}

export function encodeCursor(
  n: number,
  sessionId: string,
  offset: number,
): string {
  return `v1.${n}.${sessionId}.${offset}`;
}

/** Position of a cursor, null for `v1`; INVALID_ARGS when malformed. */
export function decodeCursor(
  cursor: string,
): { n: number; sessionId: string; offset: number } | null {
  const m = typeof cursor === "string" ? CURSOR_RE.exec(cursor) : null;
  if (!m) {
    throw new CliError(
      "INVALID_ARGS",
      `Invalid cursor ${JSON.stringify(String(cursor).slice(0, 80))}`,
    );
  }
  if (m[1] === undefined) return null;
  return { n: Number(m[1]), sessionId: m[2], offset: Number(m[3]) };
}

/**
 * The runner of the latest attempt (C1: the task's) wrote result.json or is
 * gone: `cf done` comes before the worker's last turn and the runner's result.
 */
function runnerFinished(task: TaskView): boolean {
  if (task.result || task.state === "interrupted") return true;
  const pid = task.attempts
    ? task.attempts[task.attempts.length - 1]?.pid
    : task.runner?.pid;
  return pid === undefined || !isPidAlive(pid);
}

interface Run extends FollowAttempt {
  sessionId?: string;
}

/** The task's attempts; a C1 task (no attempts[]) has its root session as 1. */
function runsOf(task: TaskView): Run[] {
  const runs: Run[] = task.attempts
    ? task.attempts.map((a) => ({
        n: a.n,
        provider: a.provider,
        kind: a.kind,
        sessionId: a.sessionId,
      }))
    : [
        {
          n: 1,
          provider: task.provider,
          kind: "fresh",
          sessionId: task.session?.sessionId,
        },
      ];
  // Worker-reported ids: an unsafe one counts as none.
  for (const r of runs) if (!isSessionId(r.sessionId)) delete r.sessionId;
  return runs;
}

function info(r: Run): FollowAttempt {
  return { n: r.n, provider: r.provider, kind: r.kind };
}

type Source = { path: string } | { unsupported: string } | null;

const NO_READER: Source = {
  unsupported: "no transcript reader for this provider",
};

function hasReader(p: Provider): boolean {
  return p === "claude" || p === "codex";
}

/** The attempt's transcript file, null when not found (yet). */
function locate(r: Run, sessionId: string, checkout: string): Source {
  if (r.provider === "claude") {
    const f = locateClaudeTranscript(sessionId, { projectDir: checkout });
    if (!f) return null;
    return f.placeholder ? { unsupported: "placeholder" } : { path: f.path };
  }
  if (r.provider === "codex") {
    const f = locateCodexRollout(sessionId);
    if (!f) return null;
    if (f.compressed) return { unsupported: "compressed" };
    return f.placeholder ? { unsupported: "placeholder" } : { path: f.path };
  }
  return NO_READER;
}

/** A slice of the file, or null when it vanished since locate. */
function readSlice(
  provider: Provider,
  path: string,
  offset: number,
): TranscriptSlice | null {
  const read =
    provider === "codex" ? readCodexRolloutSlice : readClaudeTranscriptSlice;
  try {
    return read(path, offset, FOLLOW_READ_BYTES);
  } catch (err) {
    if (err instanceof CliError && err.code === "NOT_FOUND") return null;
    throw err;
  }
}

function liveOf(src: Source, found: boolean, terminal: boolean): FollowLive {
  if (src && "unsupported" in src) {
    return { supported: false, status: "unsupported", reason: src.unsupported };
  }
  if (found) return { supported: true, status: "ok" };
  if (terminal) {
    return {
      supported: false,
      status: "unsupported",
      reason: "transcript not found",
    };
  }
  return { supported: true, status: "pending" };
}

/**
 * New turns of task `id` since `cursor` (default `v1`, the first attempt with
 * a session id). One attempt per call: when the current one has no complete
 * line left and a later attempt has a session id, move to it (same session
 * keeps the offset, another starts at 0).
 */
export function followTask(id: string, cursor?: string): FollowData {
  const task = readTask(id);
  const pos = decodeCursor(cursor ?? "v1");
  const runs = runsOf(task);
  const terminal =
    FOLLOW_TERMINAL.includes(task.state) && runnerFinished(task);
  const empty = {
    task,
    terminal,
    turns: [] as Turn[],
    more: false,
    reset: false,
    truncated: false,
    skipped: 0,
    redactions: { total: 0, byKind: {} } as Redactions,
  };

  let i: number;
  let offset = 0;
  if (pos) {
    i = runs.findIndex((r) => r.n === pos.n);
    if (i === -1 || runs[i].sessionId !== pos.sessionId) {
      throw new CliError("INVALID_ARGS", `Cursor is not one of task ${id}`);
    }
    offset = pos.offset;
  } else {
    i = runs.findIndex((r) => r.sessionId !== undefined);
    if (i === -1) {
      // No session id yet (opencode never records one).
      const last = runs[runs.length - 1];
      return {
        ...empty,
        attempt: info(last),
        live: liveOf(
          hasReader(last.provider) ? null : NO_READER,
          false,
          terminal,
        ),
        cursor: "v1",
      };
    }
  }

  for (;;) {
    const run = runs[i];
    const sessionId = run.sessionId as string;
    const next = runs.findIndex((r, j) => j > i && r.sessionId !== undefined);
    const src = locate(run, sessionId, task.checkout);
    let slice: TranscriptSlice | null = null;
    let reset = false;
    if (src && "path" in src) {
      slice = readSlice(run.provider, src.path, offset);
      if (slice && slice.size < offset) {
        reset = true;
        slice = readSlice(run.provider, src.path, 0);
      }
    }
    const start = reset ? 0 : offset;
    const progressed =
      !!slice && (slice.nextOffset > start || slice.skipped > 0);
    if (progressed || reset || next === -1) {
      const live = liveOf(src, !!slice, terminal);
      if (!slice) {
        return {
          ...empty,
          attempt: info(run),
          live,
          reset,
          cursor: encodeCursor(run.n, sessionId, start),
          more: next !== -1,
        };
      }
      // Redact first, then cut.
      const rendered = renderTurnsForShow(slice.turns, {
        includeToolOutput: false,
        home: homedir(),
      });
      const page = pageTurns(rendered.turns, {
        offset: 0,
        total: rendered.turns.length,
      });
      return {
        task,
        terminal,
        attempt: info(run),
        live,
        turns: page.turns,
        cursor: encodeCursor(run.n, sessionId, slice.nextOffset),
        more: slice.truncated || next !== -1,
        reset,
        truncated: page.truncated,
        skipped: slice.skipped,
        redactions: rendered.redactions,
      };
    }
    if (runs[next].sessionId !== sessionId) offset = 0;
    i = next;
  }
}
