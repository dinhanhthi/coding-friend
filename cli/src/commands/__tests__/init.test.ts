import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inquirer/prompts")>();
  return {
    ...actual,
    checkbox: vi.fn(),
    confirm: vi.fn(async () => {
      throw new Error("Claude wizard must not run for omp init");
    }),
    input: vi.fn(),
    select: vi.fn(),
  };
});

vi.mock("../../lib/codex-config.js", () => ({
  deployCodexAgents: vi.fn(),
  findCodexAgentSourceDir: vi.fn(),
  trustCodexProject: vi.fn(),
  writeCodexAgentLimits: vi.fn(),
  writeCodexMemoryMcpConfig: vi.fn(),
}));

vi.mock("../../lib/agy-config.js", () => ({
  isAgyPluginInstalled: vi.fn(() => false),
}));

vi.mock("../../lib/exec.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/exec.js")>();
  return {
    ...actual,
    run: vi.fn((cmd: string, args: string[] = []) => {
      if (cmd === "mkdir" && args.includes("-p")) {
        const dir = args[args.length - 1];
        if (dir) mkdirSync(dir, { recursive: true });
      }
      return null;
    }),
    commandExists: vi.fn(() => false),
  };
});

vi.mock("../../lib/permissions.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/permissions.js")>();
  return {
    ...actual,
    runDangerousRulesAudit: vi.fn(async () => undefined),
    afterAutoApproveEnabled: vi.fn(async () => undefined),
  };
});

vi.mock("../../lib/learn-prompts.js", () => ({
  registerLearnMcp: vi.fn(() => true),
  isLearnMcpRegistered: vi.fn(() => false),
  unregisterLearnMcp: vi.fn(() => true),
}));

vi.mock("../../lib/memory-mcp-register.js", () => ({
  registerMemoryMcp: vi.fn(() => true),
  isMemoryMcpRegistered: vi.fn(() => false),
  unregisterMemoryMcp: vi.fn(() => true),
}));

vi.mock("../../lib/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/paths.js")>();
  return {
    ...actual,
    globalConfigPath: () =>
      join(process.cwd(), ".coding-friend-global", "config.json"),
  };
});

import { confirm, input, select } from "@inquirer/prompts";
import { isAgyPluginInstalled } from "../../lib/agy-config.js";
import {
  deployCodexAgents,
  findCodexAgentSourceDir,
  trustCodexProject,
  writeCodexAgentLimits,
  writeCodexMemoryMcpConfig,
} from "../../lib/codex-config.js";
import { registerLearnMcp } from "../../lib/learn-prompts.js";
import { registerMemoryMcp } from "../../lib/memory-mcp-register.js";
import {
  afterAutoApproveEnabled,
  runDangerousRulesAudit,
} from "../../lib/permissions.js";
import { initCommand } from "../init.js";

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("initCommand — omp", () => {
  let testDir: string;
  let origCwd: string;
  let logs: string[];
  const tmpDirs: string[] = [];

  beforeEach(() => {
    origCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), "cf-init-omp-"));
    const ompHome = mkdtempSync(join(tmpdir(), "cf-init-omp-home-"));
    tmpDirs.push(testDir, ompHome);
    process.chdir(testDir);
    vi.stubEnv("OMP_HOME", ompHome);
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    process.chdir(origCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates .omp/mcp.json with empty mcpServers", async () => {
    await initCommand({ agent: "omp" });

    const mcpPath = join(testDir, ".omp", "mcp.json");
    expect(existsSync(mcpPath)).toBe(true);
    expect(readJsonFile(mcpPath)).toEqual({ mcpServers: {} });
  });

  it("creates .coding-friend/config.json when missing", async () => {
    await initCommand({ agent: "omp" });

    const configPath = join(testDir, ".coding-friend", "config.json");
    expect(existsSync(configPath)).toBe(true);
    expect(readJsonFile(configPath)).toEqual({});
  });

  it("does not clobber existing mcp servers", async () => {
    const mcpPath = join(testDir, ".omp", "mcp.json");
    mkdirSync(join(testDir, ".omp"), { recursive: true });
    writeFileSync(
      mcpPath,
      JSON.stringify(
        { mcpServers: { keep: { command: "keep-bin" } } },
        null,
        2,
      ) + "\n",
    );

    await initCommand({ agent: "omp" });

    expect(readJsonFile(mcpPath)).toEqual({
      mcpServers: { keep: { command: "keep-bin" } },
    });
  });

  it("does not clobber existing .coding-friend/config.json", async () => {
    const configPath = join(testDir, ".coding-friend", "config.json");
    mkdirSync(join(testDir, ".coding-friend"), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ tdd: true }, null, 2) + "\n");

    await initCommand({ agent: "omp" });

    expect(readJsonFile(configPath)).toEqual({ tdd: true });
  });

  it("does not call Codex init", async () => {
    await initCommand({ agent: "omp" });

    expect(deployCodexAgents).not.toHaveBeenCalled();
    expect(findCodexAgentSourceDir).not.toHaveBeenCalled();
    expect(trustCodexProject).not.toHaveBeenCalled();
    expect(writeCodexAgentLimits).not.toHaveBeenCalled();
    expect(writeCodexMemoryMcpConfig).not.toHaveBeenCalled();
    expect(existsSync(join(testDir, ".codex"))).toBe(false);
  });

  it("prints omp next steps including install when not installed", async () => {
    await initCommand({ agent: "omp" });

    const output = logs.join("\n");
    expect(output).toContain("cf install --agent omp");
    expect(output).toMatch(/[Rr]estart omp/);
  });
});

