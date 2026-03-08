import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
}));

vi.mock("../../lib/plugin-state.js", () => ({
  isMarketplaceRegistered: vi.fn(),
}));

vi.mock("../../lib/statusline.js", () => ({
  getInstalledVersion: vi.fn(),
}));

vi.mock("../../lib/shell-completion.js", () => ({
  ensureShellCompletion: vi.fn(),
}));

vi.mock("../update.js", () => ({
  getLatestVersion: vi.fn(),
  semverCompare: vi.fn(),
}));

vi.mock("../../lib/prompt-utils.js", () => ({
  resolveScope: vi.fn(),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, existsSync: vi.fn() };
});

import { existsSync } from "fs";
import { commandExists, run } from "../../lib/exec.js";
import { isMarketplaceRegistered } from "../../lib/plugin-state.js";
import { getInstalledVersion } from "../../lib/statusline.js";
import { ensureShellCompletion } from "../../lib/shell-completion.js";
import { resolveScope } from "../../lib/prompt-utils.js";
import { installCommand } from "../install.js";

const mockExistsSync = vi.mocked(existsSync);
const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockIsMarketplaceRegistered = vi.mocked(isMarketplaceRegistered);
const mockGetInstalledVersion = vi.mocked(getInstalledVersion);
const mockEnsureShellCompletion = vi.mocked(ensureShellCompletion);
const mockResolveScope = vi.mocked(resolveScope);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  mockResolveScope.mockResolvedValue("user");
  mockExistsSync.mockReturnValue(false); // no dev mode by default
});

describe("installCommand", () => {
  it("calls ensureShellCompletion after successful install", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.2");

    await installCommand();

    expect(mockEnsureShellCompletion).toHaveBeenCalledWith({ silent: false });
  });

  it("calls ensureShellCompletion even when plugin needs installing", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(false);
    mockRun.mockReturnValue("ok");
    mockGetInstalledVersion.mockReturnValueOnce(null).mockReturnValueOnce(null);

    await installCommand();

    expect(mockEnsureShellCompletion).toHaveBeenCalledWith({ silent: false });
  });

  it("exits early when claude CLI is missing", async () => {
    mockCommandExists.mockReturnValue(false);
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await installCommand();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("exits early when dev mode is active", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockReturnValue(true); // dev-state.json exists

    await installCommand();

    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("calls resolveScope with provided options", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.2");

    await installCommand({ project: true });

    expect(mockResolveScope).toHaveBeenCalledWith({ project: true });
  });

  it("passes --scope project to claude plugin install", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue(null);
    mockResolveScope.mockResolvedValue("project");
    mockRun.mockReturnValue("ok");

    await installCommand({ project: true });

    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "install",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "project",
    ]);
  });

  it("passes --scope local to claude plugin install", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue(null);
    mockResolveScope.mockResolvedValue("local");
    mockRun.mockReturnValue("ok");

    await installCommand({ local: true });

    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "install",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "local",
    ]);
  });

  it("passes --scope user to claude plugin install by default", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue(null);
    mockResolveScope.mockResolvedValue("user");
    mockRun.mockReturnValue("ok");

    await installCommand();

    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "install",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "user",
    ]);
  });

  it("does not pass --scope to marketplace add (always global)", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(false);
    mockGetInstalledVersion.mockReturnValue(null);
    mockResolveScope.mockResolvedValue("project");
    mockRun.mockReturnValue("ok");

    await installCommand({ project: true });

    // marketplace add should NOT have --scope
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "marketplace",
      "add",
      "dinhanhthi/coding-friend",
    ]);
  });
});
