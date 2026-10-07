import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, existsSync: vi.fn(() => false) };
});

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(() => ""),
  runWithStderr: vi.fn(() => ({ stdout: "", stderr: "", exitCode: 0 })),
  streamExec: vi.fn(async () => 0),
  commandExists: vi.fn(() => true),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(() => null),
}));

vi.mock("../../lib/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/config.js")>();
  return {
    ...actual,
    resolveLearnDir: vi.fn(() => "/mock/learn"),
    resolveMemoryDir: vi.fn(() => "/mock/docs/memory"),
  };
});

vi.mock("../../lib/lib-path.js", () => ({
  getLibPath: vi.fn((name: string) => `/mock/lib/${name}`),
}));

vi.mock("../../lib/fs-utils.js", () => ({
  listMdFilesRecursive: vi.fn(() => ["a.md"]),
}));

vi.mock("../../lib/learn-prompts.js", () => ({
  isLearnMcpRegistered: vi.fn(() => true),
  registerLearnMcp: vi.fn(() => true),
}));

vi.mock("../../lib/memory-mcp-register.js", () => ({
  isMemoryMcpRegistered: vi.fn(() => true),
  registerMemoryMcp: vi.fn(() => true),
}));

vi.mock("../memory.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../memory.js")>();
  return { ...actual, ensureMemoryBuilt: vi.fn(() => true) };
});

vi.mock("../../lib/agy-config.js", () => ({
  isAgyPluginInstalled: vi.fn(() => false),
  readAgyMcpConfig: vi.fn(() => null),
}));

vi.mock("../../lib/devin-config.js", () => ({
  isDevinPluginInstalled: vi.fn(() => false),
  readDevinMcpConfig: vi.fn(() => null),
  claudeJsonHasMcpServer: vi.fn(() => false),
}));

import {
  claudeJsonHasMcpServer,
  isDevinPluginInstalled,
  readDevinMcpConfig,
} from "../../lib/devin-config.js";
import {
  detectMemoryMcpState,
  mcpCommand,
  printDevinMcpStatus,
  printHealthSection,
} from "../mcp.js";
import type { McpHealthResult } from "../../lib/mcp-health.js";
import chalk from "chalk";
import { existsSync } from "fs";
import { run, streamExec } from "../../lib/exec.js";
import { readJson } from "../../lib/json.js";
import {
  isLearnMcpRegistered,
  registerLearnMcp,
} from "../../lib/learn-prompts.js";
import {
  isMemoryMcpRegistered,
  registerMemoryMcp,
} from "../../lib/memory-mcp-register.js";
import { ensureMemoryBuilt } from "../memory.js";
import {
  isAgyPluginInstalled,
  readAgyMcpConfig,
} from "../../lib/agy-config.js";

const mockIsDevinPluginInstalled = vi.mocked(isDevinPluginInstalled);
const mockReadDevinMcpConfig = vi.mocked(readDevinMcpConfig);
const mockClaudeJsonHasMcpServer = vi.mocked(claudeJsonHasMcpServer);

beforeEach(() => {
  mockIsDevinPluginInstalled.mockReturnValue(false);
  mockReadDevinMcpConfig.mockReturnValue(null);
  mockClaudeJsonHasMcpServer.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── printHealthSection — Fix 5: per-check fix hints ─────────────────────────

describe("printHealthSection", () => {
  it("shows green ✓ for ok checks", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [{ label: "Config", ok: true }],
      ok: true,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("✓");
    expect(joined).toContain("Config");
  });

  it("shows red ✗ for hard fail checks", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [{ label: "Config", ok: false, detail: "missing entry" }],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("✗");
    expect(joined).toContain("missing entry");
  });

  it("shows per-check fix hint (→ ...) when check.fix is set and check fails", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        {
          label: "Config",
          ok: false,
          detail: "missing entry",
          fix: 'Run "cf memory mcp" to fix',
        },
      ],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("→");
    expect(joined).toContain('Run "cf memory mcp" to fix');
  });

  it("does NOT show fix hint for warn checks (only hard fails)", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        {
          label: "Daemon",
          ok: false,
          warn: true,
          detail: "stopped",
        },
      ],
      ok: true,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("⚠");
    expect(joined).not.toContain("→");
  });

  it("does NOT show fix hint when check.fix is not set", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        {
          label: "Package",
          ok: false,
          detail: "not built",
          // no fix field
        },
      ],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("✗");
    expect(joined).not.toContain("→");
  });

  it("shows multiple per-check fix hints when multiple checks fail", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        { label: "Config", ok: false, detail: "missing", fix: "Run cf mcp 1" },
        {
          label: "Package",
          ok: false,
          detail: "not built",
          fix: "Run cf mcp 2",
        },
      ],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("Run cf mcp 1");
    expect(joined).toContain("Run cf mcp 2");
  });
});

