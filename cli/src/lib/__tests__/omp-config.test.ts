import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  convertClaudeAgentToOmp,
  deployOmpAgents,
  findOmpAgentSourceDir,
  isOmpAgentInstalled,
  readOmpMcpJson,
  removeOmpAgents,
  removeOmpExtensionEntry,
  removeOmpMcpEntry,
  setOmpAgentDisabled,
  setOmpAgentEnabled,
  writeOmpExtensionEntry,
  writeOmpMcpEntry,
} from "../omp-config.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(TEST_DIR, "fixtures", "omp");
const REPO_ROOT = resolve(TEST_DIR, "../../../..");
const PLUGIN_AGENTS = join(REPO_ROOT, "plugin", "agents");

const MEMORY_SERVER = {
  command: "npx",
  args: ["-y", "coding-friend-cli", "mcp-serve", "/tmp/memory"],
};

let originalCwd: string;
const tmpDirs: string[] = [];

function makeTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function mcpFile(): string {
  return join(makeTemp("cf-omp-mcp-"), "mcp.json");
}

function claudeAgentMd(
  frontmatter: Record<string, string>,
  body = "You are an agent.\n",
): string {
  const lines = Object.entries(frontmatter).map(
    ([key, value]) => `${key}: ${value}`,
  );
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

function stageAgentSource(): void {
  const repoRoot = makeTemp("cf-omp-repo-");
  const dest = join(repoRoot, "plugin", "agents");
  mkdirSync(dest, { recursive: true });
  for (const file of readdirSync(PLUGIN_AGENTS)) {
    if (!file.endsWith(".md")) continue;
    copyFileSync(join(PLUGIN_AGENTS, file), join(dest, file));
  }
  process.chdir(repoRoot);
}

function userAgentsDir(ompHome: string): string {
  return join(ompHome, "agent", "agents");
}

function userConfigPath(): string {
  return join(process.env.OMP_HOME!, "agent", "config.yml");
}

function seedUserConfig(content: string): string {
  const file = userConfigPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  return file;
}

function topLevelTaskCount(yml: string): number {
  return yml.split("\n").filter((line) => /^task:/.test(line)).length;
}

const USER_TASK_CONFIG = [
  "modelRoles:",
  "  default: spark/minimax-m3",
  "",
  "task:",
  "  # keep this comment",
  "  agentModelOverrides:",
  '    sonic: "@fast_worker"',
  "  maxRecursionDepth: 3",
  "  prewalk: true",
  "",
  "other:",
  "  keep: true",
  "",
].join("\n");

function cfAgentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^cf-.*\.md$/.test(name))
    .sort();
}

