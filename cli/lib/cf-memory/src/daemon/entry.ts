/**
 * Daemon entry point — spawned as a detached child process.
 *
 * Usage: node daemon/entry.js <docsDir> [idleTimeoutMs]
 */
import path from "node:path";
import { MiniSearchBackend } from "../backends/minisearch.js";
import { startDaemonServer } from "./process.js";
import { setupWatcher } from "./watcher.js";

const docsDir = process.argv[2];
if (!docsDir) {
  process.stderr.write(
    "Usage: node daemon/entry.js <docsDir> [idleTimeoutMs]\n",
  );
  process.exit(1);
}

const resolvedDir = path.resolve(docsDir);
const idleTimeoutMs = process.argv[3]
  ? parseInt(process.argv[3], 10)
  : undefined;

const backend = new MiniSearchBackend(resolvedDir);

const { close } = startDaemonServer(backend, {
  idleTimeoutMs,
});

// Watch for file changes
const watcher = setupWatcher(resolvedDir, backend);

// Clean up watcher on shutdown
const origClose = close;
const wrappedClose = () => {
  watcher.close();
  origClose();
};

process.on("SIGTERM", wrappedClose);
process.on("SIGINT", wrappedClose);