// ─── Part C: Stale detection ─────────────────────────────────────────────────

describe("detectMemoryMcpState", () => {
  it("returns 'none' when .mcp.json is null (file doesn't exist)", () => {
    const result = detectMemoryMcpState(null, () => false);
    expect(result.kind).toBe("none");
  });

  it("returns 'none' when mcpServers is empty", () => {
    const result = detectMemoryMcpState({ mcpServers: {} }, () => false);
    expect(result.kind).toBe("none");
  });

  it("returns 'none' when coding-friend-memory entry is absent", () => {
    const mcp = {
      mcpServers: {
        "other-server": { command: "node", args: ["other.js"] },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("none");
  });

  it("returns 'npx' when entry uses npx command", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "npx",
          args: ["-y", "coding-friend-cli", "mcp-serve", "/some/dir"],
        },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("npx");
  });

  it("returns 'stale' when command is node and path does not exist", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: ["/old/absolute/path/to/index.js", "/some/memory"],
        },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("stale");
    expect((result as Extract<typeof result, { path: string }>).path).toBe(
      "/old/absolute/path/to/index.js",
    );
  });

  it("returns 'legacy-valid' when command is node and path exists", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: ["/existing/path/index.js", "/some/memory"],
        },
      },
    };
    const result = detectMemoryMcpState(mcp, () => true);
    expect(result.kind).toBe("legacy-valid");
    expect((result as Extract<typeof result, { path: string }>).path).toBe(
      "/existing/path/index.js",
    );
  });

  it("passes the node path to the existence checker", () => {
    const checkedPaths: string[] = [];
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: ["/check/this/path.js", "/memory"],
        },
      },
    };
    detectMemoryMcpState(mcp, (p) => {
      checkedPaths.push(p);
      return true;
    });
    expect(checkedPaths).toContain("/check/this/path.js");
  });

  it("returns 'none' when coding-friend-memory has no command field", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": { args: ["/some/path"] },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("none");
  });
});

// ─── Devin MCP status ────────────────────────────────────────────────────────

describe("printDevinMcpStatus", () => {
  function captureOutput(): string[] {
    const calls: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      calls.push(args.map(String).join(" "));
    });
    return calls;
  }

  it("prints nothing when the Devin plugin is not installed", () => {
    const output = captureOutput();
    mockIsDevinPluginInstalled.mockReturnValue(false);

    printDevinMcpStatus();

    expect(output.join("\n")).not.toContain("Devin");
    expect(mockReadDevinMcpConfig).not.toHaveBeenCalled();
  });

  it("notes that coding-friend-memory ships inside the plugin", () => {
    const output = captureOutput();
    mockIsDevinPluginInstalled.mockReturnValue(true);

    printDevinMcpStatus();

    const joined = output.join("\n");
    expect(joined).toContain("Devin");
    expect(joined).toContain("coding-friend-memory");
    expect(joined).toContain("plugin");
  });

  it("reports a coding-friend-learn entry from mcp_config.json", () => {
    const output = captureOutput();
    mockIsDevinPluginInstalled.mockReturnValue(true);
    mockReadDevinMcpConfig.mockReturnValue({
      mcpServers: {
        "coding-friend-learn": {
          command: "npx",
          args: ["-y", "coding-friend-cli", "mcp-serve-learn", "/docs"],
        },
      },
    });

    printDevinMcpStatus();

    const joined = output.join("\n");
    expect(joined).toContain("coding-friend-learn");
    expect(joined).toContain("mcp_config.json");
    expect(joined).not.toContain("not registered");
  });

  it("reports a coding-friend-learn entry imported via ~/.claude.json", () => {
    const output = captureOutput();
    mockIsDevinPluginInstalled.mockReturnValue(true);
    mockClaudeJsonHasMcpServer.mockReturnValue(true);

    printDevinMcpStatus();

    const joined = output.join("\n");
    expect(joined).toContain("coding-friend-learn");
    expect(joined).toContain(".claude.json");
    expect(joined).not.toContain("not registered");
  });

  it("notes a stray coding-friend-memory entry without claiming precedence", () => {
    const output = captureOutput();
    mockIsDevinPluginInstalled.mockReturnValue(true);
    mockReadDevinMcpConfig.mockReturnValue({
      mcpServers: {
        "coding-friend-memory": {
          command: "npx",
          args: ["-y", "coding-friend-cli", "mcp-serve"],
        },
      },
    });

    printDevinMcpStatus();

    const joined = output.join("\n");
    expect(joined).toContain("also present in mcp_config.json");
    expect(joined).not.toContain("wins");
  });

  it("reports coding-friend-learn as not registered when absent everywhere", () => {
    const output = captureOutput();
    mockIsDevinPluginInstalled.mockReturnValue(true);

    printDevinMcpStatus();

    const joined = output.join("\n");
    expect(joined).toContain("coding-friend-learn");
    expect(joined).toContain("not registered");
  });
});

