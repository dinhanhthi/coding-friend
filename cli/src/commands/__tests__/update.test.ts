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
import { getInstalledVersion, ensureStatusline } from "../../lib/statusline.js";
import { resolveScope } from "../../lib/prompt-utils.js";
import { readJson } from "../../lib/json.js";
import { updateCommand } from "../update.js";

const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockRunWithStderr = vi.mocked(runWithStderr);
const mockGetInstalledVersion = vi.mocked(getInstalledVersion);
const mockEnsureStatusline = vi.mocked(ensureStatusline);
const mockResolveScope = vi.mocked(resolveScope);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReadJson = vi.mocked(readJson);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});

  // Default: return a package.json with version
  mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.0.0" }));
  mockGetInstalledVersion.mockReturnValue("0.7.2");
  // getLatestVersion uses run("gh", ...) — return null to skip update
  mockRun.mockReturnValue(null);
});

describe("updateCommand — version summary", () => {
  it("shows 3 version lines (plugin, cli, statusline) in cf-status format", async () => {
    mockGetInstalledVersion.mockReturnValue("0.14.1");
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.22.0" }));
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.14.1";
      if (cmd === "npm") return "1.22.0";
      return null;
    });
    mockReadJson.mockReturnValue({
      statusLine: {
        command:
          "coding-friend-marketplace/coding-friend/v0.14.1/statusline.sh",
      },
    });

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({});

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    // Should contain version lines with arrow format
    expect(output).toMatch(/Plugin\s+0\.14\.1 → 0\.14\.1/);
    expect(output).toMatch(/CLI\s+1\.22\.0 → 1\.22\.0/);
    expect(output).toMatch(/Statusline\s+0\.14\.1 → 0\.14\.1/);
    // Should NOT contain old-style log.info lines
    expect(output).not.toContain("Plugin version:");
    expect(output).not.toContain("Latest plugin version:");
    expect(output).not.toContain("CLI version:");
    expect(output).not.toContain("Latest CLI version:");
    expect(output).not.toContain("Statusline version:");
  });

  it("does not show 'already on the latest version' messages when up to date", async () => {
    mockGetInstalledVersion.mockReturnValue("0.14.1");
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.22.0" }));
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.14.1";
      if (cmd === "npm") return "1.22.0";
      return null;
    });
    mockReadJson.mockReturnValue({
      statusLine: {
        command:
          "coding-friend-marketplace/coding-friend/v0.14.1/statusline.sh",
      },
    });

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({});

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("already on the latest version");
  });

  it("shows plugin as 'not installed' when no plugin version", async () => {
    mockGetInstalledVersion.mockReturnValue(null);
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.0.0" }));
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.14.1";
      if (cmd === "npm") return "1.0.0";
      return null;
    });
    mockReadJson.mockReturnValue(null);

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({});

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/Plugin\s+not installed/);
  });

  it("shows statusline as 'not configured' when no statusline", async () => {
    mockGetInstalledVersion.mockReturnValue("0.14.1");
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.0.0" }));
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.14.1";
      if (cmd === "npm") return "1.0.0";
      return null;
    });
    mockReadJson.mockReturnValue(null);

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({});

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/Statusline\s+not configured/);
  });

  it("does not show 'Updating statusline' step when statusline is already up to date", async () => {
    mockGetInstalledVersion.mockReturnValue("0.14.1");
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.22.0" }));
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.14.1";
      if (cmd === "npm") return "1.22.0";
      return null;
    });
    mockReadJson.mockReturnValue({
      statusLine: {
        command:
          "coding-friend-marketplace/coding-friend/v0.14.1/statusline.sh",
      },
    });
    mockEnsureStatusline.mockReturnValue(null); // null = already up-to-date

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({});

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Updating statusline");
    expect(output).not.toContain("Statusline already up-to-date");
  });
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

  it("falls back to plugin install when update succeeds but version unchanged", async () => {
    // Simulate: update returns success but version stays 0.7.0,
    // then install succeeds and version changes to 0.7.2
    let installCalled = false;
    mockGetInstalledVersion
      .mockReturnValueOnce("0.7.0") // initial check
      .mockReturnValueOnce("0.7.0") // verify after update (retry 1)
      .mockReturnValueOnce("0.7.0") // verify after update (retry 2)
      .mockReturnValueOnce("0.7.0") // verify after update (retry 3)
      .mockReturnValueOnce("0.7.2"); // verify after install fallback
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd, args) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      if (
        cmd === "claude" &&
        args?.[0] === "plugin" &&
        args?.[1] === "install"
      ) {
        installCalled = true;
        return "";
      }
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "already at the latest version",
      stderr: "",
      exitCode: 0,
    });

    const consoleSpy = vi.spyOn(console, "log");
    await updateCommand({ plugin: true });

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(installCalled).toBe(true);
    expect(output).toContain("Plugin updated to");
  });

  it("falls back to plugin install with correct scope", async () => {
    mockResolveScope.mockResolvedValue("project");
    let installArgs: string[] = [];
    mockGetInstalledVersion
      .mockReturnValueOnce("0.7.0") // initial
      .mockReturnValueOnce("0.7.0") // verify after update (retry 1)
      .mockReturnValueOnce("0.7.0") // verify after update (retry 2)
      .mockReturnValueOnce("0.7.0") // verify after update (retry 3)
      .mockReturnValueOnce("0.7.2"); // verify after install
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd, args) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      if (
        cmd === "claude" &&
        args?.[0] === "plugin" &&
        args?.[1] === "install"
      ) {
        installArgs = args as string[];
        return "";
      }
      return null;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await updateCommand({ plugin: true, project: true });

    expect(installArgs).toEqual([
      "plugin",
      "install",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "project",
    ]);
  });

  it("shows warning when both update and install fallback fail to change version", async () => {
    mockGetInstalledVersion.mockReturnValue("0.7.0"); // never changes
    mockCommandExists.mockReturnValue(true);
    mockRun.mockImplementation((cmd) => {
      if (cmd === "gh") return "v0.7.2";
      if (cmd === "npm") return "1.0.0";
      if (cmd === "claude") return "";
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
    expect(output).toContain("/plugins");
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
