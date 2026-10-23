import type { CodingFriendConfig } from "../../types.js";
import {
  isModelName,
  PROVIDER_NAMES,
  type AttemptEntry,
  type DispatchRecord,
  type Provider,
} from "./store.js";

/**
 * What a task does when its worker hits a provider quota: the policy, the
 * quota time parsers and `decideNext`, shared by the runner and the tick.
 * Every time here is in epoch seconds.
 */

export type TaskPolicy = DispatchRecord["policy"];

/** A task paused this many times fails instead of pausing again. */
export const MAX_PAUSES = 20;

/** Recheck a known reset this long after it, in seconds. */
const RESET_SLACK_S = 60;

const DEFAULT_POLICY: Omit<TaskPolicy, "noFallback"> = {
  onQuota: "wait-then-switch",
  waitMinutes: 30,
  fallback: ["claude", "codex"],
};

/** The task's policy: config `task.*` (already validated) over the defaults. */
export function resolveTaskPolicy(
  config: Pick<CodingFriendConfig, "task">,
  opts: { noFallback?: boolean } = {},
): TaskPolicy {
  const task = config.task ?? {};
  const models: Partial<Record<Provider, string>> = {};
  for (const p of PROVIDER_NAMES) {
    const m = task.models?.[p];
    if (isModelName(m)) models[p] = m;
  }
  return {
    onQuota: task.onQuota ?? DEFAULT_POLICY.onQuota,
    waitMinutes: task.waitMinutes ?? DEFAULT_POLICY.waitMinutes,
    fallback: [...(task.fallback ?? DEFAULT_POLICY.fallback)],
    noFallback: Boolean(opts.noFallback),
    ...(Object.keys(models).length > 0 && { models }),
  };
}

/** A reset time in epoch seconds (> 1e12 is read as ms), else null. */
export function normalizeResetsAt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v > 1e12 ? Math.floor(v / 1000) : v;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const RETRY_AT_RE =
  /try again at\s+(?:([a-z]{3})\s+(\d{1,2})(?:st|nd|rd|th),\s+(\d{4})\s+)?(\d{1,2}):(\d{2})\s*([ap]m)\b/i;

/**
 * Epoch seconds of Codex's "Try again at <local time>", in this machine's
 * timezone: "3:45 PM" (today; already past → tomorrow) or
 * "Oct 21st, 2026 3:45 PM". "Try again later." or anything else → null.
 */
export function parseCodexRetryAt(message: string, now: number): number | null {
  const m = RETRY_AT_RE.exec(String(message));
  if (!m) return null;
  const [, mon, day, year, hh, mm, ampm] = m;
  const hour12 = Number(hh);
  const minute = Number(mm);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
  const hour = (hour12 % 12) + (ampm.toLowerCase() === "pm" ? 12 : 0);

  if (mon !== undefined) {
    const month = MONTHS.indexOf(mon.toLowerCase());
    const d = Number(day);
    if (month < 0 || d < 1) return null;
    const date = new Date(Number(year), month, d, hour, minute);
    if (date.getMonth() !== month || date.getDate() !== d) return null;
    return Math.floor(date.getTime() / 1000);
  }

  const date = new Date(now * 1000);
  date.setHours(hour, minute, 0, 0);
  // Codex truncates the seconds: the same minute as now is not past.
  if (date.getTime() / 1000 + 60 <= now) date.setDate(date.getDate() + 1);
  return Math.floor(date.getTime() / 1000);
}

export type Decision =
  | {
      kind: "resume";
      provider: Provider;
      /** Epoch seconds to start at (now for immediately). */
      at: number;
      sessionId: string;
    }
  | { kind: "switch" | "fresh"; provider: Provider; at: number }
  | { kind: "fail"; reason: string };

type Step = Exclude<Decision, { kind: "fail" }>;

export interface DecideInput {
  policy: TaskPolicy;
  /**
   * listAttempts(id): the task's attempts sorted by n. Pauses are the
   * entries with `pause`; the latest one is what is being decided (it may
   * sit before an abandoned claim with no pause of its own).
   */
  attempts: AttemptEntry[];
  /** Epoch seconds. */
  now: number;
  /** eligibleProviders(req, candidates). */
  eligible: Provider[];
}

