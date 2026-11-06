import { lstatSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  MEASURED_AT_MAX_SKEW_S,
  normalizeResetsAt,
  RESET_HINT_MAX_AGE_S,
} from "./orchestrator/quota.js";
import { quotaSnapshotPath } from "./paths.js";

/**
 * Reader for the Claude quota snapshot, schema v1, written by the plugin's
 * statusline.sh and by the coding-friend-mods quota sensor. The CLI only reads it.
 *
 * Path: `${CF_QUOTA_DIR:-~/.coding-friend/quota}/claude.json` (dir 0700, file 0600,
 * written atomically: mktemp in the same dir + mv -f). Keys in this fixed order,
 * `source` and `measuredAt` last (the statusline's dedupe compares the prefix):
 *
 *   {"schemaVersion":1,"provider":"claude","configDir":"<resolved Claude config dir>",
 *    "windows":{"five_hour":{"percentUsed":<0-100>,"resetsAt":<epoch s>},
 *               "seven_day":{"percentUsed":<0-100>,"resetsAt":<epoch s>}},
 *    "source":"statusline"|"mod","measuredAt":<epoch s>}
 *
 * Every time is in epoch SECONDS. The reader also accepts `resetsAt` as an ISO
 * string (or epoch ms) and normalizes it to seconds, drops broken windows, and
 * returns null when the file is unusable: missing, a symlink, a FIFO or other
 * non-regular file, over 64 KiB, broken JSON, wrong schema, or no valid window.
 */

export type QuotaWindowName = "five_hour" | "seven_day";

export interface QuotaWindow {
  /** Percent of the window used: writers clamp to 0-100, the reader tolerates more. */
  percentUsed: number;
  /** Epoch seconds. */
  resetsAt: number;
}

export interface QuotaSnapshot {
  schemaVersion: 1;
  provider: "claude";
  configDir: string;
  windows: Partial<Record<QuotaWindowName, QuotaWindow>>;
  source: "statusline" | "mod";
  /** Epoch seconds. */
  measuredAt: number;
}

export interface QuotaResetHint {
  provider: "claude";
  resetsAt: number;
  measuredAt: number;
}

// Hint age and clock-skew limits, shared with decideNext (defined in quota.ts).
export { MEASURED_AT_MAX_SKEW_S, RESET_HINT_MAX_AGE_S };

/**
 * A window whose `resetsAt` is further than this (seconds) ahead of `now` is
 * ignored by the hint: its real period plus slack, so a crafted or corrupted
 * snapshot cannot make the supervisor wait for years.
 */
export const RESET_HINT_MAX_AHEAD_S: Readonly<Record<QuotaWindowName, number>> =
  {
    five_hour: 6 * 3600,
    seven_day: 8 * 86_400,
  };

/** Windows at or above this percent count as exhausted for the hint. */
const RESET_HINT_MIN_PERCENT = 95;

const MAX_SNAPSHOT_BYTES = 64 * 1024;

/** Epoch values above this are milliseconds, not seconds. */
const MAX_EPOCH_S = 1e12;

const WINDOW_NAMES: readonly QuotaWindowName[] = ["five_hour", "seven_day"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Epoch seconds from an epoch number (s or ms) or an ISO string, else null. */
function toEpochSeconds(v: unknown): number | null {
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null;
  }
  return normalizeResetsAt(v);
}

function parseWindow(v: unknown): QuotaWindow | null {
  if (!isPlainObject(v)) return null;
  const { percentUsed } = v;
  if (
    typeof percentUsed !== "number" ||
    !Number.isFinite(percentUsed) ||
    percentUsed < 0
  ) {
    return null;
  }
  const resetsAt = toEpochSeconds(v.resetsAt);
  return resetsAt === null ? null : { percentUsed, resetsAt };
}

function parseSnapshot(v: unknown): QuotaSnapshot | null {
  if (!isPlainObject(v)) return null;
  if (v.schemaVersion !== 1 || v.provider !== "claude") return null;
  const { configDir, source, measuredAt } = v;
  if (typeof configDir !== "string" || configDir === "") return null;
  if (source !== "statusline" && source !== "mod") return null;
  if (
    typeof measuredAt !== "number" ||
    !Number.isFinite(measuredAt) ||
    measuredAt <= 0 ||
    measuredAt >= MAX_EPOCH_S
  ) {
    return null;
  }
  if (!isPlainObject(v.windows)) return null;
  const windows: QuotaSnapshot["windows"] = {};
  for (const name of WINDOW_NAMES) {
    const w = parseWindow(v.windows[name]);
    if (w) windows[name] = w;
  }
  if (Object.keys(windows).length === 0) return null;
  return {
    schemaVersion: 1,
    provider: "claude",
    configDir,
    windows,
    source,
    measuredAt,
  };
}

/** The validated snapshot at `path`, or null when it is missing or unusable. */
export function readQuotaSnapshot(
  path: string = quotaSnapshotPath(),
): QuotaSnapshot | null {
  try {
    // lstat: a symlink (e.g. to /dev/zero) or a FIFO must not be followed or hang.
    const st = lstatSync(path);
    if (!st.isFile() || st.size > MAX_SNAPSHOT_BYTES) return null;
    return parseSnapshot(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

/** Seconds since the snapshot was measured (negative when its clock is ahead). */
export function snapshotAgeSeconds(snap: QuotaSnapshot, now: number): number {
  return now - snap.measuredAt;
}

/**
 * When the exhausted Claude quota resets, for the supervisor: the latest
 * `resetsAt` among windows at >= 95% whose reset is at most
 * RESET_HINT_MAX_AHEAD_S ahead of `now`, only when the snapshot is for the
 * same Claude config dir, that reset is still ahead and the snapshot is at most
 * RESET_HINT_MAX_AGE_S old and at most MEASURED_AT_MAX_SKEW_S in the future.
 * Otherwise null.
 */
export function quotaResetHint(
  snap: QuotaSnapshot | null,
  opts: { configDir: string; now?: number },
): QuotaResetHint | null {
  if (!snap) return null;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (resolve(snap.configDir) !== resolve(opts.configDir)) return null;
  if (snapshotAgeSeconds(snap, now) > RESET_HINT_MAX_AGE_S) return null;
  if (snap.measuredAt > now + MEASURED_AT_MAX_SKEW_S) return null;
  let resetsAt: number | null = null;
  for (const name of WINDOW_NAMES) {
    const w = snap.windows[name];
    if (!w || w.percentUsed < RESET_HINT_MIN_PERCENT) continue;
    if (w.resetsAt - now > RESET_HINT_MAX_AHEAD_S[name]) continue;
    if (resetsAt === null || w.resetsAt > resetsAt) resetsAt = w.resetsAt;
  }
  if (resetsAt === null || resetsAt <= now) return null;
  return { provider: "claude", resetsAt, measuredAt: snap.measuredAt };
}
