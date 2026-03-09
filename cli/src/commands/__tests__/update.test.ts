import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, readFileSync: vi.fn() };
});

vi.mock("../../lib/exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
  runWithStderr: vi.fn(),
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

import { commandExists, run, runWithStderr } from "../../lib/exec.js";
import { getInstalledVersion } from "../../lib/statusline.js";
import { resolveScope } from "../../lib/prompt-utils.js";
import { updateCommand } from "../update.js";

const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockRunWithStderr = vi.mocked(runWithStderr);
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
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await updateCommand({ plugin: true, project: true });

    expect(mockResolveScope).toHaveBeenCalledWith(
      expect.objectContaining({ project: true }),
    );
    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
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
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await updateCommand({ plugin: true, local: true });

    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
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
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await updateCommand({ plugin: true });

    // Should NOT call resolveScope when no scope flag
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
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

describe("updateCommand — plugin update verification", () => {
  it("reports success only when installed version actually changes", async () => {
    mockGetInstalledVersion
      .mockReturnValueOnce("0.7.0") // initial check
      .mockReturnValueOnce("0.7.2"); // verify after update
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({ plugin: true });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Plugin updated to");
  });

  it("shows warning with stderr when command succeeds but version unchanged", async () => {
    mockGetInstalledVersion.mockReturnValue("0.7.0"); // never changes
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "some debug info",
      exitCode: 0,
    });

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({ plugin: true });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("still unchanged");
    expect(output).toContain("stderr: some debug info");
  });

  it("reports error with stderr when claude plugin update exits non-zero", async () => {
    mockGetInstalledVersion.mockReturnValue("0.7.0");
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "error: permission denied",
      exitCode: 1,
    });

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({ plugin: true });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Plugin update failed");
    expect(output).toContain("stderr: error: permission denied");
  });
});
