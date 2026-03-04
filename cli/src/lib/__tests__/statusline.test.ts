import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  STATUSLINE_COMPONENTS,
  ALL_COMPONENT_IDS,
  type StatuslineComponent,
} from "../../types.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-statusline-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  vi.resetModules();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mockPaths(overrides: Partial<Record<string, string>> = {}) {
  vi.doMock("../../lib/paths.js", () => ({
    globalConfigPath: () =>
      overrides.globalConfig ?? join(testDir, "nonexistent", "config.json"),
    localConfigPath: () =>
      overrides.localConfig ?? join(testDir, "nonexistent", "local.json"),
    pluginCachePath: () => overrides.pluginCache ?? join(testDir, "cache"),
    claudeSettingsPath: () =>
      overrides.claudeSettings ??
      join(testDir, "nonexistent", "settings.json"),
    installedPluginsPath: () =>
      overrides.installedPlugins ??
      join(testDir, "nonexistent", "installed_plugins.json"),
    resolvePath: (p: string) => p,
  }));
}

describe("STATUSLINE_COMPONENTS", () => {
  it("has exactly 6 components", () => {
    expect(STATUSLINE_COMPONENTS).toHaveLength(6);
  });

  it("has the correct component IDs", () => {
    const ids = STATUSLINE_COMPONENTS.map((c) => c.id);
    expect(ids).toEqual([
      "version",
      "folder",
      "model",
      "branch",
      "context",
      "usage",
    ]);
  });

  it("each component has a non-empty label", () => {
    for (const c of STATUSLINE_COMPONENTS) {
      expect(c.label).toBeTruthy();
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});

describe("ALL_COMPONENT_IDS", () => {
  it("matches STATUSLINE_COMPONENTS ids", () => {
    expect(ALL_COMPONENT_IDS).toEqual(STATUSLINE_COMPONENTS.map((c) => c.id));
  });
});

describe("loadStatuslineComponents", () => {
  it("returns all components when no config exists", async () => {
    mockPaths();
    const { loadStatuslineComponents } = await import("../statusline.js");
    expect(loadStatuslineComponents()).toEqual(ALL_COMPONENT_IDS);
  });

  it("returns configured components from config", async () => {
    const configFile = join(testDir, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        statusline: { components: ["version", "model"] },
      }),
    );

    mockPaths({ globalConfig: configFile });
    const { loadStatuslineComponents } = await import("../statusline.js");
    expect(loadStatuslineComponents()).toEqual(["version", "model"]);
  });

  it("returns all components when config has no statusline key", async () => {
    const configFile = join(testDir, "config.json");
    writeFileSync(configFile, JSON.stringify({ language: "en" }));

    mockPaths({ globalConfig: configFile });
    const { loadStatuslineComponents } = await import("../statusline.js");
    expect(loadStatuslineComponents()).toEqual(ALL_COMPONENT_IDS);
  });

  it("returns empty array when components is empty", async () => {
    const configFile = join(testDir, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({ statusline: { components: [] } }),
    );

    mockPaths({ globalConfig: configFile });
    const { loadStatuslineComponents } = await import("../statusline.js");
    expect(loadStatuslineComponents()).toEqual([]);
  });

  it("filters out invalid component IDs", async () => {
    const configFile = join(testDir, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        statusline: { components: ["version", "typo", "model", "invalid"] },
      }),
    );

    mockPaths({ globalConfig: configFile });
    const { loadStatuslineComponents } = await import("../statusline.js");
    expect(loadStatuslineComponents()).toEqual(["version", "model"]);
  });
});

describe("saveStatuslineConfig", () => {
  it("writes components to global config", async () => {
    const configFile = join(testDir, "config.json");

    mockPaths({ globalConfig: configFile });
    const { saveStatuslineConfig } = await import("../statusline.js");
    const components: StatuslineComponent[] = ["version", "branch", "context"];
    saveStatuslineConfig(components);

    const { readJson } = await import("../json.js");
    const config = readJson<{ statusline: { components: string[] } }>(
      configFile,
    );
    expect(config?.statusline.components).toEqual([
      "version",
      "branch",
      "context",
    ]);
  });

  it("preserves other config keys when saving", async () => {
    const configFile = join(testDir, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({ language: "vi", learn: { outputDir: "docs/learn" } }),
    );

    mockPaths({ globalConfig: configFile });
    const { saveStatuslineConfig } = await import("../statusline.js");
    saveStatuslineConfig(["model"]);

    const { readJson } = await import("../json.js");
    const config = readJson<Record<string, unknown>>(configFile);
    expect(config?.language).toBe("vi");
    expect(config?.statusline).toEqual({ components: ["model"] });
  });
});

