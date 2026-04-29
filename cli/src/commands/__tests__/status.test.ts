import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
  };
});

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(),
  commandExists: vi.fn(),
}));

vi.mock("../../lib/statusline.js", () => ({
  getInstalledVersion: vi.fn(),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  claudeSettingsPath: vi.fn(() => "/mock/.claude/settings.json"),
  globalConfigPath: vi.fn(() => "/mock/.coding-friend/config.json"),
  localConfigPath: vi.fn(() => "/mock/project/.coding-friend/config.json"),
  devStatePath: vi.fn(() => "/mock/.coding-friend/dev-state.json"),
  claudeProjectSettingsPath: vi.fn(() => "/mock/project/.claude/settings.json"),
  claudeLocalSettingsPath: vi.fn(
    () => "/mock/project/.claude/settings.local.json",
  ),
}));

vi.mock("../../lib/config.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/config.js")>();
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
    resolveMemoryDir: vi.fn(() => "/mock/docs/memory"),
  };
});

vi.mock("../../lib/plugin-state.js", () => ({
  isPluginInstalled: vi.fn(() => true),
  isPluginDisabled: vi.fn(() => false),
  detectPluginScope: vi.fn(() => "user"),
  settingsPathForScope: vi.fn(() => "/mock/.claude/settings.json"),
}));

vi.mock("../../lib/permissions.js", () => ({
  getExistingRules: vi.fn(() => []),
}));

vi.mock("../../lib/lib-path.js", () => ({
  getLibPath: vi.fn(() => "/mock/lib/cf-memory"),
}));

vi.mock("../update.js", () => ({
  getLatestVersion: vi.fn(),
  getCliVersion: vi.fn(() => "0.9.0"),
  getLatestCliVersion: vi.fn(() => null),
  semverCompare: (a: string, b: string): number => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────

import { getInstalledVersion } from "../../lib/statusline.js";
import { readJson } from "../../lib/json.js";
import { getExistingRules } from "../../lib/permissions.js";
import { isPluginDisabled, detectPluginScope } from "../../lib/plugin-state.js";
import {
  getLatestVersion,
  getCliVersion,
  getLatestCliVersion,
} from "../update.js";
import { statusCommand } from "../status.js";

const mockGetInstalledVersion = vi.mocked(getInstalledVersion);
const mockReadJson = vi.mocked(readJson);
const mockGetExistingRules = vi.mocked(getExistingRules);
const mockGetLatestVersion = vi.mocked(getLatestVersion);
const mockGetCliVersion = vi.mocked(getCliVersion);
const mockGetLatestCliVersion = vi.mocked(getLatestCliVersion);
const mockDetectPluginScope = vi.mocked(detectPluginScope);
const mockIsPluginDisabled = vi.mocked(isPluginDisabled);

function captureOutput(): string[] {
  const calls: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    calls.push(args.map(String).join(" "));
  });
  return calls;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Defaults
  mockGetInstalledVersion.mockReturnValue(null);
  mockGetLatestVersion.mockReturnValue(null);
  mockGetCliVersion.mockReturnValue("0.9.0");
  mockGetLatestCliVersion.mockReturnValue(null);
  mockReadJson.mockReturnValue(null);
  mockGetExistingRules.mockReturnValue([]);
  mockDetectPluginScope.mockReturnValue("user");
  mockIsPluginDisabled.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────

describe("statusCommand — versions section", () => {
  it("shows plugin and CLI versions when both are up to date", async () => {
    const output = captureOutput();
    mockGetInstalledVersion.mockReturnValue("0.12.1");
    mockGetLatestVersion.mockReturnValue("0.12.1");
    mockGetCliVersion.mockReturnValue("0.9.0");
    mockGetLatestCliVersion.mockReturnValue("0.9.0");

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("Versions");
    expect(joined).toContain("0.12.1");
    expect(joined).toContain("up to date");
    expect(joined).toContain("0.9.0");
  });

  it("shows update available when CLI is behind latest", async () => {
    const output = captureOutput();
    mockGetInstalledVersion.mockReturnValue("0.12.1");
    mockGetLatestVersion.mockReturnValue("0.12.1");
    mockGetCliVersion.mockReturnValue("0.9.0");
    mockGetLatestCliVersion.mockReturnValue("0.9.1");

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("update available");
    expect(joined).toContain("0.9.0");
    expect(joined).toContain("0.9.1");
  });

  it("shows not installed when plugin version is null", async () => {
    const output = captureOutput();
    mockGetInstalledVersion.mockReturnValue(null);

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("not installed");
  });

  it("shows unavailable when latest versions cannot be fetched", async () => {
    const output = captureOutput();
    mockGetInstalledVersion.mockReturnValue("0.12.1");
    mockGetLatestVersion.mockReturnValue(null);
    mockGetLatestCliVersion.mockReturnValue(null);

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("unavailable");
  });
});

describe("statusCommand — plugin section", () => {
  it("shows detected scope, enabled status, auto-update off, and dev mode off", async () => {
    const output = captureOutput();
    mockDetectPluginScope.mockReturnValue("project");
    mockIsPluginDisabled.mockReturnValue(false);

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("Scope");
    expect(joined).toContain("project");
    expect(joined).toContain("enabled");
    const autoLine = output.find((l) => l.includes("Auto-update"));
    expect(autoLine).toContain("off");
    const devLine = output.find((l) => l.includes("Dev mode"));
    expect(devLine).toContain("off");
  });

  it("shows disabled status when plugin is disabled at detected scope", async () => {
    const output = captureOutput();
    mockDetectPluginScope.mockReturnValue("local");
    mockIsPluginDisabled.mockReturnValue(true);

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("local");
    expect(joined).toContain("disabled");
  });

  it("shows dev mode on with auto-update on", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/dev-state.json") {
        return { localPath: "/some/path", savedAt: "2024-01-01" };
      }
      if (path === "/mock/.claude/settings.json") {
        return {
          extraKnownMarketplaces: {
            "coding-friend-marketplace": { autoUpdate: true },
          },
        };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    const devLine = output.find((l) => l.includes("Dev mode"));
    expect(devLine).toContain("on");
    const autoLine = output.find((l) => l.includes("Auto-update"));
    expect(autoLine).toContain("on");
  });

  it("shows permission rule count", async () => {
    const output = captureOutput();
    mockGetExistingRules.mockReturnValue([
      "Bash(cat *)",
      "Bash(grep *)",
      "Bash(git status *)",
    ]);

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("Permissions");
    expect(joined).toContain("3 rules");
  });
});

describe("statusCommand — memory section", () => {
  it("shows memory section with document count and unavailable tier", async () => {
    const output = captureOutput();

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("Memory");
    expect(joined).toContain("Tier");
    expect(joined).toContain("Daemon");
    expect(joined).toContain("Documents");
    expect(joined).toContain("cf memory status");
  });
});

describe("statusCommand — config section", () => {
  it("shows global config values", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return { language: "en", docsDir: "docs" };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("Config");
    expect(joined).toContain("global");
    expect(joined).toContain("language");
    expect(joined).toContain("en");
    expect(joined).toContain("docsDir");
    expect(joined).toContain("docs");
  });

  it("groups nested objects with indented sub-properties", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return {
          memory: { tier: "auto", autoCapture: true },
        };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    // Group header
    expect(joined).toContain("memory");
    // Indented sub-properties (4 spaces)
    const tierLine = output.find((l) => l.includes("tier"));
    expect(tierLine).toContain("auto");
    expect(tierLine).toMatch(/^\s{4}/);
    const captureLine = output.find((l) => l.includes("autoCapture"));
    expect(captureLine).toContain("true");
  });

  it("shows learn.categories as comma-separated names only", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return {
          learn: {
            categories: [
              { name: "AI", description: "Artificial Intelligence" },
              { name: "Tools", description: "Developer tools" },
            ],
          },
        };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    const catLine = output.find((l) => l.includes("categories"));
    expect(catLine).toContain("AI, Tools");
    expect(joined).not.toContain("Artificial Intelligence");
  });

  it("shows arrays of primitives as comma-separated", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return {
          statusline: { components: ["version", "folder", "model"] },
        };
      }
      return null;
    });

    await statusCommand();

    const compLine = output.find((l) => l.includes("components"));
    expect(compLine).toContain("version, folder, model");
  });

  it("shows local config with override indicator", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return { language: "en" };
      }
      if (path === "/mock/project/.coding-friend/config.json") {
        return { language: "vi" };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("vi");
    expect(joined).toContain("overrides global");
  });

  it("shows no config section when both config files are empty", async () => {
    const output = captureOutput();
    mockReadJson.mockReturnValue(null);

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).not.toContain("⚙️ Config");
  });

  it("strips unsupported memory.daemon field from config display", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return { memory: { daemon: { idleTimeout: 1800000 }, tier: "auto" } };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).not.toContain("daemon");
    expect(joined).not.toContain("idleTimeout");
    expect(joined).toContain("tier"); // valid field still shown
  });

  it("does not show override indicator for keys only in local config", async () => {
    const output = captureOutput();
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return { language: "en" };
      }
      if (path === "/mock/project/.coding-friend/config.json") {
        return { docsDir: "custom-docs" };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("custom-docs");
    expect(joined).not.toContain("overrides global");
  });
});

