/**
 * Daemon entry point — spawned as a detached child process.
 *
 * Usage: node daemon/entry.js <docsDir> [idleTimeoutMs] [--tier=full|lite]
 *
 * When --tier=full, uses SqliteBackend (requires lazy-installed deps).
 * Otherwise defaults to MiniSearchBackend.
 */
import path from "node:path";
import { MiniSearchBackend } from "../backends/minisearch.js";
import { areSqliteDepsAvailable } from "../lib/lazy-install.js";
import type { MemoryBackend } from "../lib/backend.js";
import { startDaemonServer } from "./process.js";
import { setupWatcher } from "./watcher.js";

const docsDir = process.argv[2];
if (!docsDir) {
  process.stderr.write(
    "Usage: node daemon/entry.js <docsDir> [idleTimeoutMs] [--tier=full|lite]\n",
  );
  process.exit(1);
}

const resolvedDir = path.resolve(docsDir);
const idleTimeoutMs =
  process.argv[3] && !process.argv[3].startsWith("--")
    ? parseInt(process.argv[3], 10)
    : undefined;

// Parse --tier flag from any position
const tierArg = process.argv.find((a) => a.startsWith("--tier="));
const requestedTier = tierArg?.split("=")[1];

async function createBackend(): Promise<MemoryBackend> {
  // Use SqliteBackend if requested or if deps are available and not forced to lite
  if (
    requestedTier === "full" ||
    (requestedTier !== "lite" && areSqliteDepsAvailable())
  ) {
    try {
      const { SqliteBackend } = await import("../backends/sqlite/index.js");
      return new SqliteBackend(resolvedDir);
    } catch (err) {
      process.stderr.write(
        `[cf-memory] SqliteBackend failed, falling back to MiniSearch: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  return new MiniSearchBackend(resolvedDir);
}

const backend = await createBackend();

// Only set up file watcher if backend supports rebuild
const watcher = backend.rebuild
  ? setupWatcher(
      resolvedDir,
      backend as Required<Pick<MemoryBackend, "rebuild">>,
    )
  : { close() {} };

const { close } = startDaemonServer(backend, {
  idleTimeoutMs,
  onShutdown: () => watcher.close(),
});

// Single place for signal handling — no duplicates
process.on("SIGTERM", close);
process.on("SIGINT", close);
