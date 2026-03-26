import { describe, it, expect, vi, beforeEach } from "vitest";
import { homedir } from "os";
import { join } from "path";

// Mock fs before importing the module
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
}));

vi.mock("../../lib/exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
}));

vi.mock("../../lib/shell-completion.js", () => ({
  hasShellCompletion: vi.fn(),
  removeShellCompletion: vi.fn(),
}));

vi.mock("../../lib/prompt-utils.js", () => ({
  resolveScope: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { confirm } from "@inquirer/prompts";
import { commandExists, run } from "../../lib/exec.js";
import {
  hasShellCompletion,
  removeShellCompletion,
} from "../../lib/shell-completion.js";
import { resolveScope } from "../../lib/prompt-utils.js";
import { uninstallCommand } from "../uninstall.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRmSync = vi.mocked(rmSync);
const mockConfirm = vi.mocked(confirm);
const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockHasShellCompletion = vi.mocked(hasShellCompletion);
const mockRemoveShellCompletion = vi.mocked(removeShellCompletion);
const mockResolveScope = vi.mocked(resolveScope);

const home = homedir();
const installedPluginsFile = join(
  home,
  ".claude",
  "plugins",
  "installed_plugins.json",
);
const knownMarketplacesFile = join(
  home,
  ".claude",
  "plugins",
  "known_marketplaces.json",
);
const settingsFile = join(home, ".claude", "settings.json");
const devStateFile = join(home, ".coding-friend", "dev-state.json");
const cachePath = join(
  home,
  ".claude",
  "plugins",
  "cache",
  "coding-friend-marketplace",
);
const clonePath = join(
  home,
  ".claude",
  "plugins",
  "marketplaces",
  "coding-friend-marketplace",
);
const configDir = join(home, ".coding-friend");
const memoryDepsDir = join(home, ".coding-friend", "memory");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockResolveScope.mockResolvedValue("user");
});

describe("uninstallCommand", () => {
  it("exits early when claude CLI is not found", async () => {
    mockCommandExists.mockReturnValue(false);

    await uninstallCommand();

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("exits early when dev mode is active (before scope prompt)", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockImplementation((p) => {
      if (p === devStateFile) return true;
      return false;
    });
    // Return null for JSON reads (no plugin/marketplace registered)
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    await uninstallCommand();

    // Should not even call resolveScope when dev mode is active
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("reports nothing to uninstall when nothing is detected", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockHasShellCompletion.mockReturnValue(false);

    await uninstallCommand();

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("cancels when user declines confirmation", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockImplementation((p) => {
      if (p === cachePath) return true;
      return false;
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockHasShellCompletion.mockReturnValue(false);
    mockConfirm.mockResolvedValueOnce(false);

    await uninstallCommand();

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it("performs full uninstall when user confirms (user scope)", async () => {
    mockCommandExists.mockReturnValue(true);

    // Plugin installed
    mockReadFileSync.mockImplementation((p) => {
      const path = p.toString();
      if (path === installedPluginsFile) {
        return JSON.stringify({
          "coding-friend@coding-friend-marketplace": {},
        });
      }
      if (path === knownMarketplacesFile) {
        return JSON.stringify({ "coding-friend-marketplace": {} });
      }
      if (path === settingsFile) {
        return JSON.stringify({
          statusLine: { command: `${cachePath}/0.2.0/hooks/statusline.sh` },
        });
      }
      throw new Error("not found");
    });

    mockExistsSync.mockImplementation((p) => {
      if (p === cachePath) return true;
      if (p === clonePath) return true;
      if (p === configDir) return true;
      if (p === devStateFile) return false;
      // For writeJson dir check
      const pathStr = p.toString();
      if (pathStr.includes(".claude")) return true;
      return false;
    });

    mockHasShellCompletion.mockReturnValue(true);
    mockRun.mockReturnValue("ok");

    // First confirm: proceed with uninstall
    // Second confirm: also remove config
    mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await uninstallCommand();

    // Plugin uninstall via claude CLI
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "uninstall",
      "coding-friend@coding-friend-marketplace",
    ]);

    // Marketplace removal via claude CLI
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "marketplace",
      "remove",
      "coding-friend-marketplace",
    ]);

    // Cache dir removed
    expect(mockRmSync).toHaveBeenCalledWith(cachePath, {
      recursive: true,
      force: true,
    });

    // Clone dir removed
    expect(mockRmSync).toHaveBeenCalledWith(clonePath, {
      recursive: true,
      force: true,
    });

    // Statusline cleaned (settings written)
    expect(mockWriteFileSync).toHaveBeenCalled();

    // Shell completion removed
    expect(mockRemoveShellCompletion).toHaveBeenCalled();

    // Global config removed
    expect(mockRmSync).toHaveBeenCalledWith(configDir, {
      recursive: true,
      force: true,
    });
  });

  it("keeps global config when user declines config removal", async () => {
    mockCommandExists.mockReturnValue(true);

    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    mockExistsSync.mockImplementation((p) => {
      if (p === cachePath) return true;
      if (p === configDir) return true;
      if (p === devStateFile) return false;
      return false;
    });

    mockHasShellCompletion.mockReturnValue(false);

    // Confirm uninstall, decline config removal
    mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await uninstallCommand();

    // Cache removed
    expect(mockRmSync).toHaveBeenCalledWith(cachePath, {
      recursive: true,
      force: true,
    });

    // Config NOT removed
    expect(mockRmSync).not.toHaveBeenCalledWith(configDir, expect.anything());
  });

  it("uses fallback plugin uninstall when primary fails", async () => {
    mockCommandExists.mockReturnValue(true);

    // Plugin installed
    mockReadFileSync.mockImplementation((p) => {
      const path = p.toString();
      if (path === installedPluginsFile) {
        return JSON.stringify({
          "coding-friend@coding-friend-marketplace": {},
        });
      }
      throw new Error("not found");
    });

    mockExistsSync.mockImplementation((p) => {
      if (p === devStateFile) return false;
      return false;
    });

    mockHasShellCompletion.mockReturnValue(false);

    // First call (PLUGIN_ID) fails, second call (PLUGIN_NAME) succeeds
    mockRun.mockReturnValueOnce(null).mockReturnValueOnce("ok");

    mockConfirm.mockResolvedValueOnce(true);

    await uninstallCommand();

    // Primary attempt
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "uninstall",
      "coding-friend@coding-friend-marketplace",
    ]);

    // Fallback attempt
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "uninstall",
      "coding-friend",
    ]);
  });

  // ─── Scoped uninstall ──────────────────────────────────────────────

  it("passes --scope project when uninstalling from project scope", async () => {
    mockCommandExists.mockReturnValue(true);
    mockResolveScope.mockResolvedValue("project");
    mockConfirm.mockResolvedValueOnce(true);
    mockRun.mockReturnValue("ok");

    await uninstallCommand({ project: true });

    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "uninstall",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "project",
    ]);
  });

  it("passes --scope local when uninstalling from local scope", async () => {
    mockCommandExists.mockReturnValue(true);
    mockResolveScope.mockResolvedValue("local");
    mockConfirm.mockResolvedValueOnce(true);
    mockRun.mockReturnValue("ok");

    await uninstallCommand({ local: true });

    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "uninstall",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "local",
    ]);
  });

  it("does not clean marketplace/cache/statusline for project scope", async () => {
    mockCommandExists.mockReturnValue(true);
    mockResolveScope.mockResolvedValue("project");
    mockConfirm.mockResolvedValueOnce(true);
    mockRun.mockReturnValue("ok");

    await uninstallCommand({ project: true });

    // Should NOT remove marketplace, cache, statusline, or shell completion
    expect(mockRun).not.toHaveBeenCalledWith("claude", [
      "plugin",
      "marketplace",
      "remove",
      expect.anything(),
    ]);
    expect(mockRmSync).not.toHaveBeenCalled();
    expect(mockRemoveShellCompletion).not.toHaveBeenCalled();
  });

  it("cancels scoped uninstall when user declines", async () => {
    mockCommandExists.mockReturnValue(true);
    mockResolveScope.mockResolvedValue("project");
    mockConfirm.mockResolvedValueOnce(false);

    await uninstallCommand({ project: true });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("calls resolveScope with provided options", async () => {
    mockCommandExists.mockReturnValue(true);
    mockResolveScope.mockResolvedValue("local");
    mockConfirm.mockResolvedValueOnce(true);
    mockRun.mockReturnValue("ok");

    await uninstallCommand({ local: true });

    expect(mockResolveScope).toHaveBeenCalledWith(
      { local: true },
      "Where should the plugin be uninstalled from?",
    );
  });

  // ─── Memory cleanup ─────────────────────────────────────────────────

  it("detects and displays memory deps in detection output", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockImplementation((p) => {
      if (p === memoryDepsDir) return true;
      if (p === configDir) return true;
      if (p === devStateFile) return false;
      return false;
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockHasShellCompletion.mockReturnValue(false);

    // Confirm uninstall, decline config removal, decline memory removal
    mockConfirm
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await uninstallCommand();

    // Memory deps dir detection should appear in console output
    const consoleCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(consoleCalls).toContain("Memory dependencies");
  });

  it("removes memory deps dir when user opts in (without removing global config)", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockImplementation((p) => {
      if (p === memoryDepsDir) return true;
      if (p === configDir) return true;
      if (p === devStateFile) return false;
      return false;
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockHasShellCompletion.mockReturnValue(false);

    // Confirm uninstall, decline config removal, confirm memory removal
    mockConfirm
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await uninstallCommand();

    expect(mockRmSync).toHaveBeenCalledWith(memoryDepsDir, {
      recursive: true,
      force: true,
    });
  });

  it("skips memory prompt when user already chose to remove global config", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockImplementation((p) => {
      if (p === memoryDepsDir) return true;
      if (p === configDir) return true;
      if (p === devStateFile) return false;
      const pathStr = p.toString();
      if (pathStr.includes(".claude")) return true;
      return false;
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockHasShellCompletion.mockReturnValue(false);

    // Confirm uninstall, confirm config removal (memory is inside config dir, no separate prompt)
    mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await uninstallCommand();

    // Should only have 2 confirm calls (uninstall + config), NOT 3 (no separate memory prompt)
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it("keeps memory deps when user declines memory removal", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockImplementation((p) => {
      if (p === memoryDepsDir) return true;
      if (p === configDir) return true;
      if (p === devStateFile) return false;
      return false;
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockHasShellCompletion.mockReturnValue(false);

    // Confirm uninstall, decline config removal, decline memory removal
    mockConfirm
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await uninstallCommand();

    expect(mockRmSync).not.toHaveBeenCalledWith(
      memoryDepsDir,
      expect.anything(),
    );
  });

  it("shows npm uninstall guidance after uninstall completes", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockImplementation((p) => {
      if (p === cachePath) return true;
      if (p === devStateFile) return false;
      return false;
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockHasShellCompletion.mockReturnValue(false);
    mockConfirm.mockResolvedValueOnce(true);

    await uninstallCommand();

    const consoleCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(consoleCalls).toContain("npm uninstall -g coding-friend-cli");
  });

  it("does not show npm uninstall guidance for project/local scope", async () => {
    mockCommandExists.mockReturnValue(true);
    mockResolveScope.mockResolvedValue("project");
    mockConfirm.mockResolvedValueOnce(true);
    mockRun.mockReturnValue("ok");

    await uninstallCommand({ project: true });

    const consoleCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(consoleCalls).not.toContain("npm uninstall -g coding-friend-cli");
  });
});
