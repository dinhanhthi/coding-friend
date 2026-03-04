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

import { ensureShellCompletion } from "../../lib/shell-completion.js";
import { ensureStatusline } from "../../lib/statusline.js";
import { readJson } from "../../lib/json.js";
import { existsSync } from "fs";
import { devRestartCommand, devUpdateCommand } from "../dev.js";

const mockEnsureShellCompletion = vi.mocked(ensureShellCompletion);
const mockEnsureStatusline = vi.mocked(ensureStatusline);
const mockReadJson = vi.mocked(readJson);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.clearAllMocks();
  // Simulate: first call returns dev state (for devReinstall to see "ON"),
  // after devOffCommand runs, subsequent getDevState() returns null (so devOnCommand proceeds).
  let callCount = 0;
  mockReadJson.mockImplementation(() => {
    callCount++;
    // First call: devReinstall reads state → ON
    // After devOff clears it, devOnCommand reads state → null (proceed)
    if (callCount <= 1) {
      return {
        localPath: "/tmp/coding-friend",
        savedAt: "2025-01-01T00:00:00.000Z",
      };
    }
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
