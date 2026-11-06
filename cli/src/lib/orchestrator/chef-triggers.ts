import {
  chefStatus,
  listChefTasks,
  listEvents,
  listMessages,
  listWakes,
  readChef,
  recordEvent,
  type ChefEvent,
  type ChefRecord,
  type WakeEntry,
} from "./chef-store.js";
import { resolveTaskPolicy } from "./quota.js";
import { readTask, type TaskState, type TaskView } from "./store.js";

/**
 * Chef triggers (run inside the supervisor tick): turn what happened in the
 * store into fire-once events (`events/<key>.json`, create-once), list the
 * events no valid wake consumed yet, and decide whether a wake may start.
 * File reads only: never git, never a provider. Every time is in epoch
 * seconds (the unit of quota.ts and the tick).
 *
 * Event `detail` is CF-written only (states, ids, slot times), never worker
 * or user text: the digest renders it outside the untrusted fences.
 */

/** A chef quota event fires this long after the announced reset, in seconds. */
export const CHEF_QUOTA_SLACK_S = 60;
/** Window of the daily wake cap, in seconds (rolling, from `now`). */
export const WAKE_CAP_WINDOW_S = 24 * 60 * 60;

/** Task states after which the task can no longer change (it ended). */
export const TASK_ENDED_STATES: readonly TaskState[] = [
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
];

const ID_RE = /^[a-z0-9]{8}$/;
const SCHEDULE_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function nowSeconds(now?: number): number {
  return now ?? Math.floor(Date.now() / 1000);
}

