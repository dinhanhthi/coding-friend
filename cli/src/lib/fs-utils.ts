import { readdirSync } from "fs";
import { join } from "path";

/**
 * Recursively list all .md files (excluding README.md) under a directory.
 *
 * @param dir - Directory to scan.
 * @param maxDepth - Maximum recursion depth (default 15, safety against symlink loops).
 *   At maxDepth=0, only files in `dir` itself are returned (no recursion).
 * @returns Array of filenames (basename only, not full paths).
 */
export function listMdFilesRecursive(
  dir: string,
  maxDepth: number = 15,
): string[] {
  try {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (maxDepth > 0) {
          results.push(
            ...listMdFilesRecursive(join(dir, entry.name), maxDepth - 1),
          );
        }
      } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
        results.push(entry.name);
      }
    }
    return results;
  } catch {
    return [];
  }
}
