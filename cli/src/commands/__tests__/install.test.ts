import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
}));

vi.mock("../../lib/plugin-state.js", () => ({
  isMarketplaceRegistered: vi.fn(),
  isPluginDisabled: vi.fn(),
  enableMarketplaceAutoUpdate: vi.fn(),
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
  resolveHostFlags: vi.fn(),
}));

vi.mock("../../lib/host.js", () => ({
  checkCodexVersion: vi.fn(),
}));

vi.mock("../../lib/codex-config.js", () => ({
  deployCodexAgents: vi.fn(),
  findCodexAgentSourceDir: vi.fn(),
  isCodexMarketplaceRegistered: vi.fn(),
  setCodexPluginEnabled: vi.fn(),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, existsSync: vi.fn() };
});

import { existsSync } from "fs";
import { commandExists, run } from "../../lib/exec.js";
import {
  isMarketplaceRegistered,
  isPluginDisabled,
  enableMarketplaceAutoUpdate,
} from "../../lib/plugin-state.js";
import { getInstalledVersion } from "../../lib/statusline.js";
import { ensureShellCompletion } from "../../lib/shell-completion.js";
import { checkCodexVersion } from "../../lib/host.js";
import { resolveHostFlags, resolveScope } from "../../lib/prompt-utils.js";
import {
  deployCodexAgents,
  findCodexAgentSourceDir,
  isCodexMarketplaceRegistered,
  setCodexPluginEnabled,
} from "../../lib/codex-config.js";
import { installCommand } from "../install.js";

const mockExistsSync = vi.mocked(existsSync);
const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockIsMarketplaceRegistered = vi.mocked(isMarketplaceRegistered);
const mockIsPluginDisabled = vi.mocked(isPluginDisabled);
const mockEnableMarketplaceAutoUpdate = vi.mocked(enableMarketplaceAutoUpdate);
const mockGetInstalledVersion = vi.mocked(getInstalledVersion);
const mockEnsureShellCompletion = vi.mocked(ensureShellCompletion);
const mockResolveScope = vi.mocked(resolveScope);
const mockResolveHostFlags = vi.mocked(resolveHostFlags);
const mockCheckCodexVersion = vi.mocked(checkCodexVersion);
const mockIsCodexMarketplaceRegistered = vi.mocked(
  isCodexMarketplaceRegistered,
);
const mockSetCodexPluginEnabled = vi.mocked(setCodexPluginEnabled);
const mockFindCodexAgentSourceDir = vi.mocked(findCodexAgentSourceDir);
const mockDeployCodexAgents = vi.mocked(deployCodexAgents);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  mockResolveHostFlags.mockReturnValue({ host: "claude" });
  mockResolveScope.mockResolvedValue("user");
  mockExistsSync.mockReturnValue(false); // no dev mode by default
  mockEnableMarketplaceAutoUpdate.mockReturnValue(true);
  mockCheckCodexVersion.mockReturnValue({
    ok: true,
    actual: "0.130.0",
    min: "0.130.0",
  });
  mockFindCodexAgentSourceDir.mockReturnValue("/repo/plugin-codex/agents");
  mockDeployCodexAgents.mockReturnValue(12);
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

  it("keeps the no-flag install path on the Claude marketplace flow", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(false);
    mockGetInstalledVersion.mockReturnValue(null);
    mockResolveScope.mockResolvedValue("user");
    mockRun.mockReturnValue("ok");

    await installCommand();

    expect(mockResolveHostFlags).toHaveBeenCalledWith({});
    expect(mockCommandExists).toHaveBeenCalledWith("claude");
    expect(mockResolveScope).toHaveBeenCalledWith({});
    expect(mockRun.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "claude",
          [
            "plugin",
            "marketplace",
            "add",
            "dinhanhthi/coding-friend",
          ],
        ],
        [
          "claude",
          [
            "plugin",
            "install",
            "coding-friend@coding-friend-marketplace",
            "--scope",
            "user",
          ],
        ],
      ]
    `);
    expect(mockIsCodexMarketplaceRegistered).not.toHaveBeenCalled();
    expect(mockSetCodexPluginEnabled).not.toHaveBeenCalled();
    expect(mockFindCodexAgentSourceDir).not.toHaveBeenCalled();
    expect(mockDeployCodexAgents).not.toHaveBeenCalled();
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

  it("warns when plugin is installed but disabled at scope", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.3");
    mockIsPluginDisabled.mockReturnValue(true);

    const logSpy = vi.spyOn(console, "log");

    await installCommand();

    expect(mockIsPluginDisabled).toHaveBeenCalledWith("user");
    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("disabled"),
    );
  });

  it("calls enableMarketplaceAutoUpdate after marketplace registration", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.2");

    await installCommand();

    expect(mockEnableMarketplaceAutoUpdate).toHaveBeenCalled();
  });

  it("warns when auto-update cannot be enabled", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.2");
    mockEnableMarketplaceAutoUpdate.mockReturnValue(false);

    const logSpy = vi.spyOn(console, "log");

    await installCommand();

    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Cannot make plugin auto-update"),
    );
  });

  it("registers Codex marketplace and deploys agents for --agent codex", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "codex" });
    mockCommandExists.mockReturnValue(true);
    mockIsCodexMarketplaceRegistered.mockReturnValue(false);
    mockRun.mockReturnValue("ok");

    await installCommand({ agent: "codex" });

    expect(mockCommandExists).toHaveBeenCalledWith("codex");
    expect(mockRun).toHaveBeenCalledWith("codex", [
      "plugin",
      "marketplace",
      "add",
      "dinhanhthi/coding-friend",
    ]);
    expect(mockSetCodexPluginEnabled).toHaveBeenCalledWith(true);
    expect(mockDeployCodexAgents).toHaveBeenCalledWith(
      "/repo/plugin-codex/agents",
    );
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("exits when Codex version is too old", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "codex" });
    mockCommandExists.mockReturnValue(true);
    mockCheckCodexVersion.mockReturnValue({
      ok: false,
      actual: "0.129.0",
      min: "0.130.0",
    });
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await installCommand({ agent: "codex" });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockRun).not.toHaveBeenCalledWith("codex", [
      "plugin",
      "marketplace",
      "add",
      "dinhanhthi/coding-friend",
    ]);
  });
});
