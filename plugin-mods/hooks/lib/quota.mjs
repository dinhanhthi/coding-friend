// Pure quota helpers for the coding-friend-mods quota sensor. No I/O, no deps.
//
// The mod writes the same Claude quota snapshot (schema v1) as the plugin's
// statusline (plugin/hooks/statusline.sh `write_quota_snapshot`). Both writers
// emit compact JSON in a fixed key order, and the statusline dedupes by
// comparing the text of the `"windows":` part, so toSnapshot must produce that
// part byte for byte like the statusline does.

/** Clock-skew slack and dedupe interval in seconds, as in the statusline
 * (and MEASURED_AT_MAX_SKEW_S in cli/src/lib/orchestrator/quota.ts). */
const SLACK_S = 300;

/** Window kinds kept in the snapshot, in the order they are written. */
const WINDOW_KINDS = ["five_hour", "seven_day"];

/** Toast levels in percent, lowest first. */
const LEVELS = [80, 90, 95];

/**
 * @typedef {object} RateLimit
 * @property {string} kind `five_hour`, `seven_day`, or another window (dropped).
 * @property {number} percentUsed 0-100 with at most one decimal (may exceed 100).
 * @property {string} [resetsAt] ISO 8601 timestamp.
 */

/**
 * @typedef {object} QuotaSnapshotText
 * @property {string} json Compact snapshot JSON, no trailing newline.
 * @property {string} windowsText The exact text of the `"windows":` value.
 */

/**
 * Percent as the statusline prints it: one decimal at most, clamped to 100,
 * a trailing ".0" dropped (42, 69.5, 100). Null for negatives/non-numbers.
 * Byte parity with the statusline's awk `%.1f` relies on the source having at
 * most one decimal (SessionRateLimit.percentUsed), so no rounding ties occur.
 * @param {unknown} v
 * @returns {string | null}
 */
function formatPercent(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  if (Object.is(v, -0)) return null;
  return Math.min(v, 100).toFixed(1).replace(/\.0$/, "");
}

/**
 * Epoch seconds (floor) from an ISO string, or null when it does not parse.
 * @param {unknown} iso
 * @returns {number | null}
 */
function isoToEpochSeconds(iso) {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 1000);
}

/**
 * Snapshot v1 text from `session.measure` rate limits: only five_hour and
 * seven_day windows with a valid percent and a parseable resetsAt, in that
 * order. Null when no window is left.
 * @param {RateLimit[]} rateLimits
 * @param {number} nowS Epoch seconds, written as measuredAt.
 * @param {string} configDir Resolved Claude config dir.
 * @returns {QuotaSnapshotText | null}
 */
export function toSnapshot(rateLimits, nowS, configDir) {
  const parts = [];
  for (const kind of WINDOW_KINDS) {
    // Last entry of a kind wins, like the statusline's row loop
    let pct = null;
    let reset = null;
    for (const r of Array.isArray(rateLimits) ? rateLimits : []) {
      if (r && r.kind === kind) {
        pct = formatPercent(r.percentUsed);
        reset = isoToEpochSeconds(r.resetsAt);
      }
    }
    if (pct === null || reset === null) continue;
    parts.push(`"${kind}":{"percentUsed":${pct},"resetsAt":${reset}}`);
  }
  if (parts.length === 0) return null;
  const windowsText = `{${parts.join(",")}}`;
  const json =
    `{"schemaVersion":1,"provider":"claude","configDir":${JSON.stringify(configDir)},` +
    `"windows":${windowsText},"source":"mod","measuredAt":${Math.floor(nowS)}}`;
  return { json, windowsText };
}

/**
 * Whether the mod should replace the existing snapshot with `next`, by the
 * statusline's rules: write when there is no valid existing measuredAt or it
 * is beyond now + 300 s (corrupt); keep a newer one; skip when the windows
 * text is identical and the file is under 300 s old.
 * @param {string | null} existingText Current file content, or null.
 * @param {QuotaSnapshotText} next
 * @param {number} nowS Epoch seconds.
 * @returns {boolean}
 */
export function shouldWrite(existingText, next, nowS) {
  if (typeof existingText !== "string") return true;
  let measuredAt;
  try {
    measuredAt = JSON.parse(existingText)?.measuredAt;
  } catch {
    return true;
  }
  // Same validity as the statusline's ^[0-9]{1,12}$
  if (!Number.isInteger(measuredAt) || measuredAt < 0 || measuredAt >= 1e12) {
    return true;
  }
  if (measuredAt > nowS + SLACK_S) return true;
  if (measuredAt > nowS) return false;
  // Text between "windows": and the first ,"source": (as the statusline slices it)
  const at = existingText.indexOf('"windows":');
  let windows =
    at < 0 ? existingText : existingText.slice(at + '"windows":'.length);
  const end = windows.indexOf(',"source":');
  if (end >= 0) windows = windows.slice(0, end);
  if (windows === next.windowsText && nowS - measuredAt < SLACK_S) return false;
  return true;
}

/**
 * The highest toast level (80, 90, 95) that `percent` reaches and that is
 * above `prevLevel`, or null when no new level was crossed.
 * @param {number | null | undefined} prevLevel Last level toasted (0 or null = none).
 * @param {number} percent
 * @returns {number | null}
 */
export function crossedLevel(prevLevel, percent) {
  const prev = typeof prevLevel === "number" ? prevLevel : 0;
  let hit = null;
  for (const level of LEVELS) {
    if (percent >= level && level > prev) hit = level;
  }
  return hit;
}

/** Short month names, fixed so the toast does not depend on the locale. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The reset time a quota toast prints, in local time: "19:00" for a five_hour
 * window, and for a seven_day window that resets on another day than today
 * the day too ("Nov 8 19:00"), so it does not read as "tonight".
 * @param {string} kind `five_hour` or `seven_day`.
 * @param {number} resetsAtS Reset time, epoch seconds.
 * @param {number} nowS Now, epoch seconds.
 * @returns {string}
 */
export function formatReset(kind, resetsAtS, nowS) {
  const d = new Date(resetsAtS * 1000);
  const now = new Date(nowS * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (kind !== "seven_day" || sameDay) return time;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${time}`;
}

/**
 * Store key for the last toasted level of one window, so a new window (new
 * resetsAt) starts its levels again.
 * @param {string} kind
 * @param {string | number} resetsAt
 * @returns {string}
 */
export function levelKey(kind, resetsAt) {
  return `${kind}@${resetsAt}`;
}
