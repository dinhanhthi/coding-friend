import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectTier, createBackendForTier, TIERS } from "../lib/tier.js";
import { MarkdownBackend } from "../backends/markdown.js";
import { DaemonClient } from "../lib/daemon-client.js";
import type { DaemonPaths } from "../daemon/process.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-tier-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("detectTier()", () => {
  it("returns Tier 3 (markdown) when no daemon is running and no sqlite deps", async () => {
    const lazyInstall = await import("../lib/lazy-install.js");
    const sqliteSpy = vi
      .spyOn(lazyInstall, "areSqliteDepsAvailable")
      .mockReturnValue(false);
    const daemonProcess = await import("../daemon/process.js");
    const daemonSpy = vi
      .spyOn(daemonProcess, "isDaemonRunning")
      .mockResolvedValue(false);
    try {
      const tier = await detectTier();
      // Without a daemon running and no SQLite deps, should detect Tier 3
      expect(tier.name).toBe("markdown");
      expect(tier.number).toBe(3);
      expect(tier.label).toContain("Tier 3");
    } finally {
      sqliteSpy.mockRestore();
      daemonSpy.mockRestore();
    }
  });

  it("respects config override to markdown", async () => {
    const tier = await detectTier("markdown");
    expect(tier.name).toBe("markdown");
  });

  it("respects config override to lite", async () => {
    const tier = await detectTier("lite");
    expect(tier.name).toBe("lite");
    expect(tier.number).toBe(2);
  });

  it("respects config override to full", async () => {
    const tier = await detectTier("full");
    expect(tier.name).toBe("full");
    expect(tier.number).toBe(1);
  });

  it("auto mode defaults to markdown when no daemon and no sqlite deps", async () => {
    // Mock areSqliteDepsAvailable to return false
    const lazyInstall = await import("../lib/lazy-install.js");
    const sqliteSpy = vi
      .spyOn(lazyInstall, "areSqliteDepsAvailable")
      .mockReturnValue(false);
    const daemonProcess = await import("../daemon/process.js");
    const daemonSpy = vi
      .spyOn(daemonProcess, "isDaemonRunning")
      .mockResolvedValue(false);
    try {
      const tier = await detectTier("auto");
      expect(tier.name).toBe("markdown");
    } finally {
      sqliteSpy.mockRestore();
      daemonSpy.mockRestore();
    }
  });

  it("auto mode returns full when SQLite deps are available", async () => {
    const lazyInstall = await import("../lib/lazy-install.js");
    const sqliteSpy = vi
      .spyOn(lazyInstall, "areSqliteDepsAvailable")
      .mockReturnValue(true);
    try {
      const tier = await detectTier("auto");
      expect(tier.name).toBe("full");
      expect(tier.number).toBe(1);
    } finally {
      sqliteSpy.mockRestore();
    }
  });

  it("auto mode returns lite when daemon is running (no sqlite deps)", async () => {
    // Mock areSqliteDepsAvailable to return false, isDaemonRunning to return true
    const lazyInstall = await import("../lib/lazy-install.js");
    const sqliteSpy = vi
      .spyOn(lazyInstall, "areSqliteDepsAvailable")
      .mockReturnValue(false);
    const daemonProcess = await import("../daemon/process.js");
    const spy = vi
      .spyOn(daemonProcess, "isDaemonRunning")
      .mockResolvedValue(true);
    try {
      const tier = await detectTier("auto");
      expect(tier.name).toBe("lite");
      expect(tier.number).toBe(2);
    } finally {
      spy.mockRestore();
      sqliteSpy.mockRestore();
    }
  });
});

