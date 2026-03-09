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
import { enableCommand } from "../enable.js";

const mockIsPluginDisabled = vi.mocked(isPluginDisabled);
const mockSetPluginEnabled = vi.mocked(setPluginEnabled);
const mockResolveScope = vi.mocked(resolveScope);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockResolveScope.mockResolvedValue("user");
  mockIsPluginDisabled.mockReturnValue(true); // disabled by default for enable tests
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
});