beforeEach(() => {
  originalCwd = process.cwd();
  const isolatedHome = makeTemp("cf-omp-home-");
  vi.stubEnv("OMP_HOME", isolatedHome);
  vi.stubEnv("CLAUDE_CONFIG_DIR", join(isolatedHome, "claude-config"));
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("convertClaudeAgentToOmp", () => {
  it("produces the committed OMP fixture for the sample Claude agent", () => {
    const source = readFileSync(
      join(FIXTURES, "sample-claude-agent.md"),
      "utf8",
    );
    const expected = readFileSync(
      join(FIXTURES, "expected-omp-agent.md"),
      "utf8",
    );
    const converted = convertClaudeAgentToOmp(source);

    expect(converted).toBe(expected);
    expect(converted).toContain("name: cf-explorer");
    expect(converted).toContain("model: haiku");
    expect(converted).toMatch(/^description: "/m);
    expect(converted).toContain("# Explorer Agent");
    expect(converted).not.toContain("tools:");
    expect(converted).not.toContain("created:");
    expect(converted).not.toContain("updated:");
  });

  it("throws when frontmatter name is missing", () => {
    expect(() =>
      convertClaudeAgentToOmp(
        claudeAgentMd({ description: "Explores a codebase" }),
      ),
    ).toThrow(/name or description/);
  });

  it("omits model when the source model is inherit", () => {
    const converted = convertClaudeAgentToOmp(
      claudeAgentMd({
        name: "sample",
        description: "A sample agent",
        model: "inherit",
      }),
    );

    expect(converted).toContain("name: sample");
    expect(converted).not.toMatch(/^model:/m);
    expect(converted).not.toContain("inherit");
  });

  it("does not emit a systemPrompt YAML key", () => {
    const source = readFileSync(
      join(FIXTURES, "sample-claude-agent.md"),
      "utf8",
    );
    const converted = convertClaudeAgentToOmp(source);
    const frontmatter = converted.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

    expect(frontmatter).not.toMatch(/^systemPrompt:/m);
    expect(converted).not.toContain("systemPrompt:");
  });
});

describe("writeOmpMcpEntry / removeOmpMcpEntry", () => {
  it("creates JSON with an mcpServers key when the file is missing", () => {
    const file = mcpFile();

    writeOmpMcpEntry("coding-friend-memory", MEMORY_SERVER, file);

    expect(readOmpMcpJson(file)).toEqual({
      mcpServers: { "coding-friend-memory": MEMORY_SERVER },
    });
  });

  it("creates JSON with an mcpServers key when the file is empty", () => {
    const file = mcpFile();
    writeFileSync(file, "", "utf8");

    writeOmpMcpEntry("coding-friend-memory", MEMORY_SERVER, file);

    expect(readOmpMcpJson(file)).toEqual({
      mcpServers: { "coding-friend-memory": MEMORY_SERVER },
    });
  });

  it("preserves other servers already present in the JSON", () => {
    const file = mcpFile();
    writeOmpMcpEntry("alpha", { command: "alpha-bin" }, file);

    writeOmpMcpEntry("beta", { command: "beta-bin", args: ["--ok"] }, file);

    expect(readOmpMcpJson(file)).toEqual({
      mcpServers: {
        alpha: { command: "alpha-bin" },
        beta: { command: "beta-bin", args: ["--ok"] },
      },
    });
  });

  it("is idempotent when writing the same server twice", () => {
    const file = mcpFile();

    writeOmpMcpEntry("coding-friend-memory", MEMORY_SERVER, file);
    const first = readFileSync(file, "utf8");
    writeOmpMcpEntry("coding-friend-memory", MEMORY_SERVER, file);

    expect(readFileSync(file, "utf8")).toBe(first);
  });

  it("is a no-op when removing a name that is not present", () => {
    const file = mcpFile();
    writeOmpMcpEntry("keep", { command: "keep-bin" }, file);
    const before = readFileSync(file, "utf8");

    removeOmpMcpEntry("missing", file);

    expect(readFileSync(file, "utf8")).toBe(before);
    expect(existsSync(file)).toBe(true);
  });
});

describe("deployOmpAgents / removeOmpAgents", () => {
  it("prints converted markdown on dryRun and does not write files", () => {
    const ompHome = process.env.OMP_HOME!;
    stageAgentSource();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = deployOmpAgents("user", { dryRun: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0]?.[0])).toContain("name: cf-explorer");
    expect(result.deployed).toEqual([]);
    expect(result.skipped).toHaveLength(12);
    expect(existsSync(userAgentsDir(ompHome))).toBe(false);
    expect(existsSync(join(ompHome, "agents", "coding-friend"))).toBe(false);
  });

  it("deploys 12 cf-*.md files under OMP_HOME/agent/agents", () => {
    const ompHome = process.env.OMP_HOME!;
    stageAgentSource();
    expect(findOmpAgentSourceDir()).not.toBeNull();

    const result = deployOmpAgents("user");
    const agentsDir = userAgentsDir(ompHome);
    const files = cfAgentFiles(agentsDir);

    expect(result.deployed).toHaveLength(12);
    expect(result.skipped).toEqual([]);
    expect(files).toHaveLength(12);
    expect(
      files.every((name) => name.startsWith("cf-") && name.endsWith(".md")),
    ).toBe(true);
    expect(existsSync(join(ompHome, "agents", "coding-friend"))).toBe(false);
    expect(readFileSync(join(agentsDir, "cf-explorer.md"), "utf8")).toContain(
      "name: cf-explorer",
    );
  });

  it("removes only cf-*.md and leaves a user-authored agent intact", () => {
    const ompHome = process.env.OMP_HOME!;
    stageAgentSource();
    deployOmpAgents("user");

    const agentsDir = userAgentsDir(ompHome);
    writeFileSync(
      join(agentsDir, "my-agent.md"),
      "---\nname: my-agent\n---\n\nHi\n",
    );

    removeOmpAgents("user");

    expect(cfAgentFiles(agentsDir)).toEqual([]);
    expect(readFileSync(join(agentsDir, "my-agent.md"), "utf8")).toContain(
      "my-agent",
    );
  });

  it("reports installed after deploy and not after remove", () => {
    stageAgentSource();
    expect(isOmpAgentInstalled("user")).toBe(false);

    deployOmpAgents("user");
    expect(isOmpAgentInstalled("user")).toBe(true);

    removeOmpAgents("user");
    expect(isOmpAgentInstalled("user")).toBe(false);
  });

  it("deploys project-scope agents under cwd/.omp/agents", () => {
    const ompHome = process.env.OMP_HOME!;
    stageAgentSource();

    const result = deployOmpAgents("project");
    const agentsDir = join(process.cwd(), ".omp", "agents");

    expect(result.deployed).toHaveLength(12);
    expect(cfAgentFiles(agentsDir)).toHaveLength(12);
    expect(existsSync(userAgentsDir(ompHome))).toBe(false);
  });
});

describe("setOmpAgentDisabled / setOmpAgentEnabled", () => {
  it("inserts disabledAgents under an existing task mapping and restores it on enable", () => {
    const file = seedUserConfig(USER_TASK_CONFIG);

    setOmpAgentDisabled("user");
    const disabled = readFileSync(file, "utf8");

    expect(topLevelTaskCount(disabled)).toBe(1);
    expect(disabled).toContain("agentModelOverrides:");
    expect(disabled).toContain('sonic: "@fast_worker"');
    expect(disabled).toContain("maxRecursionDepth: 3");
    expect(disabled).toContain("prewalk: true");
    expect(disabled).toContain("# keep this comment");
    expect(disabled).toContain("modelRoles:");
    expect(disabled).toContain("other:");
    expect(disabled).toContain("keep: true");
    expect(disabled).toMatch(/disabledAgents:\s*\[.*cf-explorer/);
    expect(disabled).toContain("# coding-friend-managed");
    expect(disabled).toContain("# end coding-friend-managed");

    setOmpAgentEnabled("user");
    const enabled = readFileSync(file, "utf8");

    expect(topLevelTaskCount(enabled)).toBe(1);
    expect(enabled).toContain("agentModelOverrides:");
    expect(enabled).toContain('sonic: "@fast_worker"');
    expect(enabled).toContain("maxRecursionDepth: 3");
    expect(enabled).toContain("prewalk: true");
    expect(enabled).toContain("# keep this comment");
    expect(enabled).toContain("other:");
    expect(enabled).not.toContain("disabledAgents");
    expect(enabled).not.toContain("coding-friend-managed");
  });

  it("creates config.yml when disabling and the file is missing", () => {
    const file = userConfigPath();
    expect(existsSync(file)).toBe(false);

    setOmpAgentDisabled("user");

    expect(existsSync(file)).toBe(true);
    const yml = readFileSync(file, "utf8");
    expect(topLevelTaskCount(yml)).toBe(1);
    expect(yml).toMatch(/disabledAgents:\s*\[.*cf-explorer/);
    expect(yml).toContain("# coding-friend-managed");
  });

  it("is a no-op when enabling and the file is missing", () => {
    const file = userConfigPath();
    expect(existsSync(file)).toBe(false);

    setOmpAgentEnabled("user");

    expect(existsSync(file)).toBe(false);
  });

  it("returns false when enabling and config.yml is missing", () => {
    expect(existsSync(userConfigPath())).toBe(false);
    expect(setOmpAgentEnabled("user")).toBe(false);
  });

  it("returns true when enable writes a disable-list change", () => {
    seedUserConfig(USER_TASK_CONFIG);
    setOmpAgentDisabled("user");

    expect(setOmpAgentEnabled("user")).toBe(true);
  });

  it("does not emit a second task key when a managed block already exists", () => {
    const file = seedUserConfig(USER_TASK_CONFIG);

    setOmpAgentDisabled("user");
    setOmpAgentDisabled("user");
    const yml = readFileSync(file, "utf8");

    expect(topLevelTaskCount(yml)).toBe(1);
    expect(yml.split("# coding-friend-managed").length - 1).toBe(1);
    expect(yml).toContain("maxRecursionDepth: 3");
  });

  it("collapses duplicate managed markers onto the existing task mapping", () => {
    const file = seedUserConfig(
      [
        "task:",
        "  maxRecursionDepth: 3",
        "",
        "# coding-friend-managed",
        "task:",
        "  disabledAgents: [cf-explorer]",
        "# end coding-friend-managed",
        "",
        "# coding-friend-managed",
        "task:",
        "  disabledAgents: [cf-explorer]",
        "# end coding-friend-managed",
        "",
      ].join("\n"),
    );

    setOmpAgentDisabled("user");
    const yml = readFileSync(file, "utf8");

    expect(topLevelTaskCount(yml)).toBe(1);
    expect(yml.split("# coding-friend-managed").length - 1).toBe(1);
    expect(yml).toContain("maxRecursionDepth: 3");
    expect(yml).toMatch(/disabledAgents:\s*\[.*cf-explorer/);
  });

  it("unions existing disabledAgents on disable and keeps user names on enable", () => {
    const file = seedUserConfig(
      [
        "task:",
        "  disabledAgents: [scout, librarian]",
        "  maxRecursionDepth: 3",
        "",
      ].join("\n"),
    );

    setOmpAgentDisabled("user");
    const disabled = readFileSync(file, "utf8");

    expect(topLevelTaskCount(disabled)).toBe(1);
    expect(disabled).toContain("scout");
    expect(disabled).toContain("librarian");
    expect(disabled).toContain("cf-explorer");
    expect(disabled).toContain("maxRecursionDepth: 3");

    setOmpAgentEnabled("user");
    const enabled = readFileSync(file, "utf8");

    expect(topLevelTaskCount(enabled)).toBe(1);
    expect(enabled).toMatch(/disabledAgents:\s*\[[^\]]*scout/);
    expect(enabled).toContain("librarian");
    expect(enabled).not.toContain("cf-explorer");
    expect(enabled).toContain("maxRecursionDepth: 3");
    expect(enabled).not.toContain("coding-friend-managed");
  });
});

function stageOmpExtensionSource(): string {
  const repoRoot = makeTemp("cf-omp-ext-repo-");
  const destDir = join(repoRoot, "plugin", "omp");
  mkdirSync(destDir, { recursive: true });
  copyFileSync(
    join(REPO_ROOT, "plugin", "omp", "extension.ts"),
    join(destDir, "extension.ts"),
  );
  process.chdir(repoRoot);
  return join(process.cwd(), "plugin", "omp", "extension.ts");
}

function parseExtensionShim(shim: string): {
  pluginRoot: string;
  fromPath: string;
} {
  const pluginRoot = shim.match(/^\/\/ CODING_FRIEND_PLUGIN_ROOT=(.*)$/m)?.[1];
  const fromLiteral = shim.match(/export \{ default \} from (".*")/)?.[1];
  if (!pluginRoot || !fromLiteral) {
    throw new Error(`invalid extension shim:\n${shim}`);
  }
  return { pluginRoot, fromPath: JSON.parse(fromLiteral) as string };
}

describe("writeOmpExtensionEntry / removeOmpExtensionEntry", () => {
  it("round-trips the user-scope extension shim under OMP_HOME", () => {
    const extensionPath = stageOmpExtensionSource();
    const file = join(
      process.env.OMP_HOME!,
      "agent",
      "extensions",
      "coding-friend.ts",
    );

    writeOmpExtensionEntry("user");

    expect(existsSync(file)).toBe(true);
    const shim = readFileSync(file, "utf8");
    expect(shim).toContain("CODING_FRIEND_PLUGIN_ROOT=");
    expect(shim).toMatch(/export \{ default \} from /);

    const { pluginRoot, fromPath } = parseExtensionShim(shim);
    expect(fromPath).toBe(extensionPath);
    expect(existsSync(fromPath)).toBe(true);
    expect(pluginRoot).toBe(dirname(dirname(fromPath)));

    removeOmpExtensionEntry("user");
    expect(existsSync(file)).toBe(false);

    removeOmpExtensionEntry("user");
    expect(existsSync(file)).toBe(false);
  });

  it("writes the project-scope shim under cwd/.omp/extensions", () => {
    const extensionPath = stageOmpExtensionSource();
    const file = join(process.cwd(), ".omp", "extensions", "coding-friend.ts");

    writeOmpExtensionEntry("project");

    expect(existsSync(file)).toBe(true);
    const { pluginRoot, fromPath } = parseExtensionShim(
      readFileSync(file, "utf8"),
    );
    expect(fromPath).toBe(extensionPath);
    expect(existsSync(fromPath)).toBe(true);
    expect(pluginRoot).toBe(dirname(dirname(fromPath)));
  });

  it("does not write a shim when extension.ts is missing", () => {
    const repoRoot = makeTemp("cf-omp-no-ext-");
    process.chdir(repoRoot);
    const shim = join(
      process.env.OMP_HOME!,
      "agent",
      "extensions",
      "coding-friend.ts",
    );

    expect(() => writeOmpExtensionEntry("user", repoRoot)).toThrow(
      /omp extension not found/,
    );
    expect(existsSync(shim)).toBe(false);
  });
});
