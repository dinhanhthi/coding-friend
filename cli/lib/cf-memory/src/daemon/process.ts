import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createDaemonApp } from "./server.js";
import type { MemoryBackend } from "../lib/backend.js";

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface DaemonPaths {
  socketPath: string;
  pidFile: string;
  logFile: string;
}

export function getDaemonPaths(): DaemonPaths {
  const baseDir = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
    ".coding-friend",
    "memory",
  );
  fs.mkdirSync(baseDir, { recursive: true });
  return {
    socketPath: path.join(baseDir, "daemon.sock"),
    pidFile: path.join(baseDir, "daemon.pid"),
    logFile: path.join(baseDir, "daemon.log"),
  };
}

/**
 * Check if the daemon is running by trying to connect to the socket.
 */
export async function isDaemonRunning(paths?: DaemonPaths): Promise<boolean> {
  const { socketPath, pidFile } = paths ?? getDaemonPaths();

  // Check PID file first
  if (!fs.existsSync(pidFile)) return false;

  const pid = parseInt(
    fs.readFileSync(pidFile, "utf-8").trim().split("\n")[0],
    10,
  );
  if (isNaN(pid)) return false;

  // Check if process is alive
  try {
    process.kill(pid, 0);
  } catch {
    // Process not running, clean up stale files
    cleanupDaemonFiles(paths);
    return false;
  }

  // Try to connect to socket
  return new Promise((resolve) => {
    const client = net.createConnection({ path: socketPath }, () => {
      client.end();
      resolve(true);
    });
    client.on("error", () => {
      resolve(false);
    });
    client.setTimeout(1000, () => {
      client.destroy();
      resolve(false);
    });
  });
}

/**
 * Get daemon info from PID file.
 */
export function getDaemonInfo(
  paths?: DaemonPaths,
): { pid: number; startedAt: number } | null {
  const { pidFile } = paths ?? getDaemonPaths();
  if (!fs.existsSync(pidFile)) return null;

  const content = fs.readFileSync(pidFile, "utf-8").trim();
  const lines = content.split("\n");
  const pid = parseInt(lines[0], 10);
  if (isNaN(pid)) return null;

  const startedAt = lines[1] ? parseInt(lines[1], 10) : Date.now();
  return { pid, startedAt };
}

function cleanupDaemonFiles(paths?: DaemonPaths): void {
  const { socketPath, pidFile } = paths ?? getDaemonPaths();
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // Ignore
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // Ignore
  }
}

export interface DaemonHandle {
  close: () => void;
  server: http.Server;
}

/**
 * Start the daemon HTTP server on a Unix Domain Socket.
 *
 * Signal handling is NOT registered here — the caller owns that.
 * Use the returned `close()` to trigger graceful shutdown.
 */
export function startDaemonServer(
  backend: MemoryBackend,
  opts?: {
    idleTimeoutMs?: number;
    paths?: DaemonPaths;
    onShutdown?: () => void;
  },
): DaemonHandle {
  const paths = opts?.paths ?? getDaemonPaths();
  const idleTimeoutMs = opts?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const { socketPath, pidFile } = paths;

  // Clean up stale socket (catch ENOENT instead of TOCTOU check-then-act)
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // No stale socket — fine
  }

  const app = createDaemonApp(backend);
  const listener = getRequestListener(app.fetch);

  const server = http.createServer(listener);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let shuttingDown = false;

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeoutMs > 0) {
      idleTimer = setTimeout(() => {
        shutdown();
      }, idleTimeoutMs);
    }
  }

  // Reset idle timer on each request
  server.on("request", () => {
    resetIdleTimer();
  });

  server.listen(socketPath, () => {
    // Write PID file
    fs.writeFileSync(pidFile, `${process.pid}\n${Date.now()}`, "utf-8");
    resetIdleTimer();
  });

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    if (idleTimer) clearTimeout(idleTimer);
    opts?.onShutdown?.();
    backend.close().catch(() => {});
    server.close(() => {
      cleanupDaemonFiles(paths);
      process.exit(0);
    });
    // Force exit after 5 seconds
    setTimeout(() => process.exit(1), 5000).unref();
  }

  return { close: shutdown, server };
}

/**
 * Stop the daemon by sending SIGTERM.
 */
export async function stopDaemon(paths?: DaemonPaths): Promise<boolean> {
  const { pidFile } = paths ?? getDaemonPaths();
  if (!fs.existsSync(pidFile)) return false;

  const pid = parseInt(
    fs.readFileSync(pidFile, "utf-8").trim().split("\n")[0],
    10,
  );
  if (isNaN(pid)) return false;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already dead
    cleanupDaemonFiles(paths);
    return false;
  }

  // Wait for process to exit (max 5 seconds)
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      process.kill(pid, 0);
    } catch {
      // Process exited
      cleanupDaemonFiles(paths);
      return true;
    }
  }

  // Force kill
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already dead
  }
  cleanupDaemonFiles(paths);
  return true;
}
