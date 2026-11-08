import { useCallback, useEffect, useRef, useState } from "react";

import {
  taskFollow,
  toCfError,
  type CfError,
  type FollowLive,
  type TaskAttemptRef,
  type TaskView,
} from "./cf";
import {
  applyFollow,
  emptySnapshot,
  errorDelay,
  nextDelay,
  type FollowItem,
  type Snapshot,
} from "./task-follow";
import { SPINNER_DELAY_MS } from "./use-cf-query";

export interface TaskFollowState {
  task: TaskView | null;
  live: FollowLive | null;
  attempt: TaskAttemptRef | null;
  terminal: boolean;
  /** Turns of every poll so far, with a marker each time the attempt changes. */
  items: FollowItem[];
  /** The last poll failed; `items` stay. Cleared by the next good poll, or by Try again before the first load. */
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

/** What a task with no response yet reads as (stable, so it can sit in deps). */
const EMPTY = emptySnapshot("");

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
        // An answer about another task never moves this task's cursor.
        if (res.task.id !== id) return schedule(nextDelay(res));
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
        schedule(errorDelay(error));
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
    if (taskId === null) return;
    // Try again before the first load: the placeholder (and its delayed spinner)
    // comes back in this frame, not when the answer arrives.
    setSnap((prev) =>
      prev?.taskId === taskId && !prev.loaded && prev.error !== null
        ? { ...prev, error: null }
        : prev,
    );
    poll(taskId);
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
