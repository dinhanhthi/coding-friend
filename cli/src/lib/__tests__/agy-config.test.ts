import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isolated = vi.hoisted(() => ({
  home: "",
}));

vi.mock("../paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../paths.js")>();
  return {
    ...actual,
    devStatePath: () => join(isolated.home, ".coding-friend", "dev-state.json"),
    agySourceCloneDir: () => join(isolated.home, ".coding-friend", "agy-src"),
  };
});

vi.mock("../exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
  runWithStderr: vi.fn(),
}));

import { commandExists, run, runWithStderr } from "../exec.js";
import {
  deployAgyPlugin,
  isAgyPluginEnabled,
  isAgyPluginInstalled,
  readAgyMcpConfig,
  readAgyPluginVersion,
  removeAgyMcpEntry,
  removeAgyPlugin,
  resolveAgyPluginSource,
  setAgyPluginEnabled,
  validateAgyPlugin,
  writeAgyMcpEntry,
} from "../agy-config.js";
import {
  agyConfigJsonPath,
  agyConfigRoot,
  agyPluginDir,
  agySourceCloneDir,
  devStatePath,
  marketplaceClonePath,
} from "../paths.js";

const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockRunWithStderr = vi.mocked(runWithStderr);

const SOURCE_REPO = "https://github.com/dinhanhthi/coding-friend";
const MEMORY_SERVER = {
  command: "npx",
  args: ["-y", "coding-friend-cli", "mcp-serve", "/tmp/memory"],
};

const tmpDirs: string[] = [];

function makeTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writePluginTree(repoRoot: string, version = "1.2.3"): string {
  const pluginDir = join(repoRoot, "plugin-antigravity");
  mkdirSync(join(pluginDir, "hooks"), { recursive: true });
  writeFileSync(
    join(pluginDir, "plugin.json"),
    `${JSON.stringify({ name: "coding-friend", version }, null, 2)}\n`,
  );
  const script = join(pluginDir, "hooks", "session-init.sh");
  writeFileSync(script, "#!/bin/sh\necho ok\n");
  chmodSync(script, 0o755);
  writeFileSync(join(pluginDir, "notes.txt"), "keep\n");
  return pluginDir;
}

function isOwnerExecutable(path: string): boolean {
  return (statSync(path).mode & 0o100) !== 0;
}

