import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { DaemonClient } from "../lib/daemon-client.js";
import { startDaemonServer, type DaemonPaths } from "../daemon/process.js";
import { MiniSearchBackend } from "../backends/minisearch.js";

let testDir: string;
let testPaths: DaemonPaths;
let counter = 0;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-daemon-client-test-${Date.now()}-${++counter}`);
  mkdirSync(testDir, { recursive: true });

  const daemonDir = join(testDir, "daemon");
  mkdirSync(daemonDir, { recursive: true });

  testPaths = {
    socketPath: join(daemonDir, "daemon.sock"),
    pidFile: join(daemonDir, "daemon.pid"),
    logFile: join(daemonDir, "daemon.log"),
  };
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("DaemonClient auto-reconnect", () => {
  it("calls respawn and retries on connection error", async () => {
    const docsDir = join(testDir, "docs");
    mkdirSync(docsDir, { recursive: true });

    // Start daemon
    const backend = new MiniSearchBackend(docsDir);
    let handle = startDaemonServer(backend, {
      paths: testPaths,
      idleTimeoutMs: 0,
    });
    await new Promise<void>((resolve) => {
      handle.server.once("listening", resolve);
    });

    const respawn = vi.fn(async () => {
      // Re-create a fresh backend and server on same paths
      const newBackend = new MiniSearchBackend(docsDir);
      handle = startDaemonServer(newBackend, {
        paths: testPaths,
        idleTimeoutMs: 0,
      });
      await new Promise<void>((resolve) => {
        handle.server.once("listening", resolve);
      });
      return true;
    });

    const client = new DaemonClient(testPaths.socketPath, { respawn });

    // Verify initial connection works
    const alive = await client.ping();
    expect(alive).toBe(true);

    // Kill daemon and wait for socket cleanup
    await new Promise<void>((resolve) => {
      handle.server.close(() => resolve());
    });
    rmSync(testPaths.socketPath, { force: true });
    rmSync(testPaths.pidFile, { force: true });
    // Small delay to ensure OS fully releases the socket
    await new Promise((r) => setTimeout(r, 50));

    // Next request should trigger respawn and succeed
    const stats = await client.stats();
    expect(stats.total).toBe(0);
    expect(respawn).toHaveBeenCalledOnce();

    // Cleanup
    await new Promise<void>((resolve) => {
      handle.server.close(() => resolve());
    });
    rmSync(testPaths.socketPath, { force: true });
    rmSync(testPaths.pidFile, { force: true });
  });

  it("throws original error when respawn fails", async () => {
    const respawn = vi.fn(async () => false);
    const client = new DaemonClient(
      "/tmp/nonexistent-cf-test-sock-" + Date.now(),
      { respawn },
    );

    await expect(client.stats()).rejects.toThrow();
    expect(respawn).toHaveBeenCalledOnce();
  });

  it("throws directly without respawn callback", async () => {
    const client = new DaemonClient(
      "/tmp/nonexistent-cf-test-sock-" + Date.now(),
    );

    await expect(client.stats()).rejects.toThrow();
  });

  it("ping does not trigger respawn", async () => {
    const respawn = vi.fn(async () => true);
    const client = new DaemonClient(
      "/tmp/nonexistent-cf-test-sock-" + Date.now(),
      { respawn },
    );

    // ping() should return false without attempting respawn
    const alive = await client.ping();
    expect(alive).toBe(false);
    expect(respawn).not.toHaveBeenCalled();
  });

  it("does not call respawn for HTTP 4xx errors", async () => {
    const docsDir = join(testDir, "docs");
    mkdirSync(docsDir, { recursive: true });

    const backend = new MiniSearchBackend(docsDir);
    const handle = startDaemonServer(backend, {
      paths: testPaths,
      idleTimeoutMs: 0,
    });
    await new Promise<void>((resolve) => {
      handle.server.once("listening", resolve);
    });

    const respawn = vi.fn(async () => true);
    const client = new DaemonClient(testPaths.socketPath, { respawn });

    // 404 is not a connection error — should not trigger respawn
    const result = await client.retrieve("nonexistent/id");
    expect(result).toBeNull();
    expect(respawn).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => {
      handle.server.close(() => resolve());
    });
    rmSync(testPaths.socketPath, { force: true });
    rmSync(testPaths.pidFile, { force: true });
  });
});
