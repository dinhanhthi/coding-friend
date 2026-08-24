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

vi.mock("@inquirer/prompts", () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(async () => {
    throw new Error("Claude wizard must not run for omp init");
  }),
  input: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../../lib/codex-config.js", () => ({
  deployCodexAgents: vi.fn(),
  findCodexAgentSourceDir: vi.fn(),
  trustCodexProject: vi.fn(),
  writeCodexAgentLimits: vi.fn(),
  writeCodexMemoryMcpConfig: vi.fn(),
}));

import {
  deployCodexAgents,
  findCodexAgentSourceDir,
  trustCodexProject,
  writeCodexAgentLimits,
  writeCodexMemoryMcpConfig,
} from "../../lib/codex-config.js";
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
