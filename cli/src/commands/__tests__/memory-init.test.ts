import { describe, it, expect, vi, beforeEach } from "vitest";

// Track dynamic imports to cf-memory dist
const mockAreSqliteDepsAvailable = vi.fn();
const mockEnsureDeps = vi.fn();

// Mock dependencies before imports
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, existsSync: vi.fn() };
});

vi.mock("../../lib/config.js", () => ({
  resolveMemoryDir: vi.fn(() => "/fake/docs/memory"),
  loadConfig: vi.fn(() => ({ memory: { tier: "auto" } })),
}));

vi.mock("../../lib/lib-path.js", () => ({
  getLibPath: vi.fn(() => "/fake/cf-memory"),
}));

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(() => ({ exitCode: 0, stdout: "" })),
  runWithStderr: vi.fn(() => ({ exitCode: 0, stdout: "", stderr: "" })),
}));

vi.mock("../../lib/log.js", () => ({
  log: {
    info: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
  },
}));

vi.mock("../../lib/memory-prompts.js", () => ({
  memoryConfigMenu: vi.fn(),
  editMemoryTier: vi.fn(),
  editMemoryAutoCapture: vi.fn(),
  editMemoryAutoStart: vi.fn(),
  editMemoryEmbedding: vi.fn(),
  editMemoryDaemonTimeout: vi.fn(),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(() => ({})),
}));

vi.mock("../../lib/paths.js", () => ({
  globalConfigPath: vi.fn(() => "/fake/global-config.json"),
  localConfigPath: vi.fn(() => "/fake/local-config.json"),
}));

vi.mock("../../lib/prompt-utils.js", () => ({
  showConfigHint: vi.fn(),
}));

vi.mock("chalk", () => {
  const identity = (s: string) => s;
  const handler: ProxyHandler<typeof identity> = {
    get: () => new Proxy(identity, handler),
    apply: (_t, _this, args) => args[0],
  };
  return { default: new Proxy(identity, handler) };
});

// Mock the dynamic import path used by ensureSqliteDepsIfNeeded
vi.mock("/fake/cf-memory/dist/lib/lazy-install.js", () => ({
  areSqliteDepsAvailable: (...args: unknown[]) =>
    mockAreSqliteDepsAvailable(...args),
  ensureDeps: (...args: unknown[]) => mockEnsureDeps(...args),
}));

import { existsSync } from "fs";
import { memoryInitCommand } from "../memory.js";
import { log } from "../../lib/log.js";

const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});

  // Default: existsSync returns false
  mockExistsSync.mockReturnValue(false);

  mockAreSqliteDepsAvailable.mockReturnValue(false);
  mockEnsureDeps.mockResolvedValue(true);
});

/**
 * Helper: make existsSync return true only for paths matching the given substrings.
 */
function existsFor(...substrings: string[]) {
  mockExistsSync.mockImplementation((p) => {
    const path = String(p);
    // Always let ensureBuilt pass (node_modules + dist exist)
    if (
      path.includes("cf-memory/node_modules") ||
      path.includes("cf-memory/dist")
    )
      return true;
    return substrings.some((s) => path.includes(s));
  });
}

describe("memoryInitCommand", () => {
  describe("returning user (DB exists) with missing SQLite deps", () => {
    it("should install SQLite deps when DB exists but deps are missing", async () => {
      existsFor("db.sqlite");
      mockAreSqliteDepsAvailable.mockReturnValue(false);
      mockEnsureDeps.mockResolvedValue(true);

      await memoryInitCommand();

      expect(mockEnsureDeps).toHaveBeenCalled();
      expect(vi.mocked(log.success)).toHaveBeenCalledWith(
        "Dependencies installed.",
      );
    });

    it("should skip install when DB exists and deps are already available", async () => {
      existsFor("db.sqlite");
      mockAreSqliteDepsAvailable.mockReturnValue(true);

      await memoryInitCommand();

      expect(mockEnsureDeps).not.toHaveBeenCalled();
    });

    it("should show error when DB exists and dep install fails", async () => {
      existsFor("db.sqlite");
      mockAreSqliteDepsAvailable.mockReturnValue(false);
      mockEnsureDeps.mockResolvedValue(false);

      await memoryInitCommand();

      expect(vi.mocked(log.error)).toHaveBeenCalledWith(
        "Failed to install SQLite dependencies.",
      );
    });
  });
});
