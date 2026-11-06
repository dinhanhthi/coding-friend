import { useCallback, useEffect, useRef, useState } from "react";

import {
  taskFollow,
  toCfError,
  type AttemptSummary,
  type CfError,
  type FollowLive,
  type Provider,
  type SessionTurn,
  type TaskAttemptRef,
  type TaskFollow,
  type TaskView,
} from "./cf";
import { SPINNER_DELAY_MS } from "./use-cf-query";

/** Poll delays (ms) by task state; `more` polls again at once. */
const LIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 10_000;
const ERROR_RETRY_MS = 10_000;
/** Past this many items the oldest are dropped down to `KEEP_ITEMS`. */
const MAX_ITEMS = 2000;
const KEEP_ITEMS = 1500;

/** A divider before the turns of attempt `n`. */
export interface AttemptMarker {
  kind: "attempt";
  n: number;
  provider: Provider;
  attemptKind: AttemptSummary["kind"];
}

export type FollowItem = SessionTurn | AttemptMarker;

export interface TaskFollowState {
  task: TaskView | null;
  live: FollowLive | null;
  attempt: TaskAttemptRef | null;
  terminal: boolean;
  /** Turns of every poll so far, with a marker each time the attempt changes. */
  items: FollowItem[];
  /** The last poll failed; `items` stay. Cleared by the next good poll. */
  error: CfError | null;
  /** A first response has arrived for this task. */
  loaded: boolean;
  /** True only once the first load has taken SPINNER_DELAY_MS. */
  showSpinner: boolean;
  /** The last poll cut its turns. */
  truncated: boolean;
  /** Old items were dropped to bound memory. */
  trimmed: boolean;
  /** Polls now with the current cursor (after a reply or cancel). */
  refetch: () => void;
}

interface Snapshot {
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
}

const emptySnapshot = (taskId: string): Snapshot => ({
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
});

/** What a task with no response yet reads as (stable, so it can sit in deps). */
const EMPTY = emptySnapshot("");

/** Index of the last marker for attempt `n`, or -1. */
function lastMarkerIndex(items: FollowItem[], n: number): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "attempt" && item.n === n) return i;
  }
  return -1;
}

function applyFollow(prev: Snapshot, res: TaskFollow): Snapshot {
  let items = prev.items;
  let lastN = prev.attempt?.n;
  if (res.reset) {
    // The attempt's file starts over: drop what it showed so far. With its
    // marker trimmed away, everything left belongs to it.
    const at = res.attempt ? lastMarkerIndex(items, res.attempt.n) : -1;
    items = at >= 0 ? items.slice(0, at) : [];
    lastN = undefined;
  }
  const added: FollowItem[] = [];
  if (res.attempt && res.attempt.n !== lastN) {
    added.push({
      kind: "attempt",
      n: res.attempt.n,
      provider: res.attempt.provider,
      attemptKind: res.attempt.kind,
    });
  }
  added.push(...res.turns);
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
  };
}

/** Delay before the next poll, or null to stop. */
function nextDelay(res: TaskFollow): number | null {
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

/**
 * Follows task `taskId` (`null` = nothing) through `cf task follow --json`, one
 * `setTimeout` after another, keeping the opaque cursor between polls. A new
 * `taskId` reads as empty and not loaded in the very render it arrives; responses
 * for an older task, or after unmount, are dropped.
 */
export function useTaskFollow(taskId: string | null): TaskFollowState {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [spinnerTask, setSpinnerTask] = useState<string | null>(null);
  const gen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursor = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const rerun = useRef(false);

  const poll = useCallback((id: string) => {
    clearTimeout(timer.current ?? undefined);
    timer.current = null;
    if (inFlight.current) {
      rerun.current = true;
      return;
    }
    const g = gen.current;
    inFlight.current = true;
    const schedule = (delay: number | null) => {
      inFlight.current = false;
      if (rerun.current) {
        rerun.current = false;
        delay = 0;
      }
      if (delay !== null) timer.current = setTimeout(() => poll(id), delay);
    };
    taskFollow(id, cursor.current).then(
      (res) => {
        if (g !== gen.current) return;
        cursor.current = res.cursor;
        setSnap((prev) =>
          applyFollow(prev?.taskId === id ? prev : emptySnapshot(id), res),
        );
        schedule(nextDelay(res));
      },
      (e: unknown) => {
        if (g !== gen.current) return;
        const error = toCfError(e);
        setSnap((prev) => ({
          ...(prev?.taskId === id ? prev : emptySnapshot(id)),
          error,
        }));
        schedule(ERROR_RETRY_MS);
      },
    );
  }, []);

  useEffect(() => {
    gen.current++;
    cursor.current = undefined;
    inFlight.current = false;
    rerun.current = false;
    if (taskId === null) return;
    poll(taskId);
    return () => {
      // Drops the in-flight response, also on unmount.
      gen.current++;
      clearTimeout(timer.current ?? undefined);
      timer.current = null;
      inFlight.current = false;
      rerun.current = false;
    };
  }, [taskId, poll]);

  const cur = taskId !== null && snap?.taskId === taskId ? snap : EMPTY;
  const waiting = taskId !== null && !cur.loaded && cur.error === null;

  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setSpinnerTask(taskId), SPINNER_DELAY_MS);
    return () => {
      clearTimeout(t);
      setSpinnerTask(null);
    };
  }, [waiting, taskId]);

  const refetch = useCallback(() => {
    if (taskId !== null) poll(taskId);
  }, [taskId, poll]);

  return {
    task: cur.task,
    live: cur.live,
    attempt: cur.attempt,
    terminal: cur.terminal,
    items: cur.items,
    error: cur.error,
    loaded: cur.loaded,
    showSpinner: waiting && spinnerTask === taskId,
    truncated: cur.truncated,
    trimmed: cur.trimmed,
    refetch,
  };
}