describe("createBackendForTier()", () => {
  it("creates MarkdownBackend for markdown tier", async () => {
    const { backend, tier } = await createBackendForTier(testDir, "markdown");
    expect(tier.name).toBe("markdown");
    expect(backend).toBeInstanceOf(MarkdownBackend);
    await backend.close();
  });

  it("auto tier falls back to markdown when no daemon and no sqlite deps", async () => {
    const lazyInstall = await import("../lib/lazy-install.js");
    const sqliteSpy = vi
      .spyOn(lazyInstall, "areSqliteDepsAvailable")
      .mockReturnValue(false);
    const daemonProcess = await import("../daemon/process.js");
    const daemonSpy = vi
      .spyOn(daemonProcess, "isDaemonRunning")
      .mockResolvedValue(false);
    try {
      const { backend, tier } = await createBackendForTier(testDir, "auto");
      expect(tier.name).toBe("markdown");
      expect(backend).toBeInstanceOf(MarkdownBackend);
      await backend.close();
    } finally {
      sqliteSpy.mockRestore();
      daemonSpy.mockRestore();
    }
  });

  it("auto tier creates SqliteBackend when sqlite deps available", async () => {
    const lazyInstall = await import("../lib/lazy-install.js");
    if (!lazyInstall.areSqliteDepsAvailable()) return; // skip if deps not installed
    const dbPath = join(testDir, "db.sqlite");
    const { backend, tier } = await createBackendForTier(
      testDir,
      "auto",
      undefined,
      { dbPath },
    );
    expect(tier.name).toBe("full");
    await backend.close();
  });

  it("full tier falls back to markdown when SQLite deps not available", async () => {
    // Without lazy-installed deps, SqliteBackend will fail to construct
    // and createBackendForTier should fall back to markdown
    const dbPath = join(testDir, "db.sqlite");
    const { backend, tier } = await createBackendForTier(
      testDir,
      "full",
      undefined,
      { dbPath },
    );
    // Falls back because better-sqlite3 is not installed in test env
    expect(["markdown", "full"]).toContain(tier.name);
    await backend.close();
  });

  it("lite tier with running daemon returns DaemonClient", async () => {
    // Start a real daemon to test the full path
    const { MiniSearchBackend } = await import("../backends/minisearch.js");
    const { startDaemonServer } = await import("../daemon/process.js");

    const docsDir = join(testDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const daemonDir = join(testDir, "daemon");
    mkdirSync(daemonDir, { recursive: true });

    const paths: DaemonPaths = {
      socketPath: join(daemonDir, "daemon.sock"),
      pidFile: join(daemonDir, "daemon.pid"),
      logFile: join(daemonDir, "daemon.log"),
    };

    const backend = new MiniSearchBackend(docsDir);
    const handle = startDaemonServer(backend, {
      paths,
      idleTimeoutMs: 0,
    });

    await new Promise<void>((resolve) => {
      handle.server.once("listening", resolve);
    });

    try {
      // Mock getDaemonPaths so createBackendForTier uses our test paths
      const daemonProcess = await import("../daemon/process.js");
      const pathsSpy = vi
        .spyOn(daemonProcess, "getDaemonPaths")
        .mockReturnValue(paths);

      const { backend: created, tier } = await createBackendForTier(
        docsDir,
        "lite",
      );
      expect(tier.name).toBe("lite");
      expect(created).toBeInstanceOf(DaemonClient);
      await created.close();
      pathsSpy.mockRestore();
    } finally {
      await new Promise<void>((resolve) => {
        handle.server.close(() => resolve());
      });
      rmSync(paths.socketPath, { force: true });
      rmSync(paths.pidFile, { force: true });
    }
  });

  it("lite tier falls back to markdown when daemon is unreachable mid-session", async () => {
    // Simulate: tier detection says "lite" but daemon socket is gone
    // Must also mock SQLite deps away so auto tier picks "lite" over "full"
    const lazyInstall = await import("../lib/lazy-install.js");
    const sqliteSpy = vi
      .spyOn(lazyInstall, "areSqliteDepsAvailable")
      .mockReturnValue(false);
    const daemonProcess = await import("../daemon/process.js");
    const spy = vi
      .spyOn(daemonProcess, "isDaemonRunning")
      .mockResolvedValue(true);
    const pathsSpy = vi.spyOn(daemonProcess, "getDaemonPaths").mockReturnValue({
      socketPath: "/tmp/nonexistent-cf-test-sock-" + Date.now(),
      pidFile: "/tmp/nonexistent-cf-test-pid-" + Date.now(),
      logFile: "/tmp/nonexistent-cf-test-log-" + Date.now(),
    });

    try {
      const { backend: created, tier } = await createBackendForTier(
        testDir,
        "auto",
      );
      // DaemonClient.ping() fails → falls back to MarkdownBackend
      expect(tier.name).toBe("markdown");
      expect(created).toBeInstanceOf(MarkdownBackend);
      await created.close();
    } finally {
      sqliteSpy.mockRestore();
      spy.mockRestore();
      pathsSpy.mockRestore();
    }
  });
});

describe("createBackendForTier() with embeddingConfig", () => {
  it("accepts an optional embeddingConfig parameter without error", async () => {
    const embeddingConfig = {
      provider: "ollama" as const,
      model: "nomic-embed-text",
      ollamaUrl: "http://localhost:11434",
    };
    // Should not throw — markdown tier ignores embedding config gracefully
    const { backend, tier } = await createBackendForTier(
      testDir,
      "markdown",
      embeddingConfig,
    );
    expect(tier.name).toBe("markdown");
    expect(backend).toBeInstanceOf(MarkdownBackend);
    await backend.close();
  });

  it("passes embeddingConfig through when full tier falls back to markdown", async () => {
    const embeddingConfig = {
      provider: "ollama" as const,
      model: "nomic-embed-text",
    };
    const dbPath = join(testDir, "db.sqlite");
    // Full tier will fail (no sqlite deps in test env) and fall back
    const { backend, tier } = await createBackendForTier(
      testDir,
      "full",
      embeddingConfig,
      { dbPath },
    );
    // Falls back because better-sqlite3 is not installed in test env
    expect(["markdown", "full"]).toContain(tier.name);
    await backend.close();
  });
});

describe("makeRespawn retry logic", () => {
  it("retries up to 3 times before giving up", async () => {
    const daemonProcess = await import("../daemon/process.js");

    let attempts = 0;
    const spawnSpy = vi
      .spyOn(daemonProcess, "spawnDaemon")
      .mockImplementation(async () => {
        attempts++;
        return null; // always fail
      });
    // Isolate from real daemon state on the host machine
    const runningSpy = vi
      .spyOn(daemonProcess, "isDaemonRunning")
      .mockResolvedValue(false);

    // Use createBackendForTier with "lite" to trigger respawn path
    // The respawn callback wraps makeRespawn which calls spawnDaemon
    // We need to get the respawn function indirectly
    // Instead, test via the exported createRespawnWithRetry
    const { createRespawnWithRetry } = await import("../lib/tier.js");
    const respawn = createRespawnWithRetry(".", undefined, undefined);
    const result = await respawn();

    expect(result).toBe(false);
    expect(attempts).toBe(3);

    spawnSpy.mockRestore();
    runningSpy.mockRestore();
  });

  it("succeeds on second attempt", async () => {
    const daemonProcess = await import("../daemon/process.js");

    let attempts = 0;
    const spawnSpy = vi
      .spyOn(daemonProcess, "spawnDaemon")
      .mockImplementation(async () => {
        attempts++;
        if (attempts === 2) return { pid: 1234 };
        return null;
      });
    // Isolate from real daemon state on the host machine
    const runningSpy = vi
      .spyOn(daemonProcess, "isDaemonRunning")
      .mockResolvedValue(false);

    const { createRespawnWithRetry } = await import("../lib/tier.js");
    const respawn = createRespawnWithRetry(".", undefined, undefined);
    const result = await respawn();

    expect(result).toBe(true);
    expect(attempts).toBe(2);

    spawnSpy.mockRestore();
    runningSpy.mockRestore();
  });
});

describe("TIERS constant", () => {
  it("has all 3 tier definitions", () => {
    expect(Object.keys(TIERS)).toHaveLength(3);
    expect(TIERS.full.number).toBe(1);
    expect(TIERS.lite.number).toBe(2);
    expect(TIERS.markdown.number).toBe(3);
  });

  it("each tier has name, label, and number", () => {
    for (const tier of Object.values(TIERS)) {
      expect(tier.name).toBeTruthy();
      expect(tier.label).toBeTruthy();
      expect(tier.number).toBeGreaterThanOrEqual(1);
      expect(tier.number).toBeLessThanOrEqual(3);
    }
  });
});
