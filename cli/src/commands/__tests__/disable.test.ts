import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/plugin-state.js", () => ({
  isPluginDisabled: vi.fn(),
  setPluginEnabled: vi.fn(),
  isPluginInstalled: vi.fn(),
  isMarketplaceRegistered: vi.fn(),
  settingsPathForScope: vi.fn(),
}));

vi.mock("../../lib/prompt-utils.js", () => ({
  resolveScope: vi.fn(),
  resolveHostFlags: vi.fn(),
}));

vi.mock("../../lib/codex-config.js", () => ({
  isCodexPluginDisabled: vi.fn(),
  setCodexPluginEnabled: vi.fn(),
}));

vi.mock("../../lib/omp-config.js", () => ({
  setOmpAgentDisabled: vi.fn(),
}));

vi.mock("../../lib/agy-config.js", () => ({
  isAgyPluginEnabled: vi.fn(),
  setAgyPluginEnabled: vi.fn(),
}));

import { isPluginDisabled, setPluginEnabled } from "../../lib/plugin-state.js";
import {
  isCodexPluginDisabled,
  setCodexPluginEnabled,
} from "../../lib/codex-config.js";
import {
  isAgyPluginEnabled,
  setAgyPluginEnabled,
} from "../../lib/agy-config.js";
import { setOmpAgentDisabled } from "../../lib/omp-config.js";
import { resolveHostFlags, resolveScope } from "../../lib/prompt-utils.js";
import { disableCommand } from "../disable.js";

const mockIsPluginDisabled = vi.mocked(isPluginDisabled);
const mockSetPluginEnabled = vi.mocked(setPluginEnabled);
const mockResolveScope = vi.mocked(resolveScope);
const mockResolveHostFlags = vi.mocked(resolveHostFlags);
const mockIsCodexPluginDisabled = vi.mocked(isCodexPluginDisabled);
const mockSetCodexPluginEnabled = vi.mocked(setCodexPluginEnabled);
const mockSetOmpAgentDisabled = vi.mocked(setOmpAgentDisabled);
const mockIsAgyPluginEnabled = vi.mocked(isAgyPluginEnabled);
const mockSetAgyPluginEnabled = vi.mocked(setAgyPluginEnabled);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockResolveHostFlags.mockReturnValue({ host: "claude" });
  mockResolveScope.mockResolvedValue("user");
  mockIsPluginDisabled.mockReturnValue(false);
  mockIsCodexPluginDisabled.mockReturnValue(false);
  mockIsAgyPluginEnabled.mockReturnValue(true);
});

describe("disableCommand", () => {
  it("resolves scope from options", async () => {
    await disableCommand({ project: true });

    expect(mockResolveScope).toHaveBeenCalledWith(
      { project: true },
      "Where should Coding Friend be disabled?",
    );
  });

  it("skips when plugin is already disabled at scope", async () => {
    mockIsPluginDisabled.mockReturnValue(true);

    await disableCommand();

    expect(mockSetPluginEnabled).not.toHaveBeenCalled();
  });

  it("calls setPluginEnabled with false for the resolved scope", async () => {
    mockResolveScope.mockResolvedValue("project");

    await disableCommand({ project: true });

    expect(mockSetPluginEnabled).toHaveBeenCalledWith("project", false);
  });

  it("calls setPluginEnabled with false for user scope", async () => {
    mockResolveScope.mockResolvedValue("user");

    await disableCommand({ user: true });

    expect(mockSetPluginEnabled).toHaveBeenCalledWith("user", false);
  });

  it("calls setPluginEnabled with false for local scope", async () => {
    mockResolveScope.mockResolvedValue("local");

    await disableCommand({ local: true });

    expect(mockSetPluginEnabled).toHaveBeenCalledWith("local", false);
  });

  it("disables Codex plugin without resolving Claude scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "codex" });

    await disableCommand({ agent: "codex" });

    expect(mockSetCodexPluginEnabled).toHaveBeenCalledWith(false);
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("disables omp agents without resolving Claude scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await disableCommand({ agent: "omp" });

    expect(mockSetOmpAgentDisabled).toHaveBeenCalledWith("user");
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockSetPluginEnabled).not.toHaveBeenCalled();
    expect(mockSetCodexPluginEnabled).not.toHaveBeenCalled();
  });

  it("maps omp --project to project scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await disableCommand({ agent: "omp", project: true });

    expect(mockSetOmpAgentDisabled).toHaveBeenCalledWith("project");
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("maps omp --local to project scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await disableCommand({ agent: "omp", local: true });

    expect(mockSetOmpAgentDisabled).toHaveBeenCalledWith("project");
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("disables Antigravity plugin without resolving Claude scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });

    await disableCommand({ agent: "agy" });

    expect(mockSetAgyPluginEnabled).toHaveBeenCalledWith(false);
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockSetPluginEnabled).not.toHaveBeenCalled();
    expect(mockSetCodexPluginEnabled).not.toHaveBeenCalled();
    expect(mockSetOmpAgentDisabled).not.toHaveBeenCalled();
  });

  it("skips when Antigravity plugin is already disabled", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });
    mockIsAgyPluginEnabled.mockReturnValue(false);

    await disableCommand({ agent: "agy" });

    expect(mockSetAgyPluginEnabled).not.toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(output).toContain("already disabled");
  });
});
