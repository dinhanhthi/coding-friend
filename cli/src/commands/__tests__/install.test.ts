import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  checkOmpVersion: vi.fn(),
  checkAgyVersion: vi.fn(),
  checkDevinVersion: vi.fn(),
}));

vi.mock("../../lib/agy-config.js", () => ({
  deployAgyPlugin: vi.fn(),
  resolveAgyPluginSource: vi.fn(),
  setAgyPluginEnabled: vi.fn(),
  validateAgyPlugin: vi.fn(),
}));

vi.mock("../../lib/codex-config.js", () => ({
  deployCodexAgents: vi.fn(),
  findCodexAgentSourceDir: vi.fn(),
  isCodexMarketplaceRegistered: vi.fn(),
  setCodexPluginEnabled: vi.fn(),
}));

vi.mock("../../lib/omp-config.js", () => ({
  deployOmpAgents: vi.fn(),
  writeOmpExtensionEntry: vi.fn(),
}));

vi.mock("../../lib/devin-config.js", () => ({
  reconcileDevinPlugin: vi.fn(),
}));

vi.mock("../../lib/memory-mcp-register.js", () => ({
  registerMemoryMcp: vi.fn(),
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
import {
  checkAgyVersion,
  checkCodexVersion,
  checkDevinVersion,
  checkOmpVersion,
} from "../../lib/host.js";
import {
  deployAgyPlugin,
  resolveAgyPluginSource,
  setAgyPluginEnabled,
  validateAgyPlugin,
} from "../../lib/agy-config.js";
import { resolveHostFlags, resolveScope } from "../../lib/prompt-utils.js";
import {
  deployCodexAgents,
  findCodexAgentSourceDir,
  isCodexMarketplaceRegistered,
  setCodexPluginEnabled,
} from "../../lib/codex-config.js";
import {
  deployOmpAgents,
  writeOmpExtensionEntry,
} from "../../lib/omp-config.js";
import { reconcileDevinPlugin } from "../../lib/devin-config.js";
import { registerMemoryMcp } from "../../lib/memory-mcp-register.js";
import { getLatestVersion, semverCompare } from "../update.js";
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
const mockCheckOmpVersion = vi.mocked(checkOmpVersion);
const mockDeployOmpAgents = vi.mocked(deployOmpAgents);
const mockWriteOmpExtensionEntry = vi.mocked(writeOmpExtensionEntry);
const mockRegisterMemoryMcp = vi.mocked(registerMemoryMcp);
const mockCheckAgyVersion = vi.mocked(checkAgyVersion);
const mockResolveAgyPluginSource = vi.mocked(resolveAgyPluginSource);
const mockDeployAgyPlugin = vi.mocked(deployAgyPlugin);
const mockSetAgyPluginEnabled = vi.mocked(setAgyPluginEnabled);
const mockValidateAgyPlugin = vi.mocked(validateAgyPlugin);
const mockCheckDevinVersion = vi.mocked(checkDevinVersion);
const mockReconcileDevinPlugin = vi.mocked(reconcileDevinPlugin);

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
  mockCheckOmpVersion.mockReturnValue({
    ok: true,
    actual: "18.0.3",
    min: "0.1.0",
  });
  mockDeployOmpAgents.mockReturnValue({
    deployed: ["cf-explorer.md"],
    skipped: [],
  });
  mockRegisterMemoryMcp.mockReturnValue(true);
  mockCheckAgyVersion.mockReturnValue({
    ok: true,
    actual: "1.1.0",
    min: "1.1.0",
  });
  mockResolveAgyPluginSource.mockReturnValue({
    path: "/repo/plugin-antigravity",
    kind: "dev",
  });
  mockDeployAgyPlugin.mockReturnValue({ files: 12 });
  mockValidateAgyPlugin.mockReturnValue({ stdout: "ok", status: 0 });
  mockCheckDevinVersion.mockReturnValue({
    ok: true,
    actual: "3000.11.3",
    min: "3000.11.3",
  });
  mockReconcileDevinPlugin.mockResolvedValue("installed");
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
    expect(mockDeployOmpAgents).not.toHaveBeenCalled();
    expect(mockWriteOmpExtensionEntry).not.toHaveBeenCalled();
    expect(mockRegisterMemoryMcp).not.toHaveBeenCalled();
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

  it("deploys omp agents, extension, and memory MCP for --agent omp", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockCommandExists.mockReturnValue(true);

    await installCommand({ agent: "omp" });

    expect(mockCommandExists).toHaveBeenCalledWith("omp");
    expect(mockCheckOmpVersion).toHaveBeenCalled();
    expect(mockDeployOmpAgents).toHaveBeenCalledWith("user");
    expect(mockWriteOmpExtensionEntry).toHaveBeenCalledWith("user");
    expect(mockRegisterMemoryMcp).toHaveBeenCalledWith("omp");
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockDeployCodexAgents).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalledWith("claude", expect.anything());
  });

  it("reports omp beta install success and skill inheritance", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockCommandExists.mockReturnValue(true);
    const logSpy = vi.spyOn(console, "log");

    await installCommand({ agent: "omp" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Installed for omp (beta)"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("~/.claude"));
  });

  it("uses project omp scope for --project", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockCommandExists.mockReturnValue(true);

    await installCommand({ agent: "omp", project: true });

    expect(mockDeployOmpAgents).toHaveBeenCalledWith("project");
    expect(mockWriteOmpExtensionEntry).toHaveBeenCalledWith("project");
  });

  it("maps --local to project omp scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockCommandExists.mockReturnValue(true);

    await installCommand({ agent: "omp", local: true });

    expect(mockDeployOmpAgents).toHaveBeenCalledWith("project");
    expect(mockWriteOmpExtensionEntry).toHaveBeenCalledWith("project");
  });

  it("exits when omp CLI is missing without deploying", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockCommandExists.mockReturnValue(false);
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log");

    await installCommand({ agent: "omp" });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("https://omp.sh/"),
    );
    expect(mockDeployOmpAgents).not.toHaveBeenCalled();
    expect(mockWriteOmpExtensionEntry).not.toHaveBeenCalled();
    expect(mockRegisterMemoryMcp).not.toHaveBeenCalled();
  });

  it("exits when omp version is unsupported without deploying", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockCommandExists.mockReturnValue(true);
    mockCheckOmpVersion.mockReturnValue({
      ok: false,
      actual: "0.0.1",
      min: "0.1.0",
    });
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log");

    await installCommand({ agent: "omp" });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("https://omp.sh/"),
    );
    expect(mockDeployOmpAgents).not.toHaveBeenCalled();
    expect(mockWriteOmpExtensionEntry).not.toHaveBeenCalled();
    expect(mockRegisterMemoryMcp).not.toHaveBeenCalled();
  });

  it("deploys the Antigravity plugin and memory MCP for --agent agy", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });
    mockCommandExists.mockReturnValue(true);

    await installCommand({ agent: "agy" });

    expect(mockCommandExists).toHaveBeenCalledWith("agy");
    expect(mockCheckAgyVersion).toHaveBeenCalled();
    expect(mockResolveAgyPluginSource).toHaveBeenCalled();
    expect(mockDeployAgyPlugin).toHaveBeenCalledWith(
      "/repo/plugin-antigravity",
    );
    expect(mockRegisterMemoryMcp).toHaveBeenCalledWith("agy");
    expect(mockSetAgyPluginEnabled).toHaveBeenCalledWith(true);
    expect(mockValidateAgyPlugin).toHaveBeenCalled();
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockDeployOmpAgents).not.toHaveBeenCalled();
    expect(mockDeployCodexAgents).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalledWith("claude", expect.anything());
  });

  it("exits when agy CLI is missing without deploying", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });
    mockCommandExists.mockReturnValue(false);
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log");

    await installCommand({ agent: "agy" });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("https://antigravity.google/"),
    );
    expect(mockDeployAgyPlugin).not.toHaveBeenCalled();
    expect(mockRegisterMemoryMcp).not.toHaveBeenCalled();
  });

  it("exits when agy version is unsupported without deploying", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });
    mockCommandExists.mockReturnValue(true);
    mockCheckAgyVersion.mockReturnValue({
      ok: false,
      actual: "1.0.0",
      min: "1.1.0",
    });
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await installCommand({ agent: "agy" });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockDeployAgyPlugin).not.toHaveBeenCalled();
    expect(mockRegisterMemoryMcp).not.toHaveBeenCalled();
  });

  it("reconciles the Devin plugin for --agent devin", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);

    await installCommand({ agent: "devin" });

    expect(mockCommandExists).toHaveBeenCalledWith("devin");
    expect(mockCheckDevinVersion).toHaveBeenCalled();
    expect(mockReconcileDevinPlugin).toHaveBeenCalledWith({
      allowReplace: true,
    });
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockDeployOmpAgents).not.toHaveBeenCalled();
    expect(mockDeployAgyPlugin).not.toHaveBeenCalled();
    expect(mockDeployCodexAgents).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalledWith("claude", expect.anything());
  });

  it("reconciles the Devin plugin for the --devin alias", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);

    await installCommand({ devin: true });

    expect(mockReconcileDevinPlugin).toHaveBeenCalledWith({
      allowReplace: true,
    });
  });

  it("registers the devin memory MCP after a successful reconcile", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);

    await installCommand({ agent: "devin" });

    expect(mockReconcileDevinPlugin).toHaveBeenCalled();
    expect(mockRegisterMemoryMcp).toHaveBeenCalledWith("devin");
  });

  it("does not register the devin memory MCP when reconcile fails", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);
    mockReconcileDevinPlugin.mockRejectedValue(
      new Error("Devin CLI is not signed in."),
    );

    await installCommand({ agent: "devin" });

    expect(mockRegisterMemoryMcp).not.toHaveBeenCalled();
  });

  it("prints the cf-plan hint after a successful Devin install", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);
    const logSpy = vi.spyOn(console, "log");

    await installCommand({ agent: "devin" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("/coding-friend:cf-plan");
  });

  it("exits when devin CLI is missing without reconciling", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(false);
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await installCommand({ agent: "devin" });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockCheckDevinVersion).not.toHaveBeenCalled();
    expect(mockReconcileDevinPlugin).not.toHaveBeenCalled();
  });

  it("exits when devin version is unsupported without reconciling", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);
    mockCheckDevinVersion.mockReturnValue({
      ok: false,
      actual: "3000.5.20",
      min: "3000.11.3",
    });
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await installCommand({ agent: "devin" });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockReconcileDevinPlugin).not.toHaveBeenCalled();
  });

  it("exits with the reconcile error (auth, target, install failures)", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);
    mockReconcileDevinPlugin.mockRejectedValue(
      new Error("Devin CLI is not signed in. Run `devin auth login` first."),
    );
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log");

    await installCommand({ agent: "devin" });

    expect(mockExit).toHaveBeenCalledWith(1);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("devin auth login");
  });
});

