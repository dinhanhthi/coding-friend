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
import { ensureStatusline } from "../../lib/statusline.js";
import { readJson } from "../../lib/json.js";
import { existsSync } from "fs";
import {
  devRestartCommand,
  devUpdateCommand,
  devStatusCommand,
} from "../dev.js";
import { log } from "../../lib/log.js";

const mockEnsureShellCompletion = vi.mocked(ensureShellCompletion);
const mockEnsureStatusline = vi.mocked(ensureStatusline);
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
