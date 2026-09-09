import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock("../../lib/exec.js", () => ({
  commandExists: vi.fn(() => true),
  run: vi.fn(() => ""),
  runWithStderr: vi.fn(() => ({ stdout: "", stderr: "", exitCode: 0 })),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock("../../lib/plugin-state.js", () => ({
  isPluginInstalled: vi.fn(() => true),
  isMarketplaceRegistered: vi.fn(() => true),
}));

vi.mock("../../lib/shell-completion.js", () => ({
  ensureShellCompletion: vi.fn(),
}));

vi.mock("../../lib/statusline.js", () => ({
  ensureStatusline: vi.fn(),
  getInstalledVersion: vi.fn(() => null),
}));

vi.mock("../../lib/log.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
  },
  printBanner: vi.fn(),
}));

import { ensureShellCompletion } from "../../lib/shell-completion.js";
import { ensureStatusline, getInstalledVersion } from "../../lib/statusline.js";
import { readJson } from "../../lib/json.js";
import { existsSync } from "fs";
import {
  devRestartCommand,
  devUpdateCommand,
  devStatusCommand,
  devSyncCommand,
} from "../dev.js";
import { log } from "../../lib/log.js";
import { readFileSync, readdirSync, statSync, copyFileSync } from "fs";
import { run } from "../../lib/exec.js";

const mockEnsureShellCompletion = vi.mocked(ensureShellCompletion);
const mockEnsureStatusline = vi.mocked(ensureStatusline);
const mockGetInstalledVersion = vi.mocked(getInstalledVersion);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);
const mockCopyFileSync = vi.mocked(copyFileSync);
const mockRun = vi.mocked(run);
const mockReadJson = vi.mocked(readJson);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.clearAllMocks();
  // Simulate readJson calls through devReinstall flow:
  // 1. getDevState() in devReinstall → dev state (ON)
  // 2. getLocalPluginVersion() in devReinstall → plugin.json with version
  // 3. getDevState() in devOffCommand → dev state (so off proceeds)
  // 4. getDevState() in devOnCommand → null (so on proceeds)
  // 5. getLocalPluginVersion() in devOnCommand → plugin.json with version
  // 6+ remaining calls → null
  const devState = {
    localPath: "/tmp/coding-friend",
    savedAt: "2025-01-01T00:00:00.000Z",
  };
  const pluginJson = { version: "0.8.0" };
  let callCount = 0;
  mockReadJson.mockImplementation(() => {
    callCount++;
    if (callCount === 1) return devState;
    if (callCount === 2) return pluginJson;
    if (callCount === 3) return devState;
    if (callCount === 4) return null;
    if (callCount === 5) return pluginJson;
    return null;
  });
  mockExistsSync.mockReturnValue(true);
});

describe("devRestartCommand", () => {
  it("calls ensureShellCompletion after restart", async () => {
    await devRestartCommand("/tmp/coding-friend");
    expect(mockEnsureShellCompletion).toHaveBeenCalled();
  });

  it("calls ensureStatusline after restart", async () => {
    await devRestartCommand("/tmp/coding-friend");
    expect(mockEnsureStatusline).toHaveBeenCalled();
  });
});

describe("devUpdateCommand", () => {
  it("calls ensureShellCompletion after update", async () => {
    await devUpdateCommand("/tmp/coding-friend");
    expect(mockEnsureShellCompletion).toHaveBeenCalled();
  });

  it("calls ensureStatusline after update", async () => {
    await devUpdateCommand("/tmp/coding-friend");
    expect(mockEnsureStatusline).toHaveBeenCalled();
  });
});

describe("devStatusCommand", () => {
  it("warns when dev mode localPath does not exist", async () => {
    mockReadJson.mockReset();
    // getDevState() returns state with non-existent path
    mockReadJson
      .mockReturnValueOnce({
        localPath: "/nonexistent/path",
        savedAt: "2025-01-01T00:00:00.000Z",
      })
      // getMarketplaceSource() → null
      .mockReturnValueOnce(null);
    // existsSync: first for localPath check → false
    mockExistsSync.mockReturnValue(false);

    await devStatusCommand();

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("/nonexistent/path"),
    );
  });

  it("does not warn when dev mode localPath exists", async () => {
    mockReadJson.mockReset();
    mockReadJson
      .mockReturnValueOnce({
        localPath: "/tmp/coding-friend",
        savedAt: "2025-01-01T00:00:00.000Z",
      })
      .mockReturnValueOnce(null);
    mockExistsSync.mockReturnValue(true);

    await devStatusCommand();

    expect(log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("no longer exists"),
    );
  });
});

