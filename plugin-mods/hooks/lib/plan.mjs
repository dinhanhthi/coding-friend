// Pure plan helpers for the coding-friend-mods `/cf-plan-status` pane. No I/O,
// no deps.
//
// Plan files are untrusted text: values are only extracted with regexes,
// cleaned and cut short for display, never executed or sent to a model.

/** Max length of a displayed label, in code points. */
const LABEL_MAX = 80;

/** Cell text read before cleaning: bounds the regexes on a long cell. */
const CELL_MAX = 400;

/**
 * Characters stripped from a label: every control character (C0, DEL and C1,
 * which holds the 8-bit CSI U+009B), the bidi embeddings and overrides
 * (U+202A-U+202E), isolates (U+2066-U+2069) and marks (U+200E, U+200F,
 * U+061C) that reorder what is drawn, the line and paragraph separators
 * U+2028 and U+2029, the invisible U+00AD, U+200B, U+2060 and U+FEFF, and the
 * tag block (U+E0000-U+E007F). Other format characters stay: the zero-width
 * joiner (U+200D) holds emoji sequences together. Same class as signals.mjs.
 */
const UNSAFE_RE =
  /[\p{Cc}\u00AD\u061C\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;

/** Progress cell text → row status. Anything else is not a progress row. */
const STATUS_CELLS = new Map([
  ["⬜ TODO", "todo"],
  ["🔄 IN PROGRESS", "in_progress"],
  ["✅ DONE", "done"],
  ["❌ FAILED", "failed"],
]);

// First token after the key, stopping at whitespace or an inline `# comment`
// (same idea as STATUS_RE in cli/src/commands/clean.ts).
const SLUG_RE = /^slug:\s*([^\s#]+)/m;
const STATUS_RE = /^status:\s*([^\s#]+)/m;
const AUTO_RE = /^auto:\s*([^\s#]+)/m;

/**
 * @typedef {object} PlanFrontmatter
 * @property {string} [slug]
 * @property {string} [status] Lowercased, e.g. `in-progress`, `done`, `failed`.
 * @property {boolean} [auto]
 */

/**
 * @typedef {"todo" | "in_progress" | "done" | "failed"} RowStatus
 */

/**
 * @typedef {object} ProgressRow
 * @property {RowStatus} status
 * @property {string} label The cell after the Status cell (Phase or Task), cleaned.
 */

/**
 * @typedef {object} ProgressSummary
 * @property {number} todo
 * @property {number} in_progress
 * @property {number} done
 * @property {number} failed
 * @property {string | null} current First in-progress label, else first todo label.
 */

/**
 * @typedef {object} PlanEntry
 * @property {string} slug
 * @property {PlanFrontmatter | null | undefined} frontmatter
 * @property {number} mtimeMs
 */

/**
 * Fields of the leading `---` frontmatter block only. Missing block or
 * fields → those keys are absent (`{}` when there is no block).
 * @param {string} text
 * @returns {PlanFrontmatter}
 */
export function parseFrontmatter(text) {
  /** @type {PlanFrontmatter} */
  const out = {};
  if (typeof text !== "string" || !text.startsWith("---")) return out;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return out;
  const block = text.slice(3, end);
  const slug = SLUG_RE.exec(block);
  if (slug) out.slug = slug[1];
  const status = STATUS_RE.exec(block);
  if (status) out.status = status[1].toLowerCase();
  const auto = AUTO_RE.exec(block);
  if (auto) out.auto = auto[1].toLowerCase() === "true";
  return out;
}

/**
 * Cells of a markdown table line, without the outer pipes. `\|` stays inside
 * a cell.
 * @param {string} line
 * @returns {string[]}
 */
function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/**
 * Display label: the first CELL_MAX characters of the cell, markdown links →
 * their text, no backticks or UNSAFE_RE characters, whitespace collapsed, cut
 * to LABEL_MAX code points.
 * @param {string} cell
 * @returns {string}
 */
function cleanLabel(cell) {
  const text = cell
    .slice(0, CELL_MAX)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(UNSAFE_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, LABEL_MAX).join("");
}

/**
 * Rows of every markdown table whose header has a `Status` column, outside
 * fenced code blocks. Only rows whose status cell is one of the four progress
 * values are kept; the label is the next cell (Phase or Task).
 * @param {string} text
 * @returns {ProgressRow[]}
 */
export function parseProgress(text) {
  /** @type {ProgressRow[]} */
  const rows = [];
  if (typeof text !== "string") return rows;
  const lines = text.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line.startsWith("|")) continue;
    const sep = (lines[i + 1] ?? "").trim();
    if (!/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(sep)) continue;
    const statusIdx = splitRow(line).findIndex(
      (cell) => cell.toLowerCase() === "status",
    );
    i += 2;
    for (; i < lines.length && lines[i].trim().startsWith("|"); i++) {
      if (statusIdx === -1) continue;
      const cells = splitRow(lines[i]);
      const status = STATUS_CELLS.get(cells[statusIdx]);
      if (status)
        rows.push({ status, label: cleanLabel(cells[statusIdx + 1] ?? "") });
    }
    i--;
  }
  return rows;
}

/**
 * Counts per status and the current row label.
 * @param {ProgressRow[]} rows
 * @returns {ProgressSummary}
 */
export function summarize(rows) {
  /** @type {ProgressSummary} */
  const out = { todo: 0, in_progress: 0, done: 0, failed: 0, current: null };
  for (const row of rows) out[row.status]++;
  const current =
    rows.find((row) => row.status === "in_progress") ??
    rows.find((row) => row.status === "todo");
  out.current = current ? current.label : null;
  return out;
}

/**
 * Latest-modified entry of a list, or null when empty.
 * @param {PlanEntry[]} entries
 * @returns {PlanEntry | null}
 */
function latest(entries) {
  let best = null;
  for (const entry of entries) {
    if (best === null || entry.mtimeMs > best.mtimeMs) best = entry;
  }
  return best;
}

/**
 * The plan to show: the latest-modified `status: in-progress` plan, else the
 * latest-modified plan overall; null when there are none.
 * @param {PlanEntry[]} entries
 * @returns {PlanEntry | null}
 */
export function pickActivePlan(entries) {
  const running = entries.filter(
    (entry) => entry.frontmatter?.status === "in-progress",
  );
  return latest(running.length > 0 ? running : entries);
}