describe("installCommand human output (characterization)", () => {
  function captureLog() {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    return () => logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  it("claude: fresh install", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(false);
    mockGetInstalledVersion.mockReturnValue(null);
    mockRun.mockReturnValue("ok");
    const output = captureLog();

    await installCommand();

    expect(output()).toMatchInlineSnapshot(`
      "┌─────────────────────────────────┐
      │   ✨ Coding Friend Install ✨   │
      └─────────────────────────────────┘

      → Adding coding-friend marketplace...
      ✔ Marketplace added.
      ✔ Auto-update enabled for coding-friend plugin.
      → Installing plugin (user scope)...
      ✔ Plugin installed!

      ℹ Next steps:
        cf init           Initialize workspace (docs folders, config)
        cf memory init    Setup AI memory for the project (also available in cf init)
        cf statusline     Setup statusline in Claude Code to show more real-time info

      Restart Claude Code (or start a new session) to use the plugin."
    `);
  });

  it("claude: already installed, disabled, update available", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.2");
    mockIsPluginDisabled.mockReturnValue(true);
    vi.mocked(getLatestVersion).mockReturnValue("0.8.0");
    vi.mocked(semverCompare).mockReturnValue(-1);
    const output = captureLog();

    await installCommand();

    expect(output()).toMatchInlineSnapshot(`
      "┌─────────────────────────────────┐
      │   ✨ Coding Friend Install ✨   │
      └─────────────────────────────────┘

      ✔ Marketplace already registered.
      ✔ Auto-update enabled for coding-friend plugin.
      ✔ Plugin already installed (v0.7.2).
      ⚠ Plugin is installed but disabled at user scope. Run cf enable --user to re-enable.
      ⚠ Update available: v0.7.2 → v0.8.0. Run cf update to update.

      ℹ Next steps:
        cf init           Initialize workspace (docs folders, config)
        cf memory init    Setup AI memory for the project (also available in cf init)
        cf statusline     Setup statusline in Claude Code to show more real-time info

      Restart Claude Code (or start a new session) to use the plugin."
    `);
  });

  it("claude: already installed, no network", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.2");
    mockEnableMarketplaceAutoUpdate.mockReturnValue(false);
    const output = captureLog();

    await installCommand();

    expect(output()).toMatchInlineSnapshot(`
      "┌─────────────────────────────────┐
      │   ✨ Coding Friend Install ✨   │
      └─────────────────────────────────┘

      ✔ Marketplace already registered.
      ⚠ Cannot make plugin auto-update. Please enable it manually: https://cf.dinhanhthi.com/#install
      ✔ Plugin already installed (v0.7.2).
      Could not check for updates (no network or GitHub rate limit).

      ℹ Next steps:
        cf init           Initialize workspace (docs folders, config)
        cf memory init    Setup AI memory for the project (also available in cf init)
        cf statusline     Setup statusline in Claude Code to show more real-time info

      Restart Claude Code (or start a new session) to use the plugin."
    `);
  });

  it("claude: dev mode active", async () => {
    mockCommandExists.mockReturnValue(true);
    mockExistsSync.mockReturnValue(true);
    const output = captureLog();

    await installCommand();

    expect(output()).toMatchInlineSnapshot(`
      "┌─────────────────────────────────┐
      │   ✨ Coding Friend Install ✨   │
      └─────────────────────────────────┘

      ⚠ Dev mode is currently active.
      Run cf dev off first, then install. Or use cf dev sync to update the dev plugin."
    `);
  });

  it("claude: CLI missing", async () => {
    mockCommandExists.mockReturnValue(false);
    const output = captureLog();

    await installCommand();

    expect(output()).toMatchInlineSnapshot(`
      "┌─────────────────────────────────┐
      │   ✨ Coding Friend Install ✨   │
      └─────────────────────────────────┘

      ✖ Claude CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code/getting-started"
    `);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("codex: success", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "codex" });
    mockCommandExists.mockReturnValue(true);
    mockIsCodexMarketplaceRegistered.mockReturnValue(false);
    mockRun.mockReturnValue("ok");
    const output = captureLog();

    await installCommand({ agent: "codex" });

    expect(output()).toMatchInlineSnapshot(`
      "┌───────────────────────────────────────┐
      │   ✨ Coding Friend Codex Install ✨   │
      └───────────────────────────────────────┘

      → Adding coding-friend Codex marketplace...
      ✔ Codex marketplace registered.
      ✔ Codex plugin enablement recorded in ~/.codex/config.toml.
      ✔ Deployed 12 Codex agent definition(s).

      ℹ One manual Codex step remains:
        codex → /plugins → install coding-friend
      Codex CLI v0.130.0 exposes marketplace registration but not scriptable plugin install.
      Run cf update --agent codex for on-demand plugin updates."
    `);
  });

  it("codex: unsupported version", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "codex" });
    mockCommandExists.mockReturnValue(true);
    mockCheckCodexVersion.mockReturnValue({
      ok: false,
      actual: "0.129.0",
      min: "0.130.0",
    });
    const output = captureLog();

    await installCommand({ agent: "codex" });

    expect(output()).toMatchInlineSnapshot(`
      "┌───────────────────────────────────────┐
      │   ✨ Coding Friend Codex Install ✨   │
      └───────────────────────────────────────┘

      ✖ Codex CLI v0.129.0 is unsupported. Coding Friend requires Codex CLI >= 0.130.0.
      Upgrade Codex, then rerun: cf install --agent codex"
    `);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("omp: success", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockCommandExists.mockReturnValue(true);
    const output = captureLog();

    await installCommand({ agent: "omp" });

    expect(output()).toMatchInlineSnapshot(`
      "┌────────────────────────────────────────────┐
      │   ✨ Coding Friend omp Install (beta) ✨   │
      └────────────────────────────────────────────┘

      ✔ Deployed 1 omp agent definition(s).
      ✔ Wrote omp extension entry.

      ✔ Installed for omp (beta).
      Skills inherit from ~/.claude — no extra skill install needed.
      Restart omp (or start a new session) to pick up agents and MCP."
    `);
  });

  it("agy: success", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });
    mockCommandExists.mockReturnValue(true);
    const output = captureLog();

    await installCommand({ agent: "agy" });

    expect(output()).toMatchInlineSnapshot(`
      "┌────────────────────────────────────────────────────┐
      │   ✨ Coding Friend Antigravity Install (beta) ✨   │
      └────────────────────────────────────────────────────┘

      → Installing Antigravity plugin (dev source)...
      ✔ Deployed 12 Antigravity plugin file(s).
      ok

      ✔ Installed for Antigravity (beta).
      Restart Antigravity (or start a new \`agy\` session) to pick up the plugin.
      Note: autoApprove in config enables Claude Code (LLM classifier), Antigravity, Codex, and Devin (deterministic rules)."
    `);
  });

  it("agy: deploy failure", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });
    mockCommandExists.mockReturnValue(true);
    mockDeployAgyPlugin.mockImplementation(() => {
      throw new Error("plugin source missing");
    });
    const output = captureLog();

    await installCommand({ agent: "agy" });

    expect(output()).toMatchInlineSnapshot(`
      "┌────────────────────────────────────────────────────┐
      │   ✨ Coding Friend Antigravity Install (beta) ✨   │
      └────────────────────────────────────────────────────┘

      → Installing Antigravity plugin (dev source)...
      ✖ plugin source missing"
    `);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("devin: success", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);
    const output = captureLog();

    await installCommand({ agent: "devin" });

    expect(output()).toMatchInlineSnapshot(`
      "┌──────────────────────────────────────────────┐
      │   ✨ Coding Friend Devin Install (beta) ✨   │
      └──────────────────────────────────────────────┘

      ✔ Devin plugin installed.

      ✔ Installed for Devin (beta).
      Start a new Devin session to pick up the plugin, then try /coding-friend:cf-plan."
    `);
  });

  it("devin: already linked", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockCommandExists.mockReturnValue(true);
    mockReconcileDevinPlugin.mockResolvedValue("unchanged");
    const output = captureLog();

    await installCommand({ agent: "devin" });

    expect(output()).toMatchInlineSnapshot(`
      "┌──────────────────────────────────────────────┐
      │   ✨ Coding Friend Devin Install (beta) ✨   │
      └──────────────────────────────────────────────┘

      ✔ Devin plugin already installed (live --local link).

      ✔ Installed for Devin (beta).
      Start a new Devin session to pick up the plugin, then try /coding-friend:cf-plan."
    `);
  });
});

