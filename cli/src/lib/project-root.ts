import { resolve } from "path";
import { run } from "./exec.js";

/**
 * Resolve the main git worktree root for a given directory.
 * Mirrors the shell logic in plugin/lib/cf-paths.sh cf_resolve_paths() lines 14-40.
 *
 * Cases:
 *   1. Main worktree       — git-common-dir returns ".git" → return resolved baseDir
 *   2. Linked worktree     — git-common-dir returns absolute path ending in "/.git"
 *                            → strip trailing "/.git" to get main worktree root
 *   3. Non-git directory   — git command fails → return resolved baseDir
 *   4. Fallback            — git-common-dir does not end in "/.git"
 *                            → use git rev-parse --show-toplevel; if empty, return baseDir
 *
 * Note: from a SUBDIRECTORY of the main worktree, `git rev-parse --git-common-dir` returns
 * a relative path like "../.git", which ends in "/.git" and is handled by case 2 — resolving
 * it against baseDir yields the main worktree root.
 */
export function resolveMainRepoRoot(baseDir: string): string {
  const gitCommonDir = run("git", [
    "-C",
    baseDir,
    "rev-parse",
    "--git-common-dir",
  ]);

  if (!gitCommonDir) {
    // Not a git repo or git failed — fall back to baseDir
    return resolve(baseDir);
  }

  if (gitCommonDir === ".git") {
    // Already in the main worktree
    return resolve(baseDir);
  }

  // Non-main worktree: git-common-dir is typically an absolute path ending in "/.git".
  // candidate is absolute here, so baseDir only anchors the relative-subdir/fallback cases below.
  if (gitCommonDir.endsWith("/.git")) {
    // Strip trailing "/.git" to get the main worktree root
    const candidate = gitCommonDir.slice(0, -5);
    return resolve(baseDir, candidate);
  }

  // Stripping had no effect (path didn't end in "/.git") — fall back to show-toplevel
  const topLevel = run("git", ["-C", baseDir, "rev-parse", "--show-toplevel"]);
  if (topLevel) {
    return resolve(baseDir, topLevel);
  }

  return resolve(baseDir);
}