// ─── Characterization (locks pre-refactor human output; never edit) ──

function mockMcpScenario(): void {
  vi.mocked(existsSync).mockImplementation(
    (p) => !String(p).endsWith(".mcp.json"),
  );
  vi.mocked(readJson).mockReturnValue(null);
  vi.mocked(isLearnMcpRegistered).mockReturnValue(false);
  vi.mocked(registerLearnMcp).mockReturnValue(true);
  vi.mocked(isMemoryMcpRegistered).mockReturnValue(true);
  vi.mocked(registerMemoryMcp).mockReturnValue(true);
  vi.mocked(ensureMemoryBuilt).mockReturnValue(true);
  vi.mocked(isAgyPluginInstalled).mockReturnValue(true);
  vi.mocked(readAgyMcpConfig).mockReturnValue({
    mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
  });
  mockIsDevinPluginInstalled.mockReturnValue(true);
  mockClaudeJsonHasMcpServer.mockReturnValue(true);
}

describe("mcpCommand — human output characterization", () => {
  let savedLevel: typeof chalk.level;

  beforeEach(() => {
    savedLevel = chalk.level;
    chalk.level = 0;
    mockMcpScenario();
  });

  afterEach(() => {
    chalk.level = savedLevel;
  });

  it("prints learn setup, health, memory section, agy and devin status", async () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });

    await mcpCommand();

    expect(output.join("\n")).toMatchInlineSnapshot(`
      "┌──────────────────┐
      │   📚 Learn MCP   │
      └──────────────────┘
      ℹ Learn folder: /mock/learn

      Add this to your MCP client config (for non-Claude-Code clients):

      {
        "mcpServers": {
          "coding-friend-learn": {
            "command": "npx",
            "args": [
              "-y",
              "coding-friend-cli",
              "mcp-serve-learn",
              "/mock/learn"
            ]
          }
        }
      }

      See full docs: https://cf.dinhanhthi.com/#memory

      ✔ Added coding-friend-learn (user scope). Restart Claude Code to activate.

      ─── Health Check ───
        ✗ Registered (claude mcp): coding-friend-learn not registered
          → Run "cf mcp" to register
        ✓ Package built
        ✓ Docs directory

      coding-friend-memory: already registered (user scope)
        (If it points to an old path, run: claude mcp remove --scope user coding-friend-memory && cf mcp)


      ┌───────────────────┐
      │   🧠 Memory MCP   │
      └───────────────────┘
      ℹ Memory dir: /mock/docs/memory

      For non-Claude-Code MCP clients only (Claude Code is already set up via the user-scope registration above) — add this to that client's config:

      {
        "mcpServers": {
          "coding-friend-memory": {
            "command": "npx",
            "args": [
              "-y",
              "coding-friend-cli",
              "mcp-serve",
              "/mock/docs/memory"
            ]
          }
        }
      }

      Available tools & resources: https://cf.dinhanhthi.com/#memory

      Note: this explicit path is needed only for clients that can't set CLAUDE_PROJECT_DIR. Claude Code resolves the project automatically and needs no manual config.

      ─── Health Check ───
        ✓ Registered (user scope)
        ✓ Package built
        ⚠ Daemon: stopped (starts automatically on MCP connect)


      ┌─────────────────────┐
      │   Antigravity MCP   │
      └─────────────────────┘
      ℹ coding-friend-memory: registered in plugin mcp_config.json

      ┌───────────────┐
      │   Devin MCP   │
      └───────────────┘
      coding-friend-memory ships inside the Devin plugin (.mcp.json).
      ℹ coding-friend-learn: registered via ~/.claude.json (Devin imports it)"
    `);
  });
});