/** Epoch seconds of an ISO time, or null. */
function isoSeconds(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The chef's tasks with their store view (missing or unreadable tasks skipped). */
function chefTaskViews(chefId: string): TaskView[] {
  const out: TaskView[] = [];
  for (const t of listChefTasks(chefId)) {
    try {
      out.push(readTask(t.taskId));
    } catch {
      // task dir gone or unreadable: nothing to trigger
    }
  }
  return out;
}

/**
 * The latest schedule slot of the local day of `now` that is due (slot <= now),
 * as `schedule-YYYYMMDD-HHMM`. Non-string or malformed entries are skipped
 * (config validation can leave holes in the array).
 */
export function dueScheduleKey(
  schedule: unknown,
  now: number,
): { key: string; slot: string } | undefined {
  if (!Array.isArray(schedule)) return undefined;
  const date = new Date(now * 1000);
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  let best = -1;
  for (let i = 0; i < schedule.length; i++) {
    const entry: unknown = schedule[i];
    if (typeof entry !== "string") continue;
    const m = SCHEDULE_RE.exec(entry);
    if (!m) continue;
    const minutes = Number(m[1]) * 60 + Number(m[2]);
    if (minutes <= minutesNow && minutes > best) best = minutes;
  }
  if (best < 0) return undefined;
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const hhmm = `${pad(Math.floor(best / 60))}${pad(best % 60)}`;
  return {
    key: `schedule-${day}-${hhmm}`,
    slot: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`,
  };
}

/**
 * When the chef's own quota wait ends (reset + slack), in epoch seconds, for
 * the latest wake when it ended with outcome quota; undefined otherwise. A
 * missing `resetsAt` falls back to the wake's end + the default waitMinutes.
 */
export function chefQuotaDueAt(
  latest: WakeEntry | undefined,
): { n: number; dueAt: number; resetsAt: number } | undefined {
  const result = latest?.result;
  if (!latest || result?.outcome !== "quota") return undefined;
  let resetsAt =
    typeof result.resetsAt === "number" && Number.isFinite(result.resetsAt)
      ? result.resetsAt
      : null;
  if (resetsAt === null) {
    const end =
      isoSeconds(result.finishedAt) ?? isoSeconds(latest.claim.createdAt) ?? 0;
    resetsAt = end + resolveTaskPolicy({}).waitMinutes * 60;
  }
  return { n: latest.n, dueAt: resetsAt + CHEF_QUOTA_SLACK_S, resetsAt };
}

/**
 * Record the fire-once events of chef `chefId` (create-once, so repeated
 * ticks record nothing new): `task-ended-<taskId>`, `ask-<qid>`, `say-<seq>`,
 * `schedule-<YYYYMMDD-HHMM>` (latest due slot of the day only),
 * `resumed-<taskId>-<n>` and `chef-quota-<n>` (now >= resetsAt + 60 s).
 * Never writes `start` (only `cf chef start` does). Returns the keys this
 * call created.
 */
export function collectTriggers(opts: {
  chefId: string;
  now?: number;
}): string[] {
  const { chefId } = opts;
  const now = nowSeconds(opts.now);
  const chef = readChef(chefId);
  const recorded: string[] = [];
  const fire = (key: string, detail: string): void => {
    if (recordEvent(chefId, key, detail)) recorded.push(key);
  };

  for (const task of chefTaskViews(chefId)) {
    if (!ID_RE.test(task.id)) continue;
    if (TASK_ENDED_STATES.includes(task.state)) {
      fire(`task-ended-${task.id}`, `task ${task.id} ${task.state}`);
    } else {
      for (const ask of task.pendingAsks) {
        if (ID_RE.test(ask.qid)) fire(`ask-${ask.qid}`, `task ${task.id}`);
      }
    }
    for (const a of task.attempts ?? []) {
      if (a.kind === "fresh" || !Number.isInteger(a.n) || a.n < 2) continue;
      fire(
        `resumed-${task.id}-${a.n}`,
        `task ${task.id} attempt ${a.n} ${a.kind}`,
      );
    }
  }

  for (const m of listMessages(chefId))
    fire(`say-${m.seq}`, `message ${m.seq}`);

  const slot = dueScheduleKey(chef.limits?.schedule, now);
  if (slot) fire(slot.key, `schedule ${slot.slot}`);

  if (chefStatus(chefId).state === "quota-wait") {
    const quota = chefQuotaDueAt(listWakes(chefId).at(-1));
    if (quota && now >= quota.dueAt) {
      fire(
        `chef-quota-${quota.n}`,
        `quota of wake ${quota.n} reset at ${new Date(quota.resetsAt * 1000).toISOString()}`,
      );
    }
  }
  return recorded;
}

/**
 * Events of chef `chefId` not consumed by any valid wake (outcome `ok` with
 * `consumed`). Quota, failed, timed-out and orphaned wakes consume nothing,
 * so their events stay pending for the next wake. Oldest first.
 */
export function pendingEvents(chefId: string): ChefEvent[] {
  const consumed = new Set<string>();
  for (const w of listWakes(chefId)) {
    if (w.result?.outcome !== "ok" || !Array.isArray(w.result.consumed)) {
      continue;
    }
    for (const key of w.result.consumed) consumed.add(key);
  }
  return listEvents(chefId).filter((e) => !consumed.has(e.key));
}

/**
 * Wakes counted by the daily cap: claimed in the last WAKE_CAP_WINDOW_S
 * seconds, except wakes that ended on the chef's own quota.
 */
export function wakesCountedForCap(wakes: WakeEntry[], now: number): number {
  return wakes.filter((w) => {
    if (w.result?.outcome === "quota") return false;
    const at = isoSeconds(w.claim.createdAt);
    return at === null || at > now - WAKE_CAP_WINDOW_S;
  }).length;
}

export type WakeBlockReason =
  | "stopped"
  | "paused"
  | "no-events"
  | "wake-in-progress"
  | "quota-wait"
  | "min-interval"
  | "daily-cap";

export type WakeDecision =
  | { wake: true; events: ChefEvent[] }
  | {
      wake: false;
      reason: WakeBlockReason;
      /** daily-cap only: the caller pauses the chef. */
      pause?: true;
      /** Epoch seconds before which this reason still holds, when known. */
      until?: number;
    };

/**
 * Whether chef `chef` may wake now for the pending `events`. In order:
 * stopped/paused → no; no events → no; a claimed wake without result.json →
 * no (the tick resolves orphans first); quota-wait → only a due
 * `chef-quota-<n>` of the quota wake (other events stay pending and ride
 * along); `minWakeMinutes` since the latest wake ended (failed and orphaned
 * wakes included) only delays; reaching `maxWakesPerDay` in the rolling day
 * (quota wakes excluded) → no, with `pause: true` for the caller.
 */
export function shouldWake(opts: {
  chef: ChefRecord;
  events: ChefEvent[];
  now?: number;
}): WakeDecision {
  const { chef, events } = opts;
  const now = nowSeconds(opts.now);
  const status = chefStatus(chef.id);
  if (status.state === "stopped") return { wake: false, reason: "stopped" };
  if (status.state === "paused") return { wake: false, reason: "paused" };
  if (events.length === 0) return { wake: false, reason: "no-events" };

  const wakes = listWakes(chef.id);
  const latest = wakes.at(-1);
  if (latest && !latest.result) {
    return { wake: false, reason: "wake-in-progress" };
  }

  if (status.state === "quota-wait") {
    const quota = chefQuotaDueAt(latest);
    const key = quota && `chef-quota-${quota.n}`;
    if (!quota || now < quota.dueAt || !events.some((e) => e.key === key)) {
      return quota
        ? { wake: false, reason: "quota-wait", until: quota.dueAt }
        : { wake: false, reason: "quota-wait" };
    }
  }

  if (latest) {
    const last =
      isoSeconds(latest.result?.finishedAt) ??
      isoSeconds(latest.claim.createdAt);
    const minS = (chef.limits?.minWakeMinutes ?? 0) * 60;
    if (last !== null && now < last + minS) {
      return { wake: false, reason: "min-interval", until: last + minS };
    }
  }

  const cap = chef.limits?.maxWakesPerDay;
  if (typeof cap === "number" && wakesCountedForCap(wakes, now) >= cap) {
    return { wake: false, reason: "daily-cap", pause: true };
  }
  return { wake: true, events };
}
