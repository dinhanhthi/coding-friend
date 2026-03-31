/**
 * Sync convention memories to the project's CLAUDE.md file.
 *
 * When a memory of type "preference" (category "conventions") is stored,
 * updated, or deleted, the corresponding entry in CLAUDE.md is kept in sync.
 *
 * Entries are tracked via HTML comments: <!-- cf:<memory-id> -->
 * All entries live under a dedicated section header.
 *
 * Note: The read-modify-write cycle assumes single-threaded MCP tool
 * execution (sequential tool calls). No file-level locking is needed
 * under this model.
 */
import fs from "node:fs";
import path from "node:path";

export const SECTION_HEADER = "## CF Memory: Project Rules";

/** @deprecated Old header — kept for migration. Removed after reading. */
const LEGACY_HEADER = "## CF Memory: Conventions";

// Tested per-line via .split("\n"), not against the full document,
// so the $ anchor correctly matches end-of-line without the `m` flag.
const ENTRY_RE = /^- .+ <!-- cf:(.+?) -->$/;

/**
 * Derive project root from docsDir by stripping known suffixes.
 *
 * Expected docsDir formats:
 * - `<project>/docs/memory` (standard layout, preferred)
 * - `<project>/memory` (fallback for non-standard layouts)
 * - Any other path is used as-is (CLAUDE.md written alongside docsDir)
 */
function projectRoot(docsDir: string): string {
  let root = path.resolve(docsDir);
  root = root.replace(/\/docs\/memory$/, "").replace(/\/memory$/, "");
  return root;
}

/**
 * Resolve the CLAUDE.md path for a given docsDir.
 * Exported so tool handlers can display the path in status frames
 * without reimplementing the projectRoot derivation.
 */
export function claudeMdPath(docsDir: string): string {
  return path.join(projectRoot(docsDir), "CLAUDE.md");
}

/**
 * Parse a CLAUDE.md file into: before the section, section entries, and after the section.
 */
function parseClaudeMd(content: string): {
  before: string;
  entries: string[];
  after: string;
  untrackedLines: string[];
} {
  // Try current header first, then legacy header for migration
  let headerIdx = content.indexOf(SECTION_HEADER);
  let headerLen = SECTION_HEADER.length;
  if (headerIdx === -1) {
    headerIdx = content.indexOf(LEGACY_HEADER);
    headerLen = LEGACY_HEADER.length;
  }
  if (headerIdx === -1) {
    return { before: content, entries: [], after: "", untrackedLines: [] };
  }

  const before = content.slice(0, headerIdx);
  const rest = content.slice(headerIdx + headerLen);

  // Find the next section header (## ) to determine where our section ends
  const nextSectionMatch = rest.match(/\n(## )/);
  let sectionBody: string;
  let after: string;

  if (nextSectionMatch && nextSectionMatch.index !== undefined) {
    sectionBody = rest.slice(0, nextSectionMatch.index);
    after = rest.slice(nextSectionMatch.index + 1); // +1 to skip the \n
  } else {
    sectionBody = rest;
    after = "";
  }

  // Extract tracked entries (lines matching "- ... <!-- cf:... -->")
  // and preserve untracked lines within the section
  const lines = sectionBody.split("\n");
  const entries: string[] = [];
  const untrackedLines: string[] = [];

  for (const line of lines) {
    if (ENTRY_RE.test(line)) {
      entries.push(line);
    } else if (line.trim()) {
      untrackedLines.push(line);
    }
  }

  return { before, entries, after, untrackedLines };
}

/**
 * Rebuild the CLAUDE.md content from its parts.
 */
function buildClaudeMd(
  before: string,
  entries: string[],
  after: string,
  untrackedLines: string[] = [],
): string {
  // If no entries and no untracked lines, remove the section entirely
  if (entries.length === 0 && untrackedLines.length === 0) {
    const result = before.trimEnd() + (after ? "\n\n" + after : "\n");
    return result;
  }

  let result = before.trimEnd() + "\n\n" + SECTION_HEADER + "\n\n";
  if (untrackedLines.length > 0) {
    result += untrackedLines.join("\n") + "\n";
  }
  if (entries.length > 0) {
    result += entries.join("\n") + "\n";
  }
  if (after) {
    result += "\n" + after;
  }
  return result;
}

/**
 * Format a concise single-line entry for CLAUDE.md.
 */
function formatEntry(id: string, description: string): string {
  // Take only first line and trim
  const oneLiner = description.split("\n")[0].trim();
  return `- ${oneLiner} <!-- cf:${id} -->`;
}

/**
 * Add or update a convention entry in the project's CLAUDE.md.
 */
export function syncToClaudeMd(
  docsDir: string,
  id: string,
  description: string,
): void {
  const filePath = claudeMdPath(docsDir);
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf-8")
    : "";

  const { before, entries, after, untrackedLines } = parseClaudeMd(existing);

  // Remove any existing entry with the same ID
  const filtered = entries.filter((e) => {
    const match = e.match(ENTRY_RE);
    return !match || match[1] !== id;
  });

  // Add the new/updated entry
  filtered.push(formatEntry(id, description));

  fs.writeFileSync(
    filePath,
    buildClaudeMd(before, filtered, after, untrackedLines),
    "utf-8",
  );
}

/**
 * Remove a convention entry from the project's CLAUDE.md.
 */
export function removeFromClaudeMd(docsDir: string, id: string): void {
  const filePath = claudeMdPath(docsDir);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const { before, entries, after, untrackedLines } = parseClaudeMd(content);

  if (entries.length === 0) return;

  const filtered = entries.filter((e) => {
    const match = e.match(ENTRY_RE);
    return !match || match[1] !== id;
  });

  // Only write if something actually changed
  if (filtered.length === entries.length) return;

  fs.writeFileSync(
    filePath,
    buildClaudeMd(before, filtered, after, untrackedLines),
    "utf-8",
  );
}

/**
 * Update an existing convention entry in CLAUDE.md (no upsert).
 */
export function updateInClaudeMd(
  docsDir: string,
  id: string,
  description: string,
): void {
  const filePath = claudeMdPath(docsDir);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const { before, entries, after, untrackedLines } = parseClaudeMd(content);

  // Check if entry exists
  const idx = entries.findIndex((e) => {
    const match = e.match(ENTRY_RE);
    return match && match[1] === id;
  });

  if (idx === -1) return;

  entries[idx] = formatEntry(id, description);

  fs.writeFileSync(
    filePath,
    buildClaudeMd(before, entries, after, untrackedLines),
    "utf-8",
  );
}
