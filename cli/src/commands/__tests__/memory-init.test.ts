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
  writeMemoryMcpEntry: vi.fn(),
  getMemoryMcpStatus: vi.fn(() => ({ configured: false, scope: null })),
}));

const mockMergeJson = vi.fn();

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(() => ({})),
  mergeJson: (...args: unknown[]) => mockMergeJson(...args),
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
import { memoryInitCommand, memoryInitWizard } from "../memory.js";
import { readJson } from "../../lib/json.js";
import { log } from "../../lib/log.js";
import { loadConfig } from "../../lib/config.js";
import {
  writeMemoryMcpEntry,
  getMemoryMcpStatus,
} from "../../lib/memory-prompts.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadJson = vi.mocked(readJson);
const mockLoadConfig = vi.mocked(loadConfig);
const mockWriteMemoryMcpEntry = vi.mocked(writeMemoryMcpEntry);
const mockGetMemoryMcpStatus = vi.mocked(getMemoryMcpStatus);

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

describe("memoryInitWizard — zero-prompt with global config inheritance", () => {
  beforeEach(() => {
    mockGetMemoryMcpStatus.mockReturnValue({ configured: false, scope: null });
  });

  it("writes smart defaults to local config when global has no memory settings", async () => {
    mockReadJson.mockReturnValue({});

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockMergeJson).toHaveBeenCalledWith(
      "/fake/local-config.json",
      expect.objectContaining({
        memory: expect.objectContaining({
          tier: "auto",
          autoCapture: true,
          autoStart: true,
          embedding: expect.objectContaining({ provider: "transformers" }),
        }),
      }),
    );
  });

  it("inherits tier from global config", async () => {
    mockReadJson.mockImplementation((path: unknown) =>
      String(path).includes("global") ? { memory: { tier: "full" } } : {},
    );

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockMergeJson).toHaveBeenCalledWith(
      "/fake/local-config.json",
      expect.objectContaining({
        memory: expect.objectContaining({ tier: "full" }),
      }),
    );
  });

  it("inherits embedding from global config", async () => {
    const embedding = { provider: "ollama", model: "nomic-embed-text" };
    mockReadJson.mockImplementation((path: unknown) =>
      String(path).includes("global") ? { memory: { embedding } } : {},
    );

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockMergeJson).toHaveBeenCalledWith(
      "/fake/local-config.json",
      expect.objectContaining({
        memory: expect.objectContaining({ embedding }),
      }),
    );
  });

  it("inherits autoCapture: false from global config", async () => {
    mockReadJson.mockImplementation((path: unknown) =>
      String(path).includes("global") ? { memory: { autoCapture: false } } : {},
    );

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockMergeJson).toHaveBeenCalledWith(
      "/fake/local-config.json",
      expect.objectContaining({
        memory: expect.objectContaining({ autoCapture: false }),
      }),
    );
  });

  it("auto-writes .mcp.json without any prompt", async () => {
    mockReadJson.mockReturnValue({});

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockWriteMemoryMcpEntry).toHaveBeenCalledWith("/fake/docs/memory");
  });

  it("skips .mcp.json write when already configured locally", async () => {
    mockGetMemoryMcpStatus.mockReturnValue({
      configured: true,
      scope: "local",
    });
    mockReadJson.mockReturnValue({});

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockWriteMemoryMcpEntry).not.toHaveBeenCalled();
  });

  it("logs an explanation for each setting", async () => {
    mockReadJson.mockReturnValue({});

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    const infoMessages = vi.mocked(log.info).mock.calls.map((c) => c[0]);
    expect(infoMessages.some((m) => String(m).includes("tier"))).toBe(true);
    expect(
      infoMessages.some(
        (m) =>
          String(m).includes("auto-capture") ||
          String(m).includes("autoCapture") ||
          String(m).includes("capture"),
      ),
    ).toBe(true);
    expect(
      infoMessages.some(
        (m) => String(m).includes("daemon") || String(m).includes("auto-start"),
      ),
    ).toBe(true);
  });

  it("preserves existing memory fields (e.g. daemonTimeout) on re-run", async () => {
    mockReadJson.mockImplementation((path: unknown) =>
      String(path).includes("local")
        ? { memory: { daemonTimeout: 30000 } }
        : {},
    );

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockMergeJson).toHaveBeenCalledWith(
      "/fake/local-config.json",
      expect.objectContaining({
        memory: expect.objectContaining({ daemonTimeout: 30000 }),
      }),
    );
  });
});

describe("memoryInitWizard — tier-specific completion", () => {
  beforeEach(() => {
    mockGetMemoryMcpStatus.mockReturnValue({ configured: false, scope: null });
    mockReadJson.mockReturnValue({});
  });

  it('shows success message when tier is "markdown"', async () => {
    mockLoadConfig.mockReturnValue({ memory: { tier: "markdown" } });

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    const logged = vi.mocked(console.log).mock.calls.flat();
    expect(logged).toContain(
      '🎉 Memory initialized! Run "cf memory status" to verify.',
    );
  });

  it('shows success message when tier is "lite"', async () => {
    mockLoadConfig.mockReturnValue({ memory: { tier: "lite" } });

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    const logged = vi.mocked(console.log).mock.calls.flat();
    expect(logged).toContain(
      '🎉 Memory initialized! Run "cf memory status" to verify.',
    );
  });

  it('auto-writes .mcp.json for "markdown" tier', async () => {
    mockLoadConfig.mockReturnValue({ memory: { tier: "markdown" } });

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockWriteMemoryMcpEntry).toHaveBeenCalledWith("/fake/docs/memory");
  });

  it('auto-writes .mcp.json for "lite" tier', async () => {
    mockLoadConfig.mockReturnValue({ memory: { tier: "lite" } });

    await memoryInitWizard("/fake/docs/memory", "/fake/cf-memory");

    expect(mockWriteMemoryMcpEntry).toHaveBeenCalledWith("/fake/docs/memory");
  });
});
