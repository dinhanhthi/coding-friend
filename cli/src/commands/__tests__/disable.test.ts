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

import { isPluginDisabled, setPluginEnabled } from "../../lib/plugin-state.js";
import {
  isCodexPluginDisabled,
  setCodexPluginEnabled,
} from "../../lib/codex-config.js";
import { resolveHostFlags, resolveScope } from "../../lib/prompt-utils.js";
import { disableCommand } from "../disable.js";

const mockIsPluginDisabled = vi.mocked(isPluginDisabled);
const mockSetPluginEnabled = vi.mocked(setPluginEnabled);
const mockResolveScope = vi.mocked(resolveScope);
const mockResolveHostFlags = vi.mocked(resolveHostFlags);
const mockIsCodexPluginDisabled = vi.mocked(isCodexPluginDisabled);
const mockSetCodexPluginEnabled = vi.mocked(setCodexPluginEnabled);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockResolveHostFlags.mockReturnValue({ host: "claude" });
  mockResolveScope.mockResolvedValue("user");
  mockIsPluginDisabled.mockReturnValue(false);
  mockIsCodexPluginDisabled.mockReturnValue(false);
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
});
