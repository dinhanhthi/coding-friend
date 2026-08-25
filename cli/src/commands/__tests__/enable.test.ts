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
  setOmpAgentEnabled: vi.fn(),
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
import { setOmpAgentEnabled } from "../../lib/omp-config.js";
import { resolveHostFlags, resolveScope } from "../../lib/prompt-utils.js";
import { enableCommand } from "../enable.js";

const mockIsPluginDisabled = vi.mocked(isPluginDisabled);
const mockSetPluginEnabled = vi.mocked(setPluginEnabled);
const mockResolveScope = vi.mocked(resolveScope);
const mockResolveHostFlags = vi.mocked(resolveHostFlags);
const mockIsCodexPluginDisabled = vi.mocked(isCodexPluginDisabled);
const mockSetCodexPluginEnabled = vi.mocked(setCodexPluginEnabled);
const mockSetOmpAgentEnabled = vi.mocked(setOmpAgentEnabled);
const mockIsAgyPluginEnabled = vi.mocked(isAgyPluginEnabled);
const mockSetAgyPluginEnabled = vi.mocked(setAgyPluginEnabled);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockResolveHostFlags.mockReturnValue({ host: "claude" });
  mockResolveScope.mockResolvedValue("user");
  mockIsPluginDisabled.mockReturnValue(true); // disabled by default for enable tests
  mockIsCodexPluginDisabled.mockReturnValue(true);
  mockSetOmpAgentEnabled.mockReturnValue(true);
  mockIsAgyPluginEnabled.mockReturnValue(false);
});

describe("enableCommand", () => {
  it("resolves scope from options", async () => {
    await enableCommand({ project: true });

    expect(mockResolveScope).toHaveBeenCalledWith(
      { project: true },
      "Where should Coding Friend be enabled?",
    );
  });

  it("skips when plugin is already enabled at scope", async () => {
    mockIsPluginDisabled.mockReturnValue(false);

    await enableCommand();

    expect(mockSetPluginEnabled).not.toHaveBeenCalled();
  });

  it("calls setPluginEnabled with true for the resolved scope", async () => {
    mockResolveScope.mockResolvedValue("project");

    await enableCommand({ project: true });

    expect(mockSetPluginEnabled).toHaveBeenCalledWith("project", true);
  });

  it("calls setPluginEnabled with true for user scope", async () => {
    mockResolveScope.mockResolvedValue("user");

    await enableCommand({ user: true });

    expect(mockSetPluginEnabled).toHaveBeenCalledWith("user", true);
  });

  it("calls setPluginEnabled with true for local scope", async () => {
    mockResolveScope.mockResolvedValue("local");

    await enableCommand({ local: true });

    expect(mockSetPluginEnabled).toHaveBeenCalledWith("local", true);
  });

  it("enables Codex plugin without resolving Claude scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "codex" });

    await enableCommand({ agent: "codex" });

    expect(mockSetCodexPluginEnabled).toHaveBeenCalledWith(true);
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("enables omp agents without resolving Claude scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await enableCommand({ agent: "omp" });

    expect(mockSetOmpAgentEnabled).toHaveBeenCalledWith("user");
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockSetPluginEnabled).not.toHaveBeenCalled();
    expect(mockSetCodexPluginEnabled).not.toHaveBeenCalled();
  });

  it("maps omp --project to project scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await enableCommand({ agent: "omp", project: true });

    expect(mockSetOmpAgentEnabled).toHaveBeenCalledWith("project");
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("maps omp --local to project scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await enableCommand({ agent: "omp", local: true });

    expect(mockSetOmpAgentEnabled).toHaveBeenCalledWith("project");
    expect(mockResolveScope).not.toHaveBeenCalled();
  });

  it("logs info instead of success when omp config is missing", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockSetOmpAgentEnabled.mockReturnValue(false);

    await enableCommand({ agent: "omp" });

    const output = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(output).toContain("already enabled");
    expect(output).not.toContain("Coding Friend enabled for omp at");
  });

  it("logs success when omp enable writes a disable-list change", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });
    mockSetOmpAgentEnabled.mockReturnValue(true);

    await enableCommand({ agent: "omp" });

    const output = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(output).toContain("Coding Friend enabled for omp at");
    expect(output).not.toContain("already enabled");
  });

  it("enables Antigravity plugin without resolving Claude scope", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });

    await enableCommand({ agent: "agy" });

    expect(mockSetAgyPluginEnabled).toHaveBeenCalledWith(true);
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(mockSetPluginEnabled).not.toHaveBeenCalled();
    expect(mockSetCodexPluginEnabled).not.toHaveBeenCalled();
    expect(mockSetOmpAgentEnabled).not.toHaveBeenCalled();
  });

  it("logs info instead of success when Antigravity is already enabled", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "agy" });
    mockIsAgyPluginEnabled.mockReturnValue(true);

    await enableCommand({ agent: "agy" });

    expect(mockSetAgyPluginEnabled).not.toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(output).toContain("already enabled");
  });
});