describe("devSyncCommand", () => {
  const devState = {
    localPath: "/tmp/coding-friend",
    savedAt: "2025-01-01T00:00:00.000Z",
  };

  const oldHooksJson = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "test" }] },
      ],
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: "test" }] },
      ],
    },
  });

  const newHooksJsonSameEvents = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "new-test" }] },
      ],
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: "new-test" }] },
      ],
    },
  });

  const newHooksJsonNewEvents = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "", hooks: [{ type: "command", command: "test" }] },
      ],
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: "test" }] },
      ],
      TaskCreated: [
        { matcher: "", hooks: [{ type: "command", command: "tracker" }] },
      ],
      SubagentStart: [
        { matcher: "", hooks: [{ type: "command", command: "agent" }] },
      ],
    },
  });

  function setupSyncMocks() {
    mockReadJson.mockReset();
    mockReadJson.mockReturnValue(devState);
    mockExistsSync.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.21.0");
    // Empty dirs — copyDirRecursive has nothing to walk
    mockReaddirSync.mockReturnValue(
      [] as unknown as ReturnType<typeof readdirSync>,
    );
    mockStatSync.mockReturnValue({
      isDirectory: () => true,
      mtimeMs: Date.now(),
    } as unknown as ReturnType<typeof statSync>);
    mockCopyFileSync.mockReturnValue(undefined);
  }

  it("warns when hooks.json has new event types", async () => {
    setupSyncMocks();
    // readFileSync: 1st call = cached hooks.json, 2nd call = source hooks.json
    mockReadFileSync
      .mockReturnValueOnce(oldHooksJson)
      .mockReturnValueOnce(newHooksJsonNewEvents);

    await devSyncCommand();

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("hooks.json"),
    );
  });

  it("does not warn when hooks.json has same event types", async () => {
    setupSyncMocks();
    mockReadFileSync
      .mockReturnValueOnce(oldHooksJson)
      .mockReturnValueOnce(newHooksJsonSameEvents);

    await devSyncCommand();

    expect(log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("hooks.json"),
    );
  });

  it("does not warn when no hooks.json exists", async () => {
    setupSyncMocks();
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    await devSyncCommand();

    expect(log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("hooks.json"),
    );
  });

  it("syncs into the installed version dir, not the newest-mtime one", async () => {
    setupSyncMocks();
    mockGetInstalledVersion.mockReturnValue("0.43.0");
    // An orphaned dir left by an earlier version bump, touched more recently
    mockReaddirSync.mockImplementation(
      (p: Parameters<typeof readdirSync>[0]) =>
        (String(p).includes("coding-friend-marketplace")
          ? ["0.42.4", "0.43.0"]
          : []) as unknown as ReturnType<typeof readdirSync>,
    );
    mockStatSync.mockImplementation(
      (p: Parameters<typeof statSync>[0]) =>
        ({
          isDirectory: () => true,
          mtimeMs: String(p).includes("0.42.4") ? 2000 : 1000,
        }) as unknown as ReturnType<typeof statSync>,
    );

    await devSyncCommand();

    expect(log.step).toHaveBeenCalledWith(expect.stringContaining("0.43.0"));
    expect(log.step).not.toHaveBeenCalledWith(
      expect.stringContaining("0.42.4"),
    );
  });

  it("errors when the installed version dir is missing from the cache", async () => {
    setupSyncMocks();
    mockGetInstalledVersion.mockReturnValue("0.43.0");
    mockExistsSync.mockImplementation(
      (p: Parameters<typeof existsSync>[0]) => !String(p).includes("0.43.0"),
    );

    await devSyncCommand();

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("cached plugin version"),
    );
    expect(mockCopyFileSync).not.toHaveBeenCalled();
  });
});
