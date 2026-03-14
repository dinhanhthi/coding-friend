import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import http from "node:http";
import matter from "gray-matter";
import { MiniSearchBackend } from "../backends/minisearch.js";
import { startDaemonServer, type DaemonPaths } from "../daemon/process.js";
import { DaemonClient } from "../lib/daemon-client.js";

let testDir: string;
let docsDir: string;
let testPaths: DaemonPaths;
let handle: ReturnType<typeof startDaemonServer> | null = null;
let client: DaemonClient;
let counter = 0;

beforeEach(async () => {
  testDir = join(tmpdir(), `cf-memory-e2e-${Date.now()}-${++counter}`);
  docsDir = join(testDir, "docs");
  mkdirSync(docsDir, { recursive: true });

  const daemonDir = join(testDir, "daemon");
  mkdirSync(daemonDir, { recursive: true });

  testPaths = {
    socketPath: join(daemonDir, "daemon.sock"),
    pidFile: join(daemonDir, "daemon.pid"),
    logFile: join(daemonDir, "daemon.log"),
  };

  const backend = new MiniSearchBackend(docsDir);
  handle = startDaemonServer(backend, {
    paths: testPaths,
    idleTimeoutMs: 0,
  });

  client = new DaemonClient(testPaths.socketPath);

  // Wait for server to be listening
  await new Promise<void>((resolve) => {
    handle!.server.once("listening", resolve);
  });
});

afterEach(async () => {
  if (handle) {
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
  rmSync(testDir, { recursive: true, force: true });
});

describe("Daemon E2E: DaemonClient → Daemon → MiniSearch → Markdown", () => {
  it("full pipeline: store → search → retrieve → update → delete", async () => {
    // Store
    const memory = await client.store({
      title: "E2E Auth Pattern",
      description: "JWT auth for API endpoints",
      type: "fact",
      tags: ["auth", "jwt"],
      content: "# Auth\n\nUses RS256 signed JWT tokens.",
    });
    expect(memory.id).toBe("features/e2e-auth-pattern");

    // Verify file on disk
    const filePath = join(docsDir, "features", "e2e-auth-pattern.md");
    expect(existsSync(filePath)).toBe(true);
    const raw = matter(readFileSync(filePath, "utf-8"));
    expect(raw.data.title).toBe("E2E Auth Pattern");
    expect(raw.data.type).toBe("fact");

    // Search via daemon
    const searchResults = await client.search({ query: "auth" });
    expect(searchResults.length).toBeGreaterThan(0);

    // Retrieve
    const retrieved = await client.retrieve("features/e2e-auth-pattern");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.frontmatter.title).toBe("E2E Auth Pattern");
    expect(retrieved!.content).toContain("RS256");

    // Update
    const updated = await client.update({
      id: "features/e2e-auth-pattern",
      title: "Updated E2E Auth Pattern",
      tags: ["security"],
    });
    expect(updated).not.toBeNull();
    expect(updated!.frontmatter.title).toBe("Updated E2E Auth Pattern");
    expect(updated!.frontmatter.tags).toContain("security");
    expect(updated!.frontmatter.tags).toContain("auth");

    // Verify update on disk
    const updatedRaw = matter(readFileSync(filePath, "utf-8"));
    expect(updatedRaw.data.title).toBe("Updated E2E Auth Pattern");

    // Delete
    const deleted = await client.delete("features/e2e-auth-pattern");
    expect(deleted).toBe(true);

    // Verify deleted from disk
    expect(existsSync(filePath)).toBe(false);

    // Verify search no longer finds it
    const afterDelete = await client.search({ query: "e2e auth" });
    expect(afterDelete.length).toBe(0);
  });

  it("list returns all stored memories", async () => {
    await client.store({
      title: "Memory One",
      description: "First memory",
      type: "fact",
      tags: ["one"],
      content: "Content one.",
    });
    await client.store({
      title: "Memory Two",
      description: "Second memory",
      type: "episode",
      tags: ["two"],
      content: "Content two.",
    });

    const list = await client.list({});
    expect(list.length).toBe(2);
  });

  it("stats reflects stored memories", async () => {
    await client.store({
      title: "A Fact",
      description: "Fact desc",
      type: "fact",
      tags: [],
      content: "Fact content.",
    });
    await client.store({
      title: "A Bug",
      description: "Bug desc",
      type: "episode",
      tags: [],
      content: "Bug content.",
    });

    const stats = await client.stats();
    expect(stats.total).toBe(2);
    expect(stats.byType.fact).toBe(1);
    expect(stats.byType.episode).toBe(1);
  });

  it("rebuild rebuilds the search index", async () => {
    await client.store({
      title: "Before Rebuild",
      description: "Test rebuild",
      type: "fact",
      tags: ["rebuild"],
      content: "Before rebuild content.",
    });

    const rebuilt = await client.rebuild();
    expect(rebuilt).toBe(true);

    // Search still works after rebuild
    const results = await client.search({ query: "rebuild" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("ping returns true when daemon is running", async () => {
    const alive = await client.ping();
    expect(alive).toBe(true);
  });

  it("retrieve returns null for non-existent memory", async () => {
    const result = await client.retrieve("features/nonexistent");
    expect(result).toBeNull();
  });

  it("delete returns false for non-existent memory", async () => {
    const result = await client.delete("features/nonexistent");
    expect(result).toBe(false);
  });

  it("update returns null for non-existent memory", async () => {
    const result = await client.update({
      id: "features/nonexistent",
      title: "Test",
    });
    expect(result).toBeNull();
  });
});

describe("DaemonClient fallback", () => {
  it("ping returns false when daemon not reachable", async () => {
    const deadClient = new DaemonClient(
      "/tmp/nonexistent-socket-" + Date.now(),
    );
    const alive = await deadClient.ping();
    expect(alive).toBe(false);
  });

  it("store throws when daemon not reachable", async () => {
    const deadClient = new DaemonClient(
      "/tmp/nonexistent-socket-" + Date.now(),
    );
    await expect(
      deadClient.store({
        title: "Test",
        description: "Test",
        type: "fact",
        tags: [],
        content: "Test",
      }),
    ).rejects.toThrow();
  });
});
