import type {
  AttemptSummary,
  CfError,
  FollowLive,
  Provider,
  SessionTurn,
  TaskAttemptRef,
  TaskFollow,
  TaskView,
} from "./cf";

// The pure part of `useTaskFollow`: how a poll answer folds into what the panel shows.

/** Poll delays (ms) by task state; `more` polls again at once. */
const LIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 10_000;
const ERROR_RETRY_MS = 10_000;
/** Past this many items the oldest are dropped down to `KEEP_ITEMS`. */
const MAX_ITEMS = 2000;
const KEEP_ITEMS = 1500;

/** A divider before the turns of attempt `n`. */
interface AttemptMarker {
  kind: "attempt";
  n: number;
  provider: Provider;
  attemptKind: AttemptSummary["kind"];
}

/** A turn or a marker, with `seq`: unique within the task, never reused (a stable React key). */
export type FollowItem = (SessionTurn | AttemptMarker) & { seq: number };

export interface Snapshot {
  taskId: string;
  task: TaskView | null;
  live: FollowLive | null;
  attempt: TaskAttemptRef | null;
  terminal: boolean;
  items: FollowItem[];
  error: CfError | null;
  loaded: boolean;
  truncated: boolean;
  trimmed: boolean;
  /** The `seq` of the next item. */
  nextSeq: number;
}

export const emptySnapshot = (taskId: string): Snapshot => ({
  taskId,
  task: null,
  live: null,
  attempt: null,
  terminal: false,
  items: [],
  error: null,
  loaded: false,
  truncated: false,
  trimmed: false,
  nextSeq: 0,
});

/** Index of the last marker for attempt `n`, or -1. */
function lastMarkerIndex(items: FollowItem[], n: number): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "attempt" && item.n === n) return i;
  }
  return -1;
}

export function applyFollow(prev: Snapshot, res: TaskFollow): Snapshot {
  // Defense in depth: an answer about another task never mixes in.
  if (res.task.id !== prev.taskId) return prev;
  let items = prev.items;
  let lastN = prev.attempt?.n;
  if (res.reset) {
    // The attempt's file starts over: drop what it showed so far. With its
    // marker trimmed away, everything left belongs to it.
    const at = res.attempt ? lastMarkerIndex(items, res.attempt.n) : -1;
    items = at >= 0 ? items.slice(0, at) : [];
    lastN = undefined;
  }
  let seq = prev.nextSeq;
  const added: FollowItem[] = [];
  if (res.attempt && res.attempt.n !== lastN) {
    added.push({
      kind: "attempt",
      n: res.attempt.n,
      provider: res.attempt.provider,
      attemptKind: res.attempt.kind,
      seq: seq++,
    });
  }
  for (const turn of res.turns) added.push({ ...turn, seq: seq++ });
  if (added.length > 0) items = [...items, ...added];
  let trimmed = prev.trimmed;
  if (items.length > MAX_ITEMS) {
    items = items.slice(items.length - KEEP_ITEMS);
    trimmed = true;
  }
  return {
    taskId: prev.taskId,
    task: res.task,
    live: res.live,
    attempt: res.attempt ?? prev.attempt,
    terminal: res.terminal,
    items,
    error: null,
    loaded: true,
    truncated: res.truncated,
    trimmed,
    nextSeq: seq,
  };
}

/** Codes that come back the same however often the poll is retried. */
const PERMANENT_CODES: ReadonlySet<string> = new Set([
  "NOT_FOUND",
  "INVALID_ARGS",
]);

/** Delay before the poll after a failed one, or null to stop (Try again still polls). */
export function errorDelay(error: CfError): number | null {
  if (error.kind === "cliError" && PERMANENT_CODES.has(error.code)) return null;
  return ERROR_RETRY_MS;
}

/** Delay before the next poll, or null to stop. */
export function nextDelay(res: TaskFollow): number | null {
  if (res.more) return 0;
  if (res.terminal) return null;
  switch (res.task.state) {
    case "paused":
    case "queued":
      return IDLE_POLL_MS;
    default:
      return LIVE_POLL_MS;
  }
}
