import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
  };
});

vi.mock("../statusline.js", () => ({ getInstalledVersion: vi.fn() }));
vi.mock("../json.js", () => ({ readJson: vi.fn() }));

vi.mock("../paths.js", () => ({
  claudeSettingsPath: vi.fn(() => "/mock/.claude/settings.json"),
  globalConfigPath: vi.fn(() => "/mock/.coding-friend/config.json"),
  localConfigPath: vi.fn(() => "/mock/project/.coding-friend/config.json"),
  devStatePath: vi.fn(() => "/mock/.coding-friend/dev-state.json"),
  agyPluginDir: vi.fn(() => "/mock/agy"),
  resolvePath: vi.fn((p: string) => p),
}));

vi.mock("../agy-config.js", () => ({
  isAgyPluginInstalled: vi.fn(),
  isAgyPluginEnabled: vi.fn(),
  readAgyPluginVersion: vi.fn(),
}));

vi.mock("../devin-config.js", () => ({ readDevinInstallState: vi.fn() }));

vi.mock("../config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config.js")>();
  return { ...actual, resolveMemoryDir: vi.fn(() => "/mock/docs/memory") };
});

vi.mock("../plugin-state.js", () => ({
  isPluginDisabled: vi.fn(),
  detectPluginScope: vi.fn(),
}));

vi.mock("../permissions.js", () => ({ getExistingRules: vi.fn() }));
vi.mock("../lib-path.js", () => ({ getLibPath: vi.fn(() => "/mock/lib") }));
vi.mock("../memory-mcp-register.js", () => ({
  isMemoryMcpRegistered: vi.fn(() => true),
}));
vi.mock("../learn-prompts.js", () => ({
  isLearnMcpRegistered: vi.fn(() => true),
}));

vi.mock("../../commands/update.js", () => ({
  getLatestVersion: vi.fn(),
  getCliVersion: vi.fn(),
  getLatestCliVersion: vi.fn(),
  semverCompare: (a: string, b: string): number =>
    a === b ? 0 : a < b ? -1 : 1,
}));

import { getInstalledVersion } from "../statusline.js";
import { readJson } from "../json.js";
import { resolvePath } from "../paths.js";
import {
  isAgyPluginInstalled,
  isAgyPluginEnabled,
  readAgyPluginVersion,
} from "../agy-config.js";
import { readDevinInstallState } from "../devin-config.js";
import { isPluginDisabled, detectPluginScope } from "../plugin-state.js";
import { getExistingRules } from "../permissions.js";
import {
  getLatestVersion,
  getCliVersion,
  getLatestCliVersion,
} from "../../commands/update.js";
import {
  collectConfig,
  collectMcp,
  collectMemory,
  collectPlugin,
  collectStatus,
  collectVersions,
} from "../status-data.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getInstalledVersion).mockReturnValue(null);
  vi.mocked(getLatestVersion).mockReturnValue(null);
  vi.mocked(getCliVersion).mockReturnValue("0.9.0");
  vi.mocked(getLatestCliVersion).mockReturnValue(null);
  vi.mocked(readJson).mockReturnValue(null);
  vi.mocked(detectPluginScope).mockReturnValue("user");
  vi.mocked(isPluginDisabled).mockReturnValue(false);
  vi.mocked(getExistingRules).mockReturnValue([]);
  vi.mocked(isAgyPluginInstalled).mockReturnValue(false);
  vi.mocked(readDevinInstallState).mockReturnValue({ kind: "none" });
});

describe("collectVersions", () => {
  it("reports current, latest and whether an update is available", () => {
    vi.mocked(getInstalledVersion).mockReturnValue("0.12.0");
    vi.mocked(getLatestVersion).mockReturnValue("0.12.1");

    expect(collectVersions()).toEqual({
      plugin: { current: "0.12.0", latest: "0.12.1", updateAvailable: true },
      cli: { current: "0.9.0", latest: null, updateAvailable: null },
    });
  });
});

describe("collectPlugin", () => {
  it("returns plugin state as data", () => {
    vi.mocked(detectPluginScope).mockReturnValue("project");
    vi.mocked(isPluginDisabled).mockReturnValue(true);
    vi.mocked(getExistingRules).mockReturnValue(["a", "b"]);
    vi.mocked(isAgyPluginInstalled).mockReturnValue(true);
    vi.mocked(isAgyPluginEnabled).mockReturnValue(true);
    vi.mocked(readAgyPluginVersion).mockReturnValue("0.46.0");
    vi.mocked(readJson).mockImplementation((p: string) =>
      p === "/mock/.coding-friend/dev-state.json" ? { localPath: "/x" } : null,
    );

    expect(collectPlugin()).toEqual({
      scope: "project",
      enabled: false,
      autoUpdate: false,
      devMode: true,
      permissionRules: 2,
      antigravity: { version: "0.46.0", enabled: true, dir: "/mock/agy" },
      devin: { kind: "none" },
    });
  });

  it("reports auto-update as unknown when settings cannot be read", () => {
    vi.mocked(readJson).mockImplementation((p: string) => {
      if (p === "/mock/.claude/settings.json") throw new Error("bad json");
      return null;
    });

    const plugin = collectPlugin();

    expect(plugin.autoUpdate).toBe("unknown");
    expect(plugin.antigravity).toBeNull();
  });
});

describe("collectMemory", () => {
  it("reports tier and daemon as null when cf-memory is not built", async () => {
    expect(await collectMemory()).toEqual({
      dir: "/mock/docs/memory",
      documents: 0,
      tier: null,
      daemon: null,
    });
  });
});

describe("collectMcp", () => {
  it("returns memory and learn health", async () => {
    const mcp = await collectMcp();

    expect(mcp?.memory.checks[0].label).toBe("Registered (user scope)");
    expect(mcp?.learn.checks[0].label).toBe("Registered (claude mcp)");
  });

  it("returns null when health wiring throws", async () => {
    vi.mocked(resolvePath).mockImplementation(() => {
      throw new Error("boom");
    });

    expect(await collectMcp()).toBeNull();
  });
});

describe("collectConfig", () => {
  it("returns sanitized global and local config with their paths", () => {
    vi.mocked(readJson).mockImplementation((p: string) =>
      p === "/mock/.coding-friend/config.json" ? { language: "en" } : null,
    );

    expect(collectConfig()).toEqual({
      global: {
        path: "/mock/.coding-friend/config.json",
        config: { language: "en" },
      },
      local: null,
    });
  });
});

describe("collectStatus", () => {
  it("combines every section", async () => {
    const status = await collectStatus();

    expect(Object.keys(status)).toEqual([
      "versions",
      "plugin",
      "memory",
      "mcp",
      "config",
    ]);
  });
});
