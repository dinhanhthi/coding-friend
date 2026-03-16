import fs from "node:fs";
import path from "node:path";
import type { MemoryBackend } from "../lib/backend.js";

export interface WatcherHandle {
  close: () => void;
}

/**
 * Watch docs/memory/ for changes and trigger index rebuild (debounced).
 */
export function setupWatcher(
  docsDir: string,
  backend: Required<Pick<MemoryBackend, "rebuild">>,
  debounceMs = 500,
): WatcherHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watchers: fs.FSWatcher[] = [];
  const watchedDirs = new Set<string>();

  function scheduleRebuild() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      backend.rebuild().catch(() => {});
    }, debounceMs);
  }

  function watchSubdir(dirPath: string) {
    if (watchedDirs.has(dirPath)) return;
    watchedDirs.add(dirPath);
    try {
      const w = fs.watch(dirPath, { persistent: false }, (_, filename) => {
        if (filename && filename.endsWith(".md")) {
          scheduleRebuild();
        }
      });
      watchers.push(w);
    } catch {
      watchedDirs.delete(dirPath);
    }
  }

  // Watch the root docs dir
  if (fs.existsSync(docsDir)) {
    try {
      const rootWatcher = fs.watch(
        docsDir,
        { persistent: false },
        (_, filename) => {
          if (filename && !filename.startsWith(".")) {
            scheduleRebuild();
            // If a new directory appeared, watch it too
            const subPath = path.join(docsDir, filename);
            try {
              if (fs.statSync(subPath).isDirectory()) {
                watchSubdir(subPath);
              }
            } catch {
              // File may have been deleted between event and stat
            }
          }
        },
      );
      watchers.push(rootWatcher);
    } catch {
      // Ignore watch errors (e.g., directory doesn't exist)
    }

    // Watch existing subdirectories
    try {
      const entries = fs.readdirSync(docsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          watchSubdir(path.join(docsDir, entry.name));
        }
      }
    } catch {
      // Ignore
    }
  }

  return {
    close() {
      if (timer) clearTimeout(timer);
      for (const w of watchers) {
        w.close();
      }
    },
  };
}
