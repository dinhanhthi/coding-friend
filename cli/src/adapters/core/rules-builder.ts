import { readFileSync, existsSync } from "fs";
import { SECTION_MARKER_START, SECTION_MARKER_END } from "../types.js";

// ---------------------------------------------------------------------------
// Section marker utilities
// ---------------------------------------------------------------------------

/**
 * Wrap content with coding-friend section markers.
 */
export function wrapWithMarkers(content: string): string {
  return `${SECTION_MARKER_START}\n${content}\n${SECTION_MARKER_END}`;
}

/**
 * Replace the coding-friend section in an existing file, or append it.
 * Returns the updated file content.
 */
export function upsertSection(existingContent: string, newSection: string): string {
  const wrapped = wrapWithMarkers(newSection);

  const startIdx = existingContent.indexOf(SECTION_MARKER_START);
  const endIdx = existingContent.indexOf(SECTION_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing section
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + SECTION_MARKER_END.length);
    return before + wrapped + after;
  }

  // Append with separator
  const separator = existingContent.trim().length > 0 ? "\n\n" : "";
  return existingContent + separator + wrapped + "\n";
}

/**
 * Remove the coding-friend section from a file.
 * Returns the cleaned content, or null if no section was found.
 */
export function removeSection(existingContent: string): string | null {
  const startIdx = existingContent.indexOf(SECTION_MARKER_START);
  const endIdx = existingContent.indexOf(SECTION_MARKER_END);

  if (startIdx === -1 || endIdx === -1) return null;

  const before = existingContent.slice(0, startIdx);
  const after = existingContent.slice(endIdx + SECTION_MARKER_END.length);

  // Clean up extra blank lines
  return (before + after).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * Read an existing file and upsert the coding-friend section.
 * If the file doesn't exist, returns just the wrapped section.
 */
export function mergeIntoFile(filePath: string, newSection: string): string {
  if (!existsSync(filePath)) {
    return wrapWithMarkers(newSection) + "\n";
  }
  const existing = readFileSync(filePath, "utf-8");
  return upsertSection(existing, newSection);
}

// ---------------------------------------------------------------------------
// Common rule document builder
// ---------------------------------------------------------------------------

/**
 * Build a combined rules document from multiple sections.
 */
export function buildRulesDocument(sections: string[]): string {
  return sections.filter(Boolean).join("\n\n---\n\n") + "\n";
}
