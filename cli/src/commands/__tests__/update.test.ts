import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, readFileSync: vi.fn() };
});

vi.mock("../../lib/exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
  sleepSync: vi.fn(),
}));

vi.mock("../../lib/statusline.js", () => ({
  getInstalledVersion: vi.fn(),
  ensureStatusline: vi.fn(),
}));

vi.mock("../../lib/shell-completion.js", () => ({
  ensureShellCompletion: vi.fn(),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(),
}));

vi.mock("../../lib/prompt-utils.js", () => ({
  resolveScope: vi.fn(),
}));

import { commandExists, run } from "../../lib/exec.js";
import { getInstalledVersion } from "../../lib/statusline.js";
import { resolveScope } from "../../lib/prompt-utils.js";
import { updateCommand } from "../update.js";

const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockGetInstalledVersion = vi.mocked(getInstalledVersion);
const mockResolveScope = vi.mocked(resolveScope);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});

  // Default: return a package.json with version
  mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.0.0" }));
  mockGetInstalledVersion.mockReturnValue("0.7.2");
  // getLatestVersion uses run("gh", ...) — return null to skip update
  mockRun.mockReturnValue(null);
});

describe("updateCommand — scope flags", () => {
  it("passes --scope project to claude plugin update when --project flag is set", async () => {
    mockResolveScope.mockResolvedValue("project");
    mockGetInstalledVersion.mockReturnValue("0.7.0");
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      if (cmd === "claude") return "ok";
      return null;
    });

    await updateCommand({ plugin: true, project: true });

    expect(mockResolveScope).toHaveBeenCalledWith(
      expect.objectContaining({ project: true }),
    );
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "update",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "project",
    ]);
  });

  it("passes --scope local to claude plugin update when --local flag is set", async () => {
    mockResolveScope.mockResolvedValue("local");
    mockGetInstalledVersion.mockReturnValue("0.7.0");
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      if (cmd === "claude") return "ok";
      return null;
    });

    await updateCommand({ plugin: true, local: true });

    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "update",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "local",
    ]);
  });

  it("defaults to user scope when no scope flag is set", async () => {
    mockGetInstalledVersion.mockReturnValue("0.7.0");
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      if (cmd === "claude") return "ok";
      return null;
    });

    await updateCommand({ plugin: true });

    // Should NOT call resolveScope when no scope flag
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "update",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "user",
    ]);
  });

  it("does not call resolveScope when only updating CLI", async () => {
    mockRun.mockImplementation((cmd) => {
      if (cmd === "npm") return "2.0.0";
      return null;
    });

    await updateCommand({ cli: true });

    expect(mockResolveScope).not.toHaveBeenCalled();
  });
});
