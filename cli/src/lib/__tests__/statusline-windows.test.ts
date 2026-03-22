import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-statusline-win-test-${Date.now()}`);
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
      overrides.claudeSettings ?? join(testDir, "nonexistent", "settings.json"),
    installedPluginsPath: () =>
      overrides.installedPlugins ??
      join(testDir, "nonexistent", "installed_plugins.json"),
    resolvePath: (p: string) => p,
  }));
}

describe("statusline — path construction uses path.join", () => {
  it("findStatuslineHookPath uses path.join for hook path", async () => {
    const cacheDir = join(testDir, "cache");
    const hookDir = join(cacheDir, "0.5.0", "hooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "statusline.sh"), "#!/bin/bash\necho test");

    mockPaths({ pluginCache: cacheDir });
    const { findStatuslineHookPath } = await import("../statusline.js");
    const result = findStatuslineHookPath();

    expect(result).not.toBeNull();
    // Verify path uses OS-native separators (path.join behavior)
    const expected = join(cacheDir, "0.5.0", "hooks", "statusline.sh");
    expect(result!.hookPath).toBe(expected);
  });
});

describe("statusline — command normalizes backslashes", () => {
  it("writeStatuslineSettings normalizes backslashes in command", async () => {
    const settingsFile = join(testDir, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({}));

    mockPaths({ claudeSettings: settingsFile });
    const { writeStatuslineSettings } = await import("../statusline.js");

    // Simulate a Windows path with backslashes
    writeStatuslineSettings("C:\\Users\\alice\\.claude\\hooks\\statusline.sh");

    const { readJson } = await import("../json.js");
    const settings = readJson<Record<string, unknown>>(settingsFile);
    const sl = settings?.statusLine as { command?: string };
    // Should have forward slashes and quoted path for bash compatibility
    expect(sl.command).toBe(
      'bash "C:/Users/alice/.claude/hooks/statusline.sh"',
    );
    expect(sl.command).not.toContain("\\");
  });

  it("writeStatuslineSettings keeps forward slashes as-is", async () => {
    const settingsFile = join(testDir, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({}));

    mockPaths({ claudeSettings: settingsFile });
    const { writeStatuslineSettings } = await import("../statusline.js");

    writeStatuslineSettings("/Users/alice/.claude/hooks/statusline.sh");

    const { readJson } = await import("../json.js");
    const settings = readJson<Record<string, unknown>>(settingsFile);
    const sl = settings?.statusLine as { command?: string };
    expect(sl.command).toBe('bash "/Users/alice/.claude/hooks/statusline.sh"');
  });

  it("ensureStatusline normalizes backslashes in command", async () => {
    const cacheDir = join(testDir, "cache");
    const hookDir = join(cacheDir, "0.5.0", "hooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "statusline.sh"), "#!/bin/bash\necho test");

    const settingsFile = join(testDir, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({}));

    mockPaths({ pluginCache: cacheDir, claudeSettings: settingsFile });
    const { ensureStatusline } = await import("../statusline.js");
    ensureStatusline();

    const { readJson } = await import("../json.js");
    const settings = readJson<Record<string, unknown>>(settingsFile);
    const sl = settings?.statusLine as { command?: string };
    // Command should not contain backslashes
    expect(sl!.command).not.toContain("\\");
    expect(sl!.command).toContain("statusline.sh");
  });
});