describe("installCommand --yes / --json", () => {
  let stdout: string[];
  let prevExitCode: typeof process.exitCode;

  beforeEach(() => {
    stdout = [];
    prevExitCode = process.exitCode;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
  });

  afterEach(() => {
    process.exitCode = prevExitCode;
  });

  function envelope() {
    expect(stdout).toHaveLength(1);
    return JSON.parse(stdout[0]);
  }

  it("--yes without a scope flag installs at user scope without prompting", async () => {
    mockGetInstalledVersion.mockReturnValue(null);
    mockRun.mockReturnValue("ok");

    await installCommand({ yes: true });

    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith("claude", [
      "plugin",
      "install",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      "user",
    ]);
  });

  it("--json --yes writes exactly one success envelope even when run prints text", async () => {
    mockIsMarketplaceRegistered.mockReturnValue(false);
    mockGetInstalledVersion
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("0.46.0");
    mockRun.mockReturnValue("Installing plugin...\nDone.\n");

    await installCommand({ json: true, yes: true });

    expect(envelope()).toEqual({
      contractVersion: 1,
      ok: true,
      data: {
        host: "claude",
        scope: "user",
        pluginVersion: "0.46.0",
        alreadyInstalled: false,
        disabled: false,
      },
      error: null,
    });
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(prevExitCode);
  });

  it("--json reports an existing disabled install", async () => {
    mockGetInstalledVersion.mockReturnValue("0.46.0");
    mockIsPluginDisabled.mockReturnValue(true);

    await installCommand({ json: true, user: true });

    expect(envelope().data).toEqual({
      host: "claude",
      scope: "user",
      pluginVersion: "0.46.0",
      alreadyInstalled: true,
      disabled: true,
    });
  });

  it("--json alone returns INTERACTIVE_REQUIRED without prompting", async () => {
    await installCommand({ json: true });

    expect(envelope()).toMatchObject({
      ok: false,
      data: null,
      error: { code: "INTERACTIVE_REQUIRED" },
    });
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("--json with conflicting scope flags returns INVALID_ARGS without resolveScope", async () => {
    await installCommand({ json: true, yes: true, project: true, local: true });

    expect(envelope().error.code).toBe("INVALID_ARGS");
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("--json with a scope flag uses it without resolveScope", async () => {
    mockGetInstalledVersion.mockReturnValue(null);
    mockRun.mockReturnValue("ok");

    await installCommand({ json: true, project: true });

    expect(envelope().data.scope).toBe("project");
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("--json in dev mode returns DEV_MODE_ACTIVE", async () => {
    mockExistsSync.mockReturnValue(true);

    await installCommand({ json: true, yes: true });

    expect(envelope().error.code).toBe("DEV_MODE_ACTIVE");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("--json maps a host resolution error to INVALID_ARGS", async () => {
    mockResolveHostFlags.mockImplementation(() => {
      throw new Error('Unknown agent "foo"');
    });

    await installCommand({ json: true, yes: true, agent: "foo" });

    expect(envelope().error).toEqual({
      code: "INVALID_ARGS",
      message: 'Unknown agent "foo"',
    });
  });

  it("--json turns a missing host CLI into an error envelope, not process.exit", async () => {
    mockCommandExists.mockReturnValue(false);

    await installCommand({ json: true, yes: true });

    expect(envelope().error.code).toBe("NOT_FOUND");
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("--json reports devin result", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "devin" });
    mockReconcileDevinPlugin.mockResolvedValue("unchanged");

    await installCommand({ json: true, agent: "devin" });

    expect(envelope().data).toEqual({
      host: "devin",
      scope: null,
      pluginVersion: null,
      alreadyInstalled: true,
      disabled: false,
    });
  });
});
