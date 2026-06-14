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
import { enableCommand } from "../enable.js";

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
  mockIsPluginDisabled.mockReturnValue(true); // disabled by default for enable tests
  mockIsCodexPluginDisabled.mockReturnValue(true);
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
});
