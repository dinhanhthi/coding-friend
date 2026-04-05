import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../../lib/paths.js", () => ({
  pluginCachePath: vi.fn(),
  devStatePath: vi.fn(),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(),
}));

vi.mock("../../lib/log.js", () => ({
  log: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
    dim: vi.fn(),
    warn: vi.fn(),
  },
  printBanner: vi.fn(),
}));

import { pluginCachePath, devStatePath } from "../../lib/paths.js";
import { readJson } from "../../lib/json.js";
import { log } from "../../lib/log.js";
import { guideCreateCommand, guideListCommand } from "../guide.js";

const mockPluginCachePath = vi.mocked(pluginCachePath);
const mockDevStatePath = vi.mocked(devStatePath);
const mockReadJson = vi.mocked(readJson);

let testDir: string;
let origCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "cf-guide-test-"));
  origCwd = process.cwd();
  process.chdir(testDir);
  vi.clearAllMocks();
});

afterEach(() => {
  process.chdir(origCwd);
});

describe("guideCreateCommand", () => {
  it("creates custom guide scaffold when skill exists (dev mode)", () => {
    // Setup: dev mode with local plugin path
    const pluginDir = join(testDir, "plugin");
    mkdirSync(join(pluginDir, "skills", "cf-fix"), { recursive: true });
    writeFileSync(join(pluginDir, "skills", "cf-fix", "SKILL.md"), "# cf-fix");

    mockDevStatePath.mockReturnValue(join(testDir, "dev-state.json"));
    mockReadJson.mockReturnValue({ localPath: testDir });

    guideCreateCommand("cf-fix");

    const guidePath = join(
      testDir,
      ".coding-friend",
      "skills",
      "cf-fix-custom",
      "SKILL.md",
    );
    expect(existsSync(guidePath)).toBe(true);

    const content = readFileSync(guidePath, "utf-8");
    expect(content).toContain("## Before");
    expect(content).toContain("## Rules");
    expect(content).toContain("## After");
  });

  it("creates custom guide scaffold when skill exists (installed mode)", () => {
    // Setup: no dev mode, use plugin cache
    const cacheDir = join(testDir, "cache");
    mkdirSync(join(cacheDir, "1.0.0", "plugin", "skills", "cf-plan"), {
      recursive: true,
    });
    writeFileSync(
      join(cacheDir, "1.0.0", "plugin", "skills", "cf-plan", "SKILL.md"),
      "# cf-plan",
    );

    mockDevStatePath.mockReturnValue(join(testDir, "no-dev-state.json"));
    mockReadJson.mockReturnValue(null);
    mockPluginCachePath.mockReturnValue(cacheDir);

    guideCreateCommand("cf-plan");

    const guidePath = join(
      testDir,
      ".coding-friend",
      "skills",
      "cf-plan-custom",
      "SKILL.md",
    );
    expect(existsSync(guidePath)).toBe(true);
  });

  it("errors when skill does not exist", () => {
    mockDevStatePath.mockReturnValue(join(testDir, "no-dev-state.json"));
    mockReadJson.mockReturnValue(null);
    mockPluginCachePath.mockReturnValue(join(testDir, "empty-cache"));

    guideCreateCommand("cf-nonexistent");

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("cf-nonexistent"),
    );
  });

  it("rejects invalid skill name", () => {
    mockDevStatePath.mockReturnValue(join(testDir, "dev-state.json"));
    mockReadJson.mockReturnValue({ localPath: testDir });

    guideCreateCommand("../etc/passwd");

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid skill name"),
    );
  });

  it("picks latest version from cache with numeric sort", () => {
    const cacheDir = join(testDir, "cache");
    // Create two versions — 2.0.0 should be picked over 10.0.0 with naive sort
    for (const ver of ["2.0.0", "10.0.0"]) {
      mkdirSync(join(cacheDir, ver, "plugin", "skills", "cf-ask"), {
        recursive: true,
      });
      writeFileSync(
        join(cacheDir, ver, "plugin", "skills", "cf-ask", "SKILL.md"),
        `# ${ver}`,
      );
    }
    // Only 10.0.0 has cf-plan
    mkdirSync(join(cacheDir, "10.0.0", "plugin", "skills", "cf-plan"), {
      recursive: true,
    });
    writeFileSync(
      join(cacheDir, "10.0.0", "plugin", "skills", "cf-plan", "SKILL.md"),
      "# cf-plan",
    );

    mockDevStatePath.mockReturnValue(join(testDir, "no-dev-state.json"));
    mockReadJson.mockReturnValue(null);
    mockPluginCachePath.mockReturnValue(cacheDir);

    // cf-plan only exists in 10.0.0 — should be found if 10.0.0 is picked first
    guideCreateCommand("cf-plan");

    const guidePath = join(
      testDir,
      ".coding-friend",
      "skills",
      "cf-plan-custom",
      "SKILL.md",
    );
    expect(existsSync(guidePath)).toBe(true);
  });

  it("does not overwrite existing custom guide", () => {
    // Setup dev mode
    const pluginDir = join(testDir, "plugin");
    mkdirSync(join(pluginDir, "skills", "cf-fix"), { recursive: true });
    writeFileSync(join(pluginDir, "skills", "cf-fix", "SKILL.md"), "# cf-fix");

    mockDevStatePath.mockReturnValue(join(testDir, "dev-state.json"));
    mockReadJson.mockReturnValue({ localPath: testDir });

    // Pre-create the custom guide
    const guidePath = join(
      testDir,
      ".coding-friend",
      "skills",
      "cf-fix-custom",
      "SKILL.md",
    );
    mkdirSync(join(testDir, ".coding-friend", "skills", "cf-fix-custom"), {
      recursive: true,
    });
    writeFileSync(guidePath, "# My custom guide");

    guideCreateCommand("cf-fix");

    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("exists"));
    expect(readFileSync(guidePath, "utf-8")).toBe("# My custom guide");
  });
});

