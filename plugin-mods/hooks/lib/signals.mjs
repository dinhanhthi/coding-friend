// Pure signal helpers for the coding-friend-mods toasts. No I/O, no deps.
//
// Review reports, tool output and commit subjects are untrusted text: they are
// only matched with the regexes below, and anything shown is stripped of
// control characters and truncated. Nothing here guesses a missing signal.

/** The single status line of a /cf-review report (cf-review "Report contract"). */
const REVIEW_STATUS_RE = /^Review status: (COMPLETE|PARTIAL|FAILED)( — .*)?$/;

/** The main reviewer agent type, bare or plugin-qualified (not cf-reviewer-*). */
const MAIN_REVIEWER_RE = /(^|:)cf-reviewer$/;

/**
 * Git's own line in `git commit` output: `[<branch> <sha>] <subject>`, also
 * `[<branch> (root-commit) <sha>]` and `[detached HEAD <sha>]`. The sha keeps
 * a hook's `[warn] …` or `[STARTED] …` line from matching first.
 */
const COMMIT_LINE_RE = /^\[.+ [0-9a-f]{7,40}\] (.+)$/;

/** Phase commit subject from /cf-plan autopilot: `<type>(<scope>): phase N/M <name>`. */
const PHASE_SUBJECT_RE = /^\w+(\([^)]*\))?!?: phase (\d+)\/(\d+) (.+)$/;

/** Per-task commits of commit-per-task mode: `phase N/M task i/K <title>`. */
const TASK_RE = /^task \d+\/\d+ /;

/** Other commit-per-task subjects that are not a finished phase. */
const NOT_A_PHASE = new Set(["bookkeeping", "review fixes"]);

/**
 * Characters stripped from untrusted text before it is shown: every control
 * character (C0, DEL and C1, which holds the 8-bit CSI U+009B), the bidi
 * embeddings and overrides (U+202A-U+202E), isolates (U+2066-U+2069) and marks
 * (U+200E, U+200F, U+061C) that reorder what is drawn, the line and paragraph
 * separators U+2028 and U+2029, the invisible U+00AD, U+200B, U+2060 and
 * U+FEFF, and the tag block (U+E0000-U+E007F). Other format characters stay:
 * the zero-width joiner (U+200D) holds emoji sequences together. Same class as
 * plan.mjs.
 */
const UNSAFE_RE =
  /[\p{Cc}\u00AD\u061C\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;

const MAX_DETAIL = 80;
const MAX_NAME = 60;
const MAX_PHASE = 99;

/**
 * Strip control and bidi characters (UNSAFE_RE) from untrusted text, then cut
 * it to at most `max` characters, the last one being "…" when cut.
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
export function truncate(s, max) {
  const chars = Array.from(String(s).replace(UNSAFE_RE, ""));
  if (chars.length <= max) return chars.join("");
  return `${chars.slice(0, max - 1).join("")}…`;
}

/**
 * @typedef {object} ReviewStatus
 * @property {"COMPLETE" | "PARTIAL" | "FAILED"} status
 * @property {string} [detail] Text after " — ", cleaned and truncated.
 */

/**
 * Read the `Review status:` line of a /cf-review report. The contract allows
 * exactly one such line; when several appear the last one wins.
 * @param {unknown} text
 * @returns {ReviewStatus | null} Null when no line matches.
 */
export function parseReviewStatus(text) {
  if (typeof text !== "string") return null;
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = REVIEW_STATUS_RE.exec(lines[i].trimEnd());
    if (!match) continue;
    const result = { status: /** @type {ReviewStatus["status"]} */ (match[1]) };
    if (match[2]) result.detail = truncate(match[2].slice(3), MAX_DETAIL);
    return result;
  }
  return null;
}

/**
 * Whether a subagent type is the main /cf-review reviewer.
 * @param {unknown} type e.g. "cf-reviewer" or "coding-friend:cf-reviewer".
 * @returns {boolean}
 */
export function isMainReviewer(type) {
  return typeof type === "string" && MAIN_REVIEWER_RE.test(type);
}

/**
 * @typedef {object} PhaseCommit
 * @property {number} n Phase number (1-based).
 * @property {number} m Phase count.
 * @property {string} name Phase name, cleaned and truncated.
 */

/**
 * Read a phase commit from `git commit` output. Per-task, bookkeeping and
 * review-fix commits of commit-per-task mode are not phase commits.
 * @param {unknown} gitText
 * @returns {PhaseCommit | null} Null when the output is not a phase commit.
 */
export function parsePhaseCommit(gitText) {
  if (typeof gitText !== "string") return null;
  // Pre-commit hooks print before git's own line: take the first that matches.
  let commit = null;
  for (const line of gitText.split("\n")) {
    commit = COMMIT_LINE_RE.exec(line.trimEnd());
    if (commit) break;
  }
  if (!commit) return null;
  const subject = PHASE_SUBJECT_RE.exec(commit[1]);
  if (!subject) return null;
  const n = Number(subject[2]);
  const m = Number(subject[3]);
  const rest = subject[4];
  if (n < 1 || n > m || m > MAX_PHASE) return null;
  if (TASK_RE.test(rest) || NOT_A_PHASE.has(rest)) return null;
  return { n, m, name: truncate(rest, MAX_NAME) };
}
