import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../json.js", () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  claudeSettingsPath: vi.fn(() => "/home/user/.claude/settings.json"),
  claudeProjectSettingsPath: vi.fn(() => "/project/.claude/settings.json"),
  claudeLocalSettingsPath: vi.fn(() => "/project/.claude/settings.local.json"),
  installedPluginsPath: vi.fn(
    () => "/home/user/.claude/plugins/installed_plugins.json",
  ),
  knownMarketplacesPath: vi.fn(
    () => "/home/user/.claude/plugins/known_marketplaces.json",
  ),
}));

import { readJson, writeJson } from "../json.js";
import {
  settingsPathForScope,
  isPluginDisabled,
  setPluginEnabled,
  enableMarketplaceAutoUpdate,
} from "../plugin-state.js";

const mockReadJson = vi.mocked(readJson);
const mockWriteJson = vi.mocked(writeJson);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("settingsPathForScope", () => {
  it("returns user settings path for 'user' scope", () => {
    expect(settingsPathForScope("user")).toBe(
      "/home/user/.claude/settings.json",
    );
  });

  it("returns project settings path for 'project' scope", () => {
    expect(settingsPathForScope("project")).toBe(
      "/project/.claude/settings.json",
    );
  });

  it("returns local settings path for 'local' scope", () => {
    expect(settingsPathForScope("local")).toBe(
      "/project/.claude/settings.local.json",
    );
  });
});

describe("isPluginDisabled", () => {
  it("returns false when settings file does not exist", () => {
    mockReadJson.mockReturnValue(null);
    expect(isPluginDisabled("user")).toBe(false);
  });

  it("returns false when enabledPlugins key does not exist", () => {
    mockReadJson.mockReturnValue({ someOtherKey: true });
    expect(isPluginDisabled("user")).toBe(false);
  });

  it("returns false when plugin is not in enabledPlugins", () => {
    mockReadJson.mockReturnValue({
      enabledPlugins: { "other-plugin@other": true },
    });
    expect(isPluginDisabled("user")).toBe(false);
  });

  it("returns false when plugin is explicitly enabled (true)", () => {
    mockReadJson.mockReturnValue({
      enabledPlugins: { "coding-friend@coding-friend-marketplace": true },
    });
    expect(isPluginDisabled("user")).toBe(false);
  });

  it("returns true when plugin is explicitly disabled (false)", () => {
    mockReadJson.mockReturnValue({
      enabledPlugins: { "coding-friend@coding-friend-marketplace": false },
    });
    expect(isPluginDisabled("user")).toBe(true);
  });

  it("reads from the correct path for each scope", () => {
    mockReadJson.mockReturnValue(null);

    isPluginDisabled("user");
    expect(mockReadJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
    );

    isPluginDisabled("project");
    expect(mockReadJson).toHaveBeenCalledWith("/project/.claude/settings.json");

    isPluginDisabled("local");
    expect(mockReadJson).toHaveBeenCalledWith(
      "/project/.claude/settings.local.json",
    );
  });
});

describe("setPluginEnabled", () => {
  it("creates enabledPlugins with false when disabling and file does not exist", () => {
    mockReadJson.mockReturnValue(null);

    setPluginEnabled("user", false);

    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      {
        enabledPlugins: { "coding-friend@coding-friend-marketplace": false },
      },
    );
  });

  it("sets plugin to false when disabling and file exists", () => {
    mockReadJson.mockReturnValue({
      someOtherSetting: "value",
      enabledPlugins: { "other-plugin@other": true },
    });

    setPluginEnabled("user", false);

    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      {
        someOtherSetting: "value",
        enabledPlugins: {
          "other-plugin@other": true,
          "coding-friend@coding-friend-marketplace": false,
        },
      },
    );
  });

  it("removes plugin key when enabling (omitted = enabled)", () => {
    mockReadJson.mockReturnValue({
      enabledPlugins: {
        "coding-friend@coding-friend-marketplace": false,
        "other-plugin@other": true,
      },
    });

    setPluginEnabled("user", true);

    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      {
        enabledPlugins: { "other-plugin@other": true },
      },
    );
  });

  it("removes enabledPlugins key entirely when it becomes empty after enabling", () => {
    mockReadJson.mockReturnValue({
      someSetting: "value",
      enabledPlugins: {
        "coding-friend@coding-friend-marketplace": false,
      },
    });

    setPluginEnabled("user", true);

    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      { someSetting: "value" },
    );
  });

  it("writes empty object when enabling and file does not exist", () => {
    mockReadJson.mockReturnValue(null);

    setPluginEnabled("user", true);

    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      {},
    );
  });

  it("writes to the correct path for each scope", () => {
    mockReadJson.mockReturnValue(null);

    setPluginEnabled("project", false);
    expect(mockWriteJson).toHaveBeenCalledWith(
      "/project/.claude/settings.json",
      expect.any(Object),
    );

    setPluginEnabled("local", false);
    expect(mockWriteJson).toHaveBeenCalledWith(
      "/project/.claude/settings.local.json",
      expect.any(Object),
    );
  });
});

describe("enableMarketplaceAutoUpdate", () => {
  it("creates extraKnownMarketplaces when settings file does not exist", () => {
    mockReadJson.mockReturnValue(null);

    const result = enableMarketplaceAutoUpdate();

    expect(result).toBe(true);
    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      {
        extraKnownMarketplaces: {
          "coding-friend-marketplace": {
            source: { source: "github", repo: "dinhanhthi/coding-friend" },
            autoUpdate: true,
          },
        },
      },
    );
  });

  it("adds autoUpdate to existing marketplace entry", () => {
    mockReadJson.mockReturnValue({
      extraKnownMarketplaces: {
        "coding-friend-marketplace": {
          source: { source: "github", repo: "dinhanhthi/coding-friend" },
        },
      },
    });

    const result = enableMarketplaceAutoUpdate();

    expect(result).toBe(true);
    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      {
        extraKnownMarketplaces: {
          "coding-friend-marketplace": {
            source: { source: "github", repo: "dinhanhthi/coding-friend" },
            autoUpdate: true,
          },
        },
      },
    );
  });

  it("returns true without writing when autoUpdate is already enabled", () => {
    mockReadJson.mockReturnValue({
      extraKnownMarketplaces: {
        "coding-friend-marketplace": {
          source: { source: "github", repo: "dinhanhthi/coding-friend" },
          autoUpdate: true,
        },
      },
    });

    const result = enableMarketplaceAutoUpdate();

    expect(result).toBe(true);
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  it("preserves other settings when adding autoUpdate", () => {
    mockReadJson.mockReturnValue({
      someSetting: "value",
      extraKnownMarketplaces: {
        "other-marketplace": { source: { source: "github", repo: "other" } },
        "coding-friend-marketplace": {
          source: { source: "github", repo: "dinhanhthi/coding-friend" },
        },
      },
    });

    const result = enableMarketplaceAutoUpdate();

    expect(result).toBe(true);
    expect(mockWriteJson).toHaveBeenCalledWith(
      "/home/user/.claude/settings.json",
      {
        someSetting: "value",
        extraKnownMarketplaces: {
          "other-marketplace": { source: { source: "github", repo: "other" } },
          "coding-friend-marketplace": {
            source: { source: "github", repo: "dinhanhthi/coding-friend" },
            autoUpdate: true,
          },
        },
      },
    );
  });

  it("returns false when writeJson throws", () => {
    mockReadJson.mockReturnValue({});
    mockWriteJson.mockImplementation(() => {
      throw new Error("permission denied");
    });

    const result = enableMarketplaceAutoUpdate();

    expect(result).toBe(false);
  });
});