type Paused = AttemptEntry & { pause: NonNullable<AttemptEntry["pause"]> };

/**
 * Next step after the latest pause (pure: inputs only).
 * - wait (or noFallback): same provider at reset + 60s, or after
 *   waitMinutes when the reset is unknown.
 * - switch: the next eligible provider in `fallback` after the current one
 *   (round robin), skipping providers this task saw paused with a reset still
 *   ahead (unknown reset: blocked until waitMinutes after that pause); none
 *   left → whichever provider frees up first.
 * - wait-then-switch: reset within waitMinutes → wait; unknown reset → wait
 *   waitMinutes once, then switch if still blocked; reset further → switch.
 * Waiting on the same provider resumes its session, or runs fresh (with a
 * bundle) when the paused attempt has no session id.
 */
export function decideNext(input: DecideInput): Decision {
  const { policy, attempts, now, eligible } = input;
  const pauses = attempts.filter((e): e is Paused => !!e.pause);
  if (pauses.length >= MAX_PAUSES) {
    return {
      kind: "fail",
      reason: `Task paused on quota ${pauses.length} times (limit ${MAX_PAUSES})`,
    };
  }
  const latest = pauses.at(-1);
  if (!latest) return { kind: "fail", reason: "No quota pause to resume from" };

  const current = latest.pause.provider;
  const reset = latest.pause.resetsAt;
  const waitS = policy.waitMinutes * 60;
  const onQuota = policy.noFallback ? "wait" : policy.onQuota;

  const same = (at: number): Step => {
    const sessionId =
      latest.session?.sessionId ?? latest.attempt.resumeSessionId;
    return sessionId
      ? { kind: "resume", provider: current, at, sessionId }
      : { kind: "fresh", provider: current, at };
  };
  const waitSame = (): Step =>
    same(reset === null ? now + waitS : Math.max(now, reset + RESET_SLACK_S));

  if (onQuota === "wait") return waitSame();

  if (onQuota === "wait-then-switch") {
    if (reset !== null && reset <= now + waitS) return waitSame();
    if (reset === null) {
      const prev = pauses.at(-2);
      const retried =
        prev !== undefined &&
        prev.pause.provider === current &&
        prev.pause.resetsAt === null &&
        latest.attempt.kind !== "switch";
      if (!retried) return waitSame();
    }
  }

  return switchProvider(pauses, policy, now, eligible, waitSame);
}

/** Round robin through `fallback`, else wait for the earliest reset. */
function switchProvider(
  pauses: Paused[],
  policy: TaskPolicy,
  now: number,
  eligible: Provider[],
  waitSame: () => Step,
): Step {
  const current = pauses[pauses.length - 1].pause.provider;
  const waitS = policy.waitMinutes * 60;
  // When each still-blocked provider can be tried again, from its latest
  // pause: a known reset + 60s, or an unknown reset rechecked waitMinutes
  // after the pause (so two unknown-reset providers do not bounce).
  const retryAt = new Map<Provider, number>();
  for (const p of pauses) {
    const r = p.pause.resetsAt;
    const until = r !== null ? r : Date.parse(p.pause.createdAt) / 1000 + waitS;
    if (until > now) {
      retryAt.set(p.pause.provider, r !== null ? r + RESET_SLACK_S : until);
    } else {
      retryAt.delete(p.pause.provider);
    }
  }

  const { fallback } = policy;
  const start = fallback.indexOf(current);
  for (let k = 1; k <= fallback.length; k++) {
    const p = fallback[(start + k) % fallback.length];
    if (p === current || !eligible.includes(p) || retryAt.has(p)) {
      continue;
    }
    return { kind: "switch", provider: p, at: now };
  }

  // None left: wait for whichever provider frees up first.
  let best = waitSame();
  for (const p of fallback) {
    const at = retryAt.get(p);
    if (p === current || !eligible.includes(p) || at === undefined) {
      continue;
    }
    if (at < best.at) best = { kind: "switch", provider: p, at };
  }
  return best;
}