describe("guideListCommand", () => {
  it("lists existing custom guides", () => {
    // Setup: dev mode for skill existence check
    const pluginDir = join(testDir, "plugin");
    mkdirSync(join(pluginDir, "skills", "cf-fix"), { recursive: true });
    writeFileSync(join(pluginDir, "skills", "cf-fix", "SKILL.md"), "# cf-fix");

    mockDevStatePath.mockReturnValue(join(testDir, "dev-state.json"));
    mockReadJson.mockReturnValue({ localPath: testDir });

    // Create a custom guide
    const customDir = join(
      testDir,
      ".coding-friend",
      "skills",
      "cf-fix-custom",
    );
    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, "SKILL.md"), "# Custom");

    guideListCommand();

    expect(log.info).toHaveBeenCalledWith(expect.stringContaining("cf-fix"));
  });

  it("shows warning for orphaned custom guides", () => {
    // No dev mode, no plugin cache — skill won't be found
    mockDevStatePath.mockReturnValue(join(testDir, "no-dev-state.json"));
    mockReadJson.mockReturnValue(null);
    mockPluginCachePath.mockReturnValue(join(testDir, "empty-cache"));

    // Create a custom guide for a skill that doesn't exist
    const customDir = join(
      testDir,
      ".coding-friend",
      "skills",
      "cf-gone-custom",
    );
    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, "SKILL.md"), "# Orphaned");

    guideListCommand();

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("skill not found"),
    );
  });

  it("shows message when no custom guides exist", () => {
    mockDevStatePath.mockReturnValue(join(testDir, "no-dev-state.json"));
    mockReadJson.mockReturnValue(null);

    guideListCommand();

    expect(log.dim).toHaveBeenCalledWith(
      expect.stringContaining("No custom guides"),
    );
  });
});
