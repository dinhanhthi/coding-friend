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
}));

import { isPluginDisabled, setPluginEnabled } from "../../lib/plugin-state.js";
import { resolveScope } from "../../lib/prompt-utils.js";
import { disableCommand } from "../disable.js";

const mockIsPluginDisabled = vi.mocked(isPluginDisabled);
const mockSetPluginEnabled = vi.mocked(setPluginEnabled);
const mockResolveScope = vi.mocked(resolveScope);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockResolveScope.mockResolvedValue("user");
  mockIsPluginDisabled.mockReturnValue(false);
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
});