describe("statusCommand — plugin update available", () => {
  it("shows update available for plugin when behind latest", async () => {
    const output = captureOutput();
    mockGetInstalledVersion.mockReturnValue("0.12.0");
    mockGetLatestVersion.mockReturnValue("0.12.1");

    await statusCommand();

    const joined = output.join("\n");
    expect(joined).toContain("0.12.0");
    expect(joined).toContain("0.12.1");
    expect(joined).toContain("update available");
  });
});

describe("statusCommand — all sections rendered", () => {
  it("renders all four sections in order", async () => {
    const output = captureOutput();
    mockGetInstalledVersion.mockReturnValue("0.12.1");
    mockGetLatestVersion.mockReturnValue("0.12.1");
    mockGetCliVersion.mockReturnValue("0.9.0");
    mockGetLatestCliVersion.mockReturnValue("0.9.0");
    mockReadJson.mockImplementation((path: string) => {
      if (path === "/mock/.coding-friend/config.json") {
        return { language: "en" };
      }
      return null;
    });

    await statusCommand();

    const joined = output.join("\n");
    const versionsIdx = joined.indexOf("Versions");
    const pluginIdx = joined.indexOf("Plugin", versionsIdx + 1);
    const memoryIdx = joined.indexOf("Memory");
    const configIdx = joined.indexOf("Config");

    expect(versionsIdx).toBeGreaterThanOrEqual(0);
    expect(pluginIdx).toBeGreaterThan(versionsIdx);
    expect(memoryIdx).toBeGreaterThan(pluginIdx);
    expect(configIdx).toBeGreaterThan(memoryIdx);
  });
});
