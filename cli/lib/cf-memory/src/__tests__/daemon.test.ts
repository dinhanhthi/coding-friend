import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import http from "node:http";
import {
  getDaemonPaths,
  isDaemonRunning,
  getDaemonInfo,
  startDaemonServer,
  type DaemonPaths,
} from "../daemon/process.js";
import { MiniSearchBackend } from "../backends/minisearch.js";
import type { StoreInput } from "../lib/types.js";

let testDir: string;
let testPaths: DaemonPaths;
let counter = 0;

function requestJson<T>(
  socketPath: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) as T });
        } catch {
          reject(new Error(`Invalid JSON: ${data}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-daemon-test-${Date.now()}-${++counter}`);
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

describe("Daemon process helpers", () => {
  it("isDaemonRunning returns false when no PID file", async () => {
    const running = await isDaemonRunning(testPaths);
    expect(running).toBe(false);
  });

  it("isDaemonRunning returns false for stale PID file", async () => {
    writeFileSync(testPaths.pidFile, "99999999\n1234567890", "utf-8");
    const running = await isDaemonRunning(testPaths);
    expect(running).toBe(false);
    // Should clean up stale PID file
    expect(existsSync(testPaths.pidFile)).toBe(false);
  });

  it("getDaemonInfo returns null when no PID file", () => {
    const info = getDaemonInfo(testPaths);
    expect(info).toBeNull();
  });

  it("getDaemonInfo reads PID and startedAt", () => {
    const now = Date.now();
    writeFileSync(testPaths.pidFile, `12345\n${now}`, "utf-8");
    const info = getDaemonInfo(testPaths);
    expect(info).not.toBeNull();
    expect(info!.pid).toBe(12345);
    expect(info!.startedAt).toBe(now);
  });

  it("getDaemonPaths returns expected structure", () => {
    const paths = getDaemonPaths();
    expect(paths.socketPath).toContain("daemon.sock");
    expect(paths.pidFile).toContain("daemon.pid");
    expect(paths.logFile).toContain("daemon.log");
  });
});

describe("Daemon server", () => {
  let docsDir: string;
  let handle: ReturnType<typeof startDaemonServer> | null = null;

  beforeEach(() => {
    docsDir = join(testDir, "docs");
    mkdirSync(docsDir, { recursive: true });
  });

  afterEach(async () => {
    if (handle) {
      // Clean up server without exiting process
      await new Promise<void>((resolve) => {
        handle!.server.close(() => resolve());
      });
      try {
        rmSync(testPaths.socketPath, { force: true });
        rmSync(testPaths.pidFile, { force: true });
      } catch {
        // ignore
      }
      handle = null;
    }
  });

  function startTestDaemon() {
    const backend = new MiniSearchBackend(docsDir);
    handle = startDaemonServer(backend, {
      paths: testPaths,
      idleTimeoutMs: 0, // Disable idle timeout for tests
    });
    return new Promise<void>((resolve) => {
      // Wait for server to be listening
      handle!.server.once("listening", resolve);
    });
  }

  it("health endpoint responds with status ok", async () => {
    await startTestDaemon();
    const { status, data } = await requestJson<{ status: string }>(
      testPaths.socketPath,
      "GET",
      "/health",
    );
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
  });

  it("stats endpoint returns memory stats", async () => {
    await startTestDaemon();
    const { status, data } = await requestJson<{ total: number }>(
      testPaths.socketPath,
      "GET",
      "/stats",
    );
    expect(status).toBe(200);
    expect(data.total).toBe(0);
  });

  it("store and retrieve a memory via HTTP", async () => {
    await startTestDaemon();

    const input: StoreInput = {
      title: "Test Memory",
      description: "A test memory",
      type: "fact",
      tags: ["test"],
      content: "Test content.",
    };

    // Store
    const storeResult = await requestJson<{
      id: string;
      stored: boolean;
    }>(testPaths.socketPath, "POST", "/memory", input);
    expect(storeResult.status).toBe(201);
    expect(storeResult.data.stored).toBe(true);
    expect(storeResult.data.id).toBe("features/test-memory");

    // Retrieve
    const { status, data } = await requestJson<{
      id: string;
      frontmatter: { title: string };
    }>(testPaths.socketPath, "GET", "/memory/features/test-memory");
    expect(status).toBe(200);
    expect(data.frontmatter.title).toBe("Test Memory");
  });

  it("search returns results", async () => {
    await startTestDaemon();

    await requestJson(testPaths.socketPath, "POST", "/memory", {
      title: "JWT Authentication",
      description: "Auth pattern",
      type: "fact",
      tags: ["auth"],
      content: "JWT tokens.",
    });

    const { status, data } = await requestJson<
      Array<{ memory: { frontmatter: { title: string } } }>
    >(testPaths.socketPath, "GET", "/memory/search?query=JWT");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].memory.frontmatter.title).toContain("JWT");
  });

  it("list returns all memories", async () => {
    await startTestDaemon();

    await requestJson(testPaths.socketPath, "POST", "/memory", {
      title: "Memory One",
      description: "First",
      type: "fact",
      tags: [],
      content: "One.",
    });
    await requestJson(testPaths.socketPath, "POST", "/memory", {
      title: "Memory Two",
      description: "Second",
      type: "episode",
      tags: [],
      content: "Two.",
    });

    const { status, data } = await requestJson<Array<{ id: string }>>(
      testPaths.socketPath,
      "GET",
      "/memory",
    );
    expect(status).toBe(200);
    expect(data.length).toBe(2);
  });

  it("update modifies a memory", async () => {
    await startTestDaemon();

    await requestJson(testPaths.socketPath, "POST", "/memory", {
      title: "Original Title",
      description: "Description",
      type: "fact",
      tags: [],
      content: "Content.",
    });

    const { status, data } = await requestJson<{
      updated: boolean;
      title: string;
    }>(testPaths.socketPath, "PATCH", "/memory/features/original-title", {
      title: "New Title",
    });
    expect(status).toBe(200);
    expect(data.updated).toBe(true);
  });

  it("delete removes a memory", async () => {
    await startTestDaemon();

    await requestJson(testPaths.socketPath, "POST", "/memory", {
      title: "Delete Me",
      description: "To be deleted",
      type: "fact",
      tags: [],
      content: "Content.",
    });

    const { status, data } = await requestJson<{ deleted: boolean }>(
      testPaths.socketPath,
      "DELETE",
      "/memory/features/delete-me",
    );
    expect(status).toBe(200);
    expect(data.deleted).toBe(true);

    // Verify gone
    const { status: getStatus } = await requestJson(
      testPaths.socketPath,
      "GET",
      "/memory/features/delete-me",
    );
    expect(getStatus).toBe(404);
  });

  it("rebuild endpoint works", async () => {
    await startTestDaemon();

    const { status, data } = await requestJson<{ rebuilt: boolean }>(
      testPaths.socketPath,
      "POST",
      "/rebuild",
    );
    expect(status).toBe(200);
    expect(data.rebuilt).toBe(true);
  });

  it("returns 404 for non-existent memory", async () => {
    await startTestDaemon();

    const { status } = await requestJson(
      testPaths.socketPath,
      "GET",
      "/memory/features/nonexistent",
    );
    expect(status).toBe(404);
  });

  it("writes PID file on start", async () => {
    await startTestDaemon();
    expect(existsSync(testPaths.pidFile)).toBe(true);
  });
});