function seedDevState(localPath: string): void {
  const file = devStatePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ localPath, savedAt: "2026-08-25T00:00:00.000Z" }, null, 2)}\n`,
  );
}

function seedMarketplacePlugin(): string {
  return writePluginTree(marketplaceClonePath());
}

function mockGitCloneTo(dest: string): void {
  mockRun.mockImplementation((cmd, args = []) => {
    if (cmd === "git" && args[0] === "clone") {
      writePluginTree(dest);
      mkdirSync(join(dest, ".git"), { recursive: true });
      return "Cloning into dest";
    }
    if (cmd === "git" && args[0] === "-C" && args[2] === "pull") {
      return "Already up to date.";
    }
    return "ok";
  });
}

beforeEach(() => {
  isolated.home = makeTemp("cf-agy-home-");
  vi.stubEnv("ANTIGRAVITY_HOME", makeTemp("cf-agy-gemini-"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", makeTemp("cf-agy-claude-"));
  mockCommandExists.mockReset();
  mockRun.mockReset();
  mockRunWithStderr.mockReset();
  mockCommandExists.mockReturnValue(true);
  mockRun.mockReturnValue("ok");
  mockRunWithStderr.mockReturnValue({
    stdout: "ok",
    stderr: "",
    exitCode: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveAgyPluginSource", () => {
  it("prefers cf dev localPath plugin-antigravity over marketplace and clone", () => {
    const devRepo = makeTemp("cf-agy-dev-");
    const pluginDir = writePluginTree(devRepo);
    seedDevState(devRepo);
    seedMarketplacePlugin();
    mockGitCloneTo(agySourceCloneDir());

    expect(resolveAgyPluginSource()).toEqual({ path: pluginDir, kind: "dev" });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("uses the marketplace clone when dev state is absent", () => {
    const pluginDir = seedMarketplacePlugin();
    mockGitCloneTo(agySourceCloneDir());

    expect(resolveAgyPluginSource()).toEqual({
      path: pluginDir,
      kind: "marketplace",
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("falls through to marketplace when localPath is set but plugin-antigravity is missing", () => {
    const emptyRepo = makeTemp("cf-agy-empty-dev-");
    mkdirSync(emptyRepo, { recursive: true });
    seedDevState(emptyRepo);
    const pluginDir = seedMarketplacePlugin();

    expect(resolveAgyPluginSource()).toEqual({
      path: pluginDir,
      kind: "marketplace",
    });
  });

  it("shallow-clones the GitHub repo into agySourceCloneDir when no local source exists", () => {
    const cloneDir = agySourceCloneDir();
    mockGitCloneTo(cloneDir);

    expect(resolveAgyPluginSource()).toEqual({
      path: join(cloneDir, "plugin-antigravity"),
      kind: "clone",
    });
    expect(mockCommandExists).toHaveBeenCalledWith("git");
    expect(mockRun).toHaveBeenCalledWith("git", [
      "clone",
      "--depth",
      "1",
      SOURCE_REPO,
      cloneDir,
    ]);
  });

  it("refreshes an existing clone with git pull --ff-only", () => {
    const cloneDir = agySourceCloneDir();
    writePluginTree(cloneDir);
    mkdirSync(join(cloneDir, ".git"), { recursive: true });
    mockGitCloneTo(cloneDir);

    expect(resolveAgyPluginSource()).toEqual({
      path: join(cloneDir, "plugin-antigravity"),
      kind: "clone",
    });
    expect(mockRun).toHaveBeenCalledWith("git", [
      "-C",
      cloneDir,
      "pull",
      "--ff-only",
    ]);
    expect(mockRun).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["clone"]),
    );
  });

  it("throws when git is missing and a clone is required", () => {
    mockCommandExists.mockReturnValue(false);

    expect(() => resolveAgyPluginSource()).toThrow(/git is not installed/);
  });

  it("throws when git clone fails", () => {
    mockRun.mockReturnValue(null);

    expect(() => resolveAgyPluginSource()).toThrow(/Failed to clone/);
  });
});

describe("deployAgyPlugin / removeAgyPlugin", () => {
  it("copies the plugin tree, preserves exec bit, and writes installed_version.json", () => {
    const source = writePluginTree(makeTemp("cf-agy-src-"));
    const scriptRel = join("hooks", "session-init.sh");
    expect(isOwnerExecutable(join(source, scriptRel))).toBe(true);

    const result = deployAgyPlugin(source);
    const target = agyPluginDir();

    expect(result.files).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(target, "plugin.json"))).toBe(true);
    expect(existsSync(join(target, "notes.txt"))).toBe(true);
    expect(isOwnerExecutable(join(target, scriptRel))).toBe(true);
    expect(isAgyPluginInstalled()).toBe(true);
    expect(readAgyPluginVersion()).toBe("1.2.3");

    const installed = JSON.parse(
      readFileSync(join(target, "installed_version.json"), "utf8"),
    ) as {
      version: string;
      installedAt: string;
      source: string;
    };
    expect(installed.version).toBe("1.2.3");
    expect(installed.source).toBe(source);
    expect(Number.isNaN(Date.parse(installed.installedAt))).toBe(false);
  });

  it("records unknown version when plugin.json has none", () => {
    const source = writePluginTree(makeTemp("cf-agy-src-"));
    writeFileSync(
      join(source, "plugin.json"),
      `${JSON.stringify({ name: "coding-friend" }, null, 2)}\n`,
    );

    deployAgyPlugin(source);

    expect(readAgyPluginVersion()).toBe("unknown");
  });

  it("removes the plugin directory and leaves ~/.gemini intact", () => {
    const source = writePluginTree(makeTemp("cf-agy-src-"));
    deployAgyPlugin(source);

    const root = agyConfigRoot();
    const sibling = join(root, "config", "plugins", "other-plugin");
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, "keep.json"), "{}\n");
    writeFileSync(join(root, "keep.txt"), "stay\n");

    removeAgyPlugin();

    expect(existsSync(agyPluginDir())).toBe(false);
    expect(isAgyPluginInstalled()).toBe(false);
    expect(existsSync(root)).toBe(true);
    expect(readFileSync(join(root, "keep.txt"), "utf8")).toBe("stay\n");
    expect(existsSync(join(sibling, "keep.json"))).toBe(true);
  });

  it("is a no-op when the plugin directory is already absent", () => {
    const root = agyConfigRoot();
    expect(existsSync(agyPluginDir())).toBe(false);

    expect(() => removeAgyPlugin()).not.toThrow();

    expect(existsSync(agyPluginDir())).toBe(false);
    expect(existsSync(root)).toBe(true);
  });
});

describe("setAgyPluginEnabled / isAgyPluginEnabled", () => {
  it("round-trips config.json without clobbering other keys", () => {
    const file = agyConfigJsonPath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          theme: "dark",
          plugins: {
            other: { enabled: true, extra: 1 },
            "coding-friend": { enabled: false, keep: "yes" },
          },
        },
        null,
        2,
      )}\n`,
    );

    expect(isAgyPluginEnabled()).toBe(false);

    setAgyPluginEnabled(true);
    expect(isAgyPluginEnabled()).toBe(true);

    setAgyPluginEnabled(false);
    expect(isAgyPluginEnabled()).toBe(false);

    const data = JSON.parse(readFileSync(file, "utf8")) as {
      theme: string;
      plugins: Record<string, Record<string, unknown>>;
    };
    expect(data.theme).toBe("dark");
    expect(data.plugins.other).toEqual({ enabled: true, extra: 1 });
    expect(data.plugins["coding-friend"]).toEqual({
      enabled: false,
      keep: "yes",
    });
  });

  it("creates config.json when the file is missing", () => {
    expect(existsSync(agyConfigJsonPath())).toBe(false);

    setAgyPluginEnabled(true);

    expect(isAgyPluginEnabled()).toBe(true);
    const data = JSON.parse(readFileSync(agyConfigJsonPath(), "utf8")) as {
      plugins: { "coding-friend": { enabled: boolean } };
    };
    expect(data.plugins["coding-friend"].enabled).toBe(true);
  });
});

