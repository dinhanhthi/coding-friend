import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;

// Mock globalConfigDir to use temp directory
vi.mock("../paths.js", () => ({
  globalConfigDir: () => testDir,
}));

vi.mock("../exec.js", () => ({
  run: vi.fn(),
}));

import { run } from "../exec.js";
import {
  readUpdateCache,
  writeUpdateCache,
  isCheckStale,
  checkAndNotifyCliUpdate,
  CHECK_INTERVAL_MS,
} from "../update-check.js";

const mockRun = vi.mocked(run);

beforeEach(() => {
  testDir = join(tmpdir(), `cf-update-check-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("isCheckStale", () => {
  it("returns true when cache is null", () => {
    expect(isCheckStale(null)).toBe(true);
  });

  it("returns true when lastCheck is older than 24 hours", () => {
    const cache = {
      lastCheck: Date.now() - CHECK_INTERVAL_MS - 1000,
      latestVersion: "1.0.0",
    };
    expect(isCheckStale(cache)).toBe(true);
  });

  it("returns false when lastCheck is within 24 hours", () => {
    const cache = {
      lastCheck: Date.now() - CHECK_INTERVAL_MS + 60000,
      latestVersion: "1.0.0",
    };
    expect(isCheckStale(cache)).toBe(false);
  });

  it("accepts a custom now parameter for testing", () => {
    const cache = { lastCheck: 1000, latestVersion: "1.0.0" };
    expect(isCheckStale(cache, 1000 + CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(isCheckStale(cache, 1000 + CHECK_INTERVAL_MS + 1)).toBe(true);
  });
});

describe("readUpdateCache / writeUpdateCache", () => {
  it("returns null when cache file does not exist", () => {
    expect(readUpdateCache()).toBeNull();
  });

  it("writes and reads cache correctly", () => {
    writeUpdateCache("2.0.0");
    const cache = readUpdateCache();
    expect(cache).not.toBeNull();
    expect(cache!.latestVersion).toBe("2.0.0");
    expect(cache!.lastCheck).toBeGreaterThan(0);
    expect(cache!.lastCheck).toBeLessThanOrEqual(Date.now());
  });

  it("returns null when cache file has invalid JSON", () => {
    writeFileSync(join(testDir, "cli-update-check.json"), "not json", "utf-8");
    expect(readUpdateCache()).toBeNull();
  });
});

describe("checkAndNotifyCliUpdate", () => {
  it("fetches from npm when cache is stale and writes cache", () => {
    mockRun.mockReturnValue("2.0.0");

    checkAndNotifyCliUpdate("1.0.0");

    // Should have called npm view
    expect(mockRun).toHaveBeenCalledWith("npm", [
      "view",
      "coding-friend-cli",
      "version",
    ]);

    // Should have written cache
    const cache = readUpdateCache();
    expect(cache).not.toBeNull();
    expect(cache!.latestVersion).toBe("2.0.0");
  });

  it("uses cached version when cache is fresh (no npm call)", () => {
    // Pre-populate cache
    writeUpdateCache("2.0.0");

    checkAndNotifyCliUpdate("1.0.0");

    // Should NOT call npm view since cache is fresh
    expect(mockRun).not.toHaveBeenCalledWith("npm", [
      "view",
      "coding-friend-cli",
      "version",
    ]);
  });

  it("shows notification when update is available", () => {
    mockRun.mockReturnValue("2.0.0");
    const consoleSpy = vi.spyOn(console, "log");

    checkAndNotifyCliUpdate("1.0.0", { autoUpdate: false });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("v1.0.0");
    expect(output).toContain("v2.0.0");
    expect(output).toContain("cf update --cli");
  });

  it("does not show notification when already up to date", () => {
    mockRun.mockReturnValue("1.0.0");
    const consoleSpy = vi.spyOn(console, "log");

    checkAndNotifyCliUpdate("1.0.0", { autoUpdate: false });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Update available");
  });

  it("does not show notification when ahead of latest", () => {
    mockRun.mockReturnValue("1.0.0");
    const consoleSpy = vi.spyOn(console, "log");

    checkAndNotifyCliUpdate("2.0.0", { autoUpdate: false });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Update available");
  });

  it("auto-updates when enabled and update is available", () => {
    // First call returns latest version, second call is the auto-update
    mockRun.mockImplementation((_cmd, args) => {
      if (args?.[0] === "view") return "2.0.0";
      if (args?.[0] === "install") return "ok";
      return null;
    });

    checkAndNotifyCliUpdate("1.0.0", { autoUpdate: true });

    expect(mockRun).toHaveBeenCalledWith("npm", [
      "install",
      "-g",
      "coding-friend-cli@latest",
    ]);
  });

  it("skips auto-update when disabled", () => {
    mockRun.mockReturnValue("2.0.0");

    checkAndNotifyCliUpdate("1.0.0", { autoUpdate: false });

    // Should NOT call npm install
    expect(mockRun).not.toHaveBeenCalledWith(
      "npm",
      expect.arrayContaining(["install"]),
    );
  });

  it("does not crash when npm check fails", () => {
    mockRun.mockReturnValue(null);

    // Should not throw
    expect(() => checkAndNotifyCliUpdate("1.0.0")).not.toThrow();
  });

  it("does not auto-update when already up to date", () => {
    mockRun.mockReturnValue("1.0.0");

    checkAndNotifyCliUpdate("1.0.0", { autoUpdate: true });

    expect(mockRun).not.toHaveBeenCalledWith(
      "npm",
      expect.arrayContaining(["install"]),
    );
  });

  it("shows fallback message when auto-update fails", () => {
    mockRun.mockImplementation((_cmd, args) => {
      if (args?.[0] === "view") return "2.0.0";
      if (args?.[0] === "install") return null; // simulate failure
      return null;
    });

    const consoleSpy = vi.spyOn(console, "log");
    checkAndNotifyCliUpdate("1.0.0", { autoUpdate: true });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Auto-update failed");
  });
});
