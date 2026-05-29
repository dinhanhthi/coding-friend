import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { homedir } from "os";
import { resolve, join } from "path";
import {
  resolvePath,
  marketplaceCachePath,
  marketplaceClonePath,
  globalConfigDir,
  globalConfigPath,
  memoryDepsDir,
  encodeProjectPath,
  claudeProjectsDir,
  claudeSessionDir,
  claudeProjectSettingsPath,
  claudeSettingsPath,
  installedPluginsPath,
  pluginCachePath,
  knownMarketplacesPath,
} from "../paths.js";

// Ensure tests are not affected by CLAUDE_CONFIG_DIR set in the caller's shell
beforeEach(() => vi.stubEnv("CLAUDE_CONFIG_DIR", undefined as unknown as string));
afterEach(() => vi.unstubAllEnvs());

describe("resolvePath", () => {
  it("returns absolute paths unchanged", () => {
    expect(resolvePath("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("expands ~/ to the home directory", () => {
    expect(resolvePath("~/projects")).toBe(join(homedir(), "projects"));
  });

  it("expands ~/ with nested path", () => {
    expect(resolvePath("~/.claude/settings.json")).toBe(
      join(homedir(), ".claude", "settings.json"),
    );
  });

  it("resolves relative paths against cwd by default", () => {
    expect(resolvePath("foo/bar")).toBe(resolve(process.cwd(), "foo/bar"));
  });

  it("resolves relative paths against a provided base", () => {
    expect(resolvePath("bar", "/tmp/base")).toBe("/tmp/base/bar");
  });

  it("resolves . to the base directory", () => {
    expect(resolvePath(".", "/tmp/base")).toBe("/tmp/base");
  });

  it("resolves bare ~/ to the home directory", () => {
    expect(resolvePath("~/")).toBe(homedir());
  });
});

describe("resolvePath + encodeProjectPath integration", () => {
  it("tilde path encodes correctly after resolution", () => {
    const resolved = resolvePath("~/Downloads/test2");
    const encoded = encodeProjectPath(resolved);
    expect(encoded).toBe(
      join(homedir(), "Downloads", "test2").replace(/\//g, "-"),
    );
  });

  it("bare ~/ encodes to home directory, not literal tilde", () => {
    const resolved = resolvePath("~/");
    const encoded = encodeProjectPath(resolved);
    expect(encoded).not.toContain("~");
    expect(encoded).toBe(homedir().replace(/\//g, "-"));
  });
});

describe("marketplaceCachePath", () => {
  it("returns the marketplace cache directory under ~/.claude", () => {
    expect(marketplaceCachePath()).toBe(
      join(
        homedir(),
        ".claude",
        "plugins",
        "cache",
        "coding-friend-marketplace",
      ),
    );
  });
});

describe("marketplaceClonePath", () => {
  it("returns the marketplace clone directory under ~/.claude", () => {
    expect(marketplaceClonePath()).toBe(
      join(
        homedir(),
        ".claude",
        "plugins",
        "marketplaces",
        "coding-friend-marketplace",
      ),
    );
  });
});

describe("globalConfigDir", () => {
  it("returns ~/.coding-friend", () => {
    expect(globalConfigDir()).toBe(join(homedir(), ".coding-friend"));
  });
});

describe("memoryDepsDir", () => {
  it("returns ~/.coding-friend/memory", () => {
    expect(memoryDepsDir()).toBe(join(homedir(), ".coding-friend", "memory"));
  });
});

describe("encodeProjectPath", () => {
  it("converts absolute path by replacing / with -", () => {
    expect(encodeProjectPath("/Users/alice/git/foo")).toBe(
      "-Users-alice-git-foo",
    );
  });

  it("handles trailing slash", () => {
    expect(encodeProjectPath("/Users/thi/git/foo/")).toBe(
      "-Users-thi-git-foo-",
    );
  });

  it("handles single-level path", () => {
    expect(encodeProjectPath("/tmp")).toBe("-tmp");
  });
});

describe("claudeProjectsDir", () => {
  it("returns ~/.claude/projects/", () => {
    expect(claudeProjectsDir()).toBe(join(homedir(), ".claude", "projects"));
  });
});

describe("claudeSessionDir", () => {
  it("returns ~/.claude/projects/<encodedPath>", () => {
    expect(claudeSessionDir("-Users-alice-git-foo")).toBe(
      join(homedir(), ".claude", "projects", "-Users-alice-git-foo"),
    );
  });
});

describe("claudeProjectSettingsPath", () => {
  it("returns <cwd>/.claude/settings.json", () => {
    expect(claudeProjectSettingsPath()).toBe(
      resolve(process.cwd(), ".claude", "settings.json"),
    );
  });
});

describe("CLAUDE_CONFIG_DIR", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("unset: claudeSettingsPath uses ~/.claude (regression)", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", undefined as unknown as string);
    expect(claudeSettingsPath()).toBe(
      join(homedir(), ".claude", "settings.json"),
    );
  });

  it("absolute: claudeSettingsPath uses CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(claudeSettingsPath()).toBe(join("/tmp/cfg", "settings.json"));
  });

  it("tilde: claudeSettingsPath expands ~ in CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "~/cfg");
    expect(claudeSettingsPath()).toBe(
      join(homedir(), "cfg", "settings.json"),
    );
  });

  it("whitespace: claudeSettingsPath trims CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "  /tmp/cfg  ");
    expect(claudeSettingsPath()).toBe(join("/tmp/cfg", "settings.json"));
  });

  it("relative: claudeSettingsPath uses value verbatim (not resolved against cwd)", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "relcfg");
    expect(claudeSettingsPath()).toBe(join("relcfg", "settings.json"));
  });

  it("set: installedPluginsPath relocates under CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(installedPluginsPath()).toBe(
      join("/tmp/cfg", "plugins", "installed_plugins.json"),
    );
  });

  it("set: pluginCachePath relocates under CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(pluginCachePath()).toBe(
      join(
        "/tmp/cfg",
        "plugins",
        "cache",
        "coding-friend-marketplace",
        "coding-friend",
      ),
    );
  });

  it("set: knownMarketplacesPath relocates under CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(knownMarketplacesPath()).toBe(
      join("/tmp/cfg", "plugins", "known_marketplaces.json"),
    );
  });

  it("set: marketplaceCachePath relocates under CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(marketplaceCachePath()).toBe(
      join("/tmp/cfg", "plugins", "cache", "coding-friend-marketplace"),
    );
  });

  it("set: marketplaceClonePath relocates under CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(marketplaceClonePath()).toBe(
      join(
        "/tmp/cfg",
        "plugins",
        "marketplaces",
        "coding-friend-marketplace",
      ),
    );
  });

  it("set: claudeProjectsDir relocates under CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(claudeProjectsDir()).toBe(join("/tmp/cfg", "projects"));
  });

  it("set: globalConfigPath is NOT affected by CLAUDE_CONFIG_DIR", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/cfg");
    expect(globalConfigPath()).toBe(
      join(homedir(), ".coding-friend", "config.json"),
    );
  });
});