describe("writeAgyMcpEntry / removeAgyMcpEntry", () => {
  it("creates mcp_config.json with mcpServers when missing", () => {
    writeAgyMcpEntry("coding-friend-memory", MEMORY_SERVER);

    expect(readAgyMcpConfig()).toEqual({
      mcpServers: { "coding-friend-memory": MEMORY_SERVER },
    });
  });

  it("preserves other servers already present", () => {
    writeAgyMcpEntry("alpha", { command: "alpha-bin" });
    writeAgyMcpEntry("beta", { command: "beta-bin", args: ["--ok"] });

    expect(readAgyMcpConfig()).toEqual({
      mcpServers: {
        alpha: { command: "alpha-bin" },
        beta: { command: "beta-bin", args: ["--ok"] },
      },
    });
  });

  it("is idempotent when writing the same server twice", () => {
    const file = join(agyPluginDir(), "mcp_config.json");
    writeAgyMcpEntry("coding-friend-memory", MEMORY_SERVER);
    const first = readFileSync(file, "utf8");
    writeAgyMcpEntry("coding-friend-memory", MEMORY_SERVER);

    expect(readFileSync(file, "utf8")).toBe(first);
  });

  it("removes a named server without touching siblings", () => {
    writeAgyMcpEntry("keep", { command: "keep-bin" });
    writeAgyMcpEntry("drop", { command: "drop-bin" });

    removeAgyMcpEntry("drop");

    expect(readAgyMcpConfig()).toEqual({
      mcpServers: { keep: { command: "keep-bin" } },
    });
  });

  it("is a no-op when removing a name that is not present", () => {
    writeAgyMcpEntry("keep", { command: "keep-bin" });
    const file = join(agyPluginDir(), "mcp_config.json");
    const before = readFileSync(file, "utf8");

    removeAgyMcpEntry("missing");

    expect(readFileSync(file, "utf8")).toBe(before);
    expect(existsSync(file)).toBe(true);
  });
});

describe("validateAgyPlugin", () => {
  it("returns status 127 when agy is missing", () => {
    mockCommandExists.mockReturnValue(false);

    expect(validateAgyPlugin("/plugin")).toEqual({ stdout: "", status: 127 });
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("runs agy plugin validate and joins stdout/stderr", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "ok",
      stderr: "warn",
      exitCode: 0,
    });

    expect(validateAgyPlugin("/plugin")).toEqual({
      stdout: "ok\nwarn",
      status: 0,
    });
    expect(mockRunWithStderr).toHaveBeenCalledWith("agy", [
      "plugin",
      "validate",
      "/plugin",
    ]);
  });
});