describe("initCommand — agy", () => {
  let testDir: string;
  let origCwd: string;
  let logs: string[];

  beforeEach(() => {
    origCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), "cf-init-agy-"));
    process.chdir(testDir);
    vi.stubEnv("ANTIGRAVITY_HOME", testDir);
    logs = [];
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    vi.mocked(isAgyPluginInstalled).mockReturnValue(true);
    vi.mocked(confirm).mockImplementation((async (opts: {
      message?: string;
      default?: boolean;
    }) => {
      const message = String(opts.message ?? "");
      if (message.includes("wizard")) return true;
      if (message.includes("auto-approve")) return true;
      if (message.includes("privacy")) return true;
      return Boolean(opts.default);
    }) as unknown as typeof confirm);
    vi.mocked(input).mockImplementation((async (opts: { default?: string }) =>
      String(opts.default ?? "docs")) as unknown as typeof input);
    vi.mocked(select).mockImplementation((async (opts: {
      message?: string;
      choices?: ReadonlyArray<{ value?: unknown } | string>;
    }) => {
      const message = String(opts.message ?? "");
      if (message.includes("Save to")) return "local";
      if (message.includes("gitignore")) return "none";
      if (message.includes("language") || message.includes("written in")) {
        return "en";
      }
      if (message.includes("learn folder")) return "default";
      if (message.includes("Categories")) return "defaults";
      if (message.includes("indexed")) return "none";
      if (message.includes("How to configure")) return "configure";
      const first = opts.choices?.find(
        (choice) =>
          choice &&
          typeof choice === "object" &&
          "value" in choice &&
          choice.value !== "__back__",
      );
      return first && typeof first === "object" && "value" in first
        ? first.value
        : "local";
    }) as unknown as typeof select);
  });

  afterEach(() => {
    process.chdir(origCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("runs the wizard and writes AGENTS.md plus agy config keys", async () => {
    await initCommand({ agent: "agy" });

    const agentsMd = readFileSync(join(testDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("/cf-plan");
    expect(agentsMd).not.toContain("$cf-plan");

    const localCfg = readJsonFile(
      join(testDir, ".coding-friend", "config.json"),
    ) as Record<string, unknown>;
    expect(localCfg.docsDir).toBe("docs");
    expect(localCfg.language).toBe("en");
    expect(localCfg.autoApprove).toBe(true);
    expect(localCfg.privacyBlock).toBe(true);

    expect(registerLearnMcp).toHaveBeenCalledWith(expect.any(String), "agy");
    expect(registerMemoryMcp).toHaveBeenCalledWith("agy");
  });

  it("warns and skips plugin MCP when agy is not installed", async () => {
    vi.mocked(isAgyPluginInstalled).mockReturnValue(false);

    await initCommand({ agent: "agy" });

    const output = logs.join("\n");
    expect(output).toContain("cf install --agent agy");
    expect(registerLearnMcp).not.toHaveBeenCalled();
    expect(registerMemoryMcp).not.toHaveBeenCalled();
  });

  it("does not run the Claude or Codex wizards", async () => {
    await initCommand({ agent: "agy" });

    expect(deployCodexAgents).not.toHaveBeenCalled();
    expect(writeCodexMemoryMcpConfig).not.toHaveBeenCalled();
    expect(existsSync(join(testDir, ".codex"))).toBe(false);
  });

  it("creates docs subfolders when global docsDir already matches the default", async () => {
    const globalDir = join(testDir, ".coding-friend-global");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "config.json"),
      JSON.stringify({ docsDir: "docs" }, null, 2) + "\n",
    );

    await initCommand({ agent: "agy" });

    expect(existsSync(join(testDir, "docs", "plans"))).toBe(true);
    expect(existsSync(join(testDir, "docs", "memory"))).toBe(true);
  });

  it("audits Claude dangerous rules when auto-approve is enabled", async () => {
    await initCommand({ agent: "agy" });

    expect(afterAutoApproveEnabled).toHaveBeenCalled();
  });

  it("does not audit dangerous rules when auto-approve is declined", async () => {
    vi.mocked(confirm).mockImplementation((async (opts: {
      message?: string;
      default?: boolean;
    }) => {
      const message = String(opts.message ?? "");
      if (message.includes("wizard")) return true;
      if (message.includes("auto-approve")) return false;
      if (message.includes("privacy")) return true;
      return Boolean(opts.default);
    }) as unknown as typeof confirm);

    await initCommand({ agent: "agy" });

    const localCfg = readJsonFile(
      join(testDir, ".coding-friend", "config.json"),
    ) as Record<string, unknown>;
    expect(localCfg.autoApprove).toBe(false);
    expect(afterAutoApproveEnabled).not.toHaveBeenCalled();
    expect(runDangerousRulesAudit).not.toHaveBeenCalled();
  });
});

describe("initCommand — codex", () => {
  let testDir: string;
  let origCwd: string;
  let logs: string[];

  beforeEach(() => {
    origCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), "cf-init-codex-"));
    process.chdir(testDir);
    logs = [];
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    vi.mocked(confirm).mockImplementation((async (opts: {
      message?: string;
      default?: boolean;
    }) => {
      const message = String(opts.message ?? "");
      if (message.includes("wizard")) return true;
      if (message.includes("auto-approve")) return true;
      if (message.includes("privacy")) return true;
      return Boolean(opts.default);
    }) as unknown as typeof confirm);
    vi.mocked(input).mockImplementation((async (opts: { default?: string }) =>
      String(opts.default ?? "docs")) as unknown as typeof input);
    vi.mocked(select).mockImplementation((async (opts: {
      message?: string;
      choices?: ReadonlyArray<{ value?: unknown } | string>;
    }) => {
      const message = String(opts.message ?? "");
      if (message.includes("Save to")) return "local";
      if (message.includes("gitignore")) return "none";
      if (message.includes("language") || message.includes("written in")) {
        return "en";
      }
      if (message.includes("learn folder")) return "default";
      if (message.includes("Categories")) return "defaults";
      if (message.includes("indexed")) return "none";
      if (message.includes("How to configure")) return "configure";
      const first = opts.choices?.find(
        (choice) =>
          choice &&
          typeof choice === "object" &&
          "value" in choice &&
          choice.value !== "__back__",
      );
      return first && typeof first === "object" && "value" in first
        ? first.value
        : "local";
    }) as unknown as typeof select);
  });

  afterEach(() => {
    process.chdir(origCwd);
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("runs the wizard and writes AGENTS.md plus shared config keys", async () => {
    await initCommand({ agent: "codex" });

    const agentsMd = readFileSync(join(testDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("$cf-plan");
    expect(agentsMd).not.toContain("/cf-plan");

    const localCfg = readJsonFile(
      join(testDir, ".coding-friend", "config.json"),
    ) as Record<string, unknown>;
    expect(localCfg.docsDir).toBe("docs");
    expect(localCfg.language).toBe("en");
    expect(localCfg.autoApprove).toBe(true);
    expect(localCfg.privacyBlock).toBe(true);

    expect(writeCodexMemoryMcpConfig).toHaveBeenCalled();
    expect(writeCodexAgentLimits).toHaveBeenCalled();
    expect(registerLearnMcp).not.toHaveBeenCalled();
    expect(registerMemoryMcp).not.toHaveBeenCalled();
    expect(afterAutoApproveEnabled).toHaveBeenCalled();
  });

  it("creates docs subfolders when global docsDir already matches the default", async () => {
    const globalDir = join(testDir, ".coding-friend-global");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "config.json"),
      JSON.stringify({ docsDir: "docs" }, null, 2) + "\n",
    );

    await initCommand({ agent: "codex" });

    expect(existsSync(join(testDir, "docs", "plans"))).toBe(true);
    expect(existsSync(join(testDir, "docs", "memory"))).toBe(true);
  });

  it("marks the project trusted when --trust-project is passed", async () => {
    await initCommand({ agent: "codex", trustProject: true });

    expect(trustCodexProject).toHaveBeenCalled();
    expect(String(vi.mocked(trustCodexProject).mock.calls[0]?.[0])).toContain(
      "cf-init-codex-",
    );
  });

  it("does not run the Antigravity or omp wizards", async () => {
    await initCommand({ agent: "codex" });

    expect(existsSync(join(testDir, ".omp"))).toBe(false);
    const output = logs.join("\n");
    expect(output).not.toContain("Antigravity setup");
  });
});