describe("findStatuslineHookPath", () => {
  it("returns null when cache dir does not exist", async () => {
    mockPaths({ pluginCache: join(testDir, "nonexistent-cache") });
    const { findStatuslineHookPath } = await import("../statusline.js");
    expect(findStatuslineHookPath()).toBeNull();
  });

  it("returns null when cache dir is empty", async () => {
    const cacheDir = join(testDir, "cache");
    mkdirSync(cacheDir, { recursive: true });

    mockPaths({ pluginCache: cacheDir });
    const { findStatuslineHookPath } = await import("../statusline.js");
    expect(findStatuslineHookPath()).toBeNull();
  });

  it("returns null when hook file does not exist in version dir", async () => {
    const cacheDir = join(testDir, "cache");
    mkdirSync(join(cacheDir, "0.3.0"), { recursive: true });

    mockPaths({ pluginCache: cacheDir });
    const { findStatuslineHookPath } = await import("../statusline.js");
    expect(findStatuslineHookPath()).toBeNull();
  });

  it("returns hook path and version when hook exists", async () => {
    const cacheDir = join(testDir, "cache");
    const hookDir = join(cacheDir, "0.3.0", "hooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "statusline.sh"), "#!/bin/bash\necho test");

    mockPaths({ pluginCache: cacheDir });
    const { findStatuslineHookPath } = await import("../statusline.js");
    const result = findStatuslineHookPath();
    expect(result).not.toBeNull();
    expect(result!.version).toBe("0.3.0");
    expect(result!.hookPath).toContain("statusline.sh");
  });

  it("picks the latest version when multiple exist and no installed info", async () => {
    const cacheDir = join(testDir, "cache");
    for (const v of ["0.1.0", "0.3.0", "0.2.0"]) {
      const hookDir = join(cacheDir, v, "hooks");
      mkdirSync(hookDir, { recursive: true });
      writeFileSync(join(hookDir, "statusline.sh"), "#!/bin/bash");
    }

    mockPaths({ pluginCache: cacheDir });
    const { findStatuslineHookPath } = await import("../statusline.js");
    const result = findStatuslineHookPath();
    expect(result!.version).toBe("0.3.0");
  });

  it("uses installed plugin version instead of latest directory", async () => {
    const cacheDir = join(testDir, "cache");
    // Cache has 0.3.0 (prod) and 0.2.0 (dev/installed)
    for (const v of ["0.2.0", "0.3.0"]) {
      const hookDir = join(cacheDir, v, "hooks");
      mkdirSync(hookDir, { recursive: true });
      writeFileSync(join(hookDir, "statusline.sh"), "#!/bin/bash");
    }

    // installed_plugins.json says 0.2.0 is active
    const installedFile = join(testDir, "installed_plugins.json");
    writeFileSync(
      installedFile,
      JSON.stringify({
        version: 2,
        plugins: {
          "coding-friend@coding-friend-marketplace": [
            {
              installPath: join(cacheDir, "0.2.0"),
              version: "0.2.0",
            },
          ],
        },
      }),
    );

    mockPaths({ pluginCache: cacheDir, installedPlugins: installedFile });
    const { findStatuslineHookPath } = await import("../statusline.js");
    const result = findStatuslineHookPath();
    expect(result!.version).toBe("0.2.0");
  });

  it("falls back to latest when installed version has no hook", async () => {
    const cacheDir = join(testDir, "cache");
    // 0.2.0 is installed but has no hook, 0.3.0 has a hook
    mkdirSync(join(cacheDir, "0.2.0"), { recursive: true });
    const hookDir = join(cacheDir, "0.3.0", "hooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "statusline.sh"), "#!/bin/bash");

    const installedFile = join(testDir, "installed_plugins.json");
    writeFileSync(
      installedFile,
      JSON.stringify({
        version: 2,
        plugins: {
          "coding-friend@coding-friend-marketplace": [
            {
              installPath: join(cacheDir, "0.2.0"),
              version: "0.2.0",
            },
          ],
        },
      }),
    );

    mockPaths({ pluginCache: cacheDir, installedPlugins: installedFile });
    const { findStatuslineHookPath } = await import("../statusline.js");
    const result = findStatuslineHookPath();
    expect(result!.version).toBe("0.3.0");
  });
});

describe("ensureStatusline", () => {
  it("writes statusline settings when hook exists", async () => {
    const cacheDir = join(testDir, "cache");
    const hookDir = join(cacheDir, "0.3.0", "hooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "statusline.sh"), "#!/bin/bash\necho test");

    const settingsFile = join(testDir, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({}));

    mockPaths({ pluginCache: cacheDir, claudeSettings: settingsFile });
    const { ensureStatusline } = await import("../statusline.js");
    const result = ensureStatusline();
    expect(result).toBe("0.3.0");

    const { readJson } = await import("../json.js");
    const settings = readJson<Record<string, unknown>>(settingsFile);
    const sl = settings?.statusLine as { command?: string };
    expect(sl.command).toContain("statusline.sh");
    expect(sl.command).toContain("0.3.0");
  });

  it("returns null when no hook exists", async () => {
    mockPaths({ pluginCache: join(testDir, "nonexistent-cache") });
    const { ensureStatusline } = await import("../statusline.js");
    expect(ensureStatusline()).toBeNull();
  });

  it("skips update when settings already point to latest version", async () => {
    const cacheDir = join(testDir, "cache");
    const hookDir = join(cacheDir, "0.3.0", "hooks");
    mkdirSync(hookDir, { recursive: true });
    const hookPath = join(hookDir, "statusline.sh");
    writeFileSync(hookPath, "#!/bin/bash\necho test");

    const settingsFile = join(testDir, "settings.json");
    writeFileSync(
      settingsFile,
      JSON.stringify({
        statusLine: { type: "command", command: `bash ${hookPath}` },
      }),
    );

    mockPaths({ pluginCache: cacheDir, claudeSettings: settingsFile });
    const { ensureStatusline } = await import("../statusline.js");
    expect(ensureStatusline()).toBeNull();
  });
});

describe("isStatuslineConfigured", () => {
  it("returns false when no settings file exists", async () => {
    mockPaths();
    const { isStatuslineConfigured } = await import("../statusline.js");
    expect(isStatuslineConfigured()).toBe(false);
  });

  it("returns true when statusLine command is configured", async () => {
    const settingsFile = join(testDir, "settings.json");
    writeFileSync(
      settingsFile,
      JSON.stringify({
        statusLine: { type: "command", command: "bash /path/to/hook.sh" },
      }),
    );

    mockPaths({ claudeSettings: settingsFile });
    const { isStatuslineConfigured } = await import("../statusline.js");
    expect(isStatuslineConfigured()).toBe(true);
  });
});