// ─── cf mcp --json ───────────────────────────────────────────────────

describe("mcpCommand --json", () => {
  let stdout: string[];
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockMcpScenario();
    vi.mocked(run).mockClear().mockReturnValue("");
    stdout = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  function envelope(): Record<string, unknown> {
    expect(stdout).toHaveLength(1);
    return JSON.parse(stdout[0]);
  }

  function learnRegistration(): string {
    const data = envelope().data as { learn: { registration: string } };
    stdout.length = 0;
    return data.learn.registration;
  }

  it("writes one envelope with learn, memory, agy and devin data", async () => {
    await mcpCommand({ json: true });

    const env = envelope();
    expect(env).toMatchObject({ contractVersion: 1, ok: true, error: null });
    expect(env.data).toEqual({
      learn: {
        dir: "/mock/learn",
        registration: "registered",
        health: expect.objectContaining({ ok: false }),
      },
      memory: {
        dir: "/mock/docs/memory",
        registration: "already",
        health: expect.objectContaining({ ok: true }),
      },
      agy: { installed: true, memoryRegistered: true },
      devin: {
        installed: true,
        memoryInMcpConfig: false,
        learn: "claude_json",
      },
    });
  });

  it("reports learn registration as already, failed or disabled", async () => {
    vi.mocked(isLearnMcpRegistered).mockReturnValue(true);
    await mcpCommand({ json: true });
    expect(learnRegistration()).toBe("already");

    vi.mocked(isLearnMcpRegistered).mockReturnValue(false);
    vi.mocked(registerLearnMcp).mockReturnValue(false);
    await mcpCommand({ json: true });
    expect(learnRegistration()).toBe("failed");

    vi.mocked(readJson).mockReturnValue({ learn: { disabled: true } });
    await mcpCommand({ json: true });
    expect(learnRegistration()).toBe("disabled");
  });

  it("returns memory.registration failed when the memory build fails", async () => {
    vi.mocked(ensureMemoryBuilt).mockReturnValue(false);

    await mcpCommand({ json: true });

    const env = envelope();
    expect(env.ok).toBe(true);
    expect((env.data as { memory: unknown }).memory).toEqual({
      dir: "/mock/docs/memory",
      registration: "failed",
      health: null,
      error: "MEMORY_BUILD_FAILED",
    });
    expect(vi.mocked(ensureMemoryBuilt)).toHaveBeenCalledWith(
      "/mock/lib/cf-memory",
      { exitOnError: false },
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("keeps child process output off stdout and never streams", async () => {
    // learn-mcp deps and dist missing → both npm steps run through `run`.
    vi.mocked(existsSync).mockImplementation(
      (p) => !/(\/learn-mcp\/(node_modules|dist)|\.mcp\.json)$/.test(String(p)),
    );
    vi.mocked(run).mockReturnValue("added 42 packages in 3s");

    await mcpCommand({ json: true });

    expect(vi.mocked(run)).toHaveBeenCalledTimes(2);
    expect(envelope().ok).toBe(true);
    expect(vi.mocked(streamExec)).not.toHaveBeenCalled();
  });

  it("returns a COMMAND_FAILED envelope when learn deps fail to install", async () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => !/(\/learn-mcp\/node_modules|\.mcp\.json)$/.test(String(p)),
    );
    vi.mocked(run).mockReturnValue(null);

    await mcpCommand({ json: true });

    expect(envelope()).toMatchObject({
      ok: false,
      data: null,
      error: { code: "COMMAND_FAILED" },
    });
    expect(process.exitCode).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("mcpCommand — human mode failure", () => {
  let savedLevel: typeof chalk.level;

  beforeEach(() => {
    savedLevel = chalk.level;
    chalk.level = 0;
  });

  afterEach(() => {
    chalk.level = savedLevel;
  });

  it("logs the error and exits 1 when the learn MCP build fails", async () => {
    mockMcpScenario();
    vi.mocked(existsSync).mockImplementation(
      (p) => !/(\/learn-mcp\/dist|\.mcp\.json)$/.test(String(p)),
    );
    vi.mocked(run).mockReturnValue(null);
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);

    await expect(mcpCommand()).rejects.toThrow("exit");

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(output.slice(-2)).toEqual([
      "→ Building MCP server...",
      "✖ Failed to build MCP server",
    ]);
  });
});
