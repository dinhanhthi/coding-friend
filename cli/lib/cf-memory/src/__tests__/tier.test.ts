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
  it("returns Tier 3 (markdown) when no daemon is running", async () => {
    const tier = await detectTier();
    // Without a daemon running, should detect Tier 3
    expect(tier.name).toBe("markdown");
    expect(tier.number).toBe(3);
    expect(tier.label).toContain("Tier 3");
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

  it("auto mode defaults to markdown when daemon not running", async () => {
    const tier = await detectTier("auto");
    expect(tier.name).toBe("markdown");
  });

  it("auto mode returns lite when daemon is running", async () => {
    // Mock isDaemonRunning to return true
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

  it("falls back to MarkdownBackend when daemon not available for lite tier", async () => {
    const { backend, tier } = await createBackendForTier(testDir, "auto");
    // Since no daemon is running, should fall back to markdown
    expect(tier.name).toBe("markdown");
    expect(backend).toBeInstanceOf(MarkdownBackend);
    await backend.close();
  });

  it("full tier currently falls back to markdown", async () => {
    // Phase 3 will implement full tier — for now it falls back
    const { backend, tier } = await createBackendForTier(testDir, "full");
    expect(tier.name).toBe("markdown");
    expect(backend).toBeInstanceOf(MarkdownBackend);
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
      spy.mockRestore();
      pathsSpy.mockRestore();
    }
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
