import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../memory-mcp-register.js", () => ({
  isMemoryMcpRegistered: vi.fn(),
  registerMemoryMcp: vi.fn(),
  unregisterMemoryMcp: vi.fn(),
}));

// Mock paths.js to allow controlling claudeConfigDir independently of process.cwd().
// globalConfigPath and localConfigPath are kept real via importActual.
let globalTestDir: string;
vi.mock("../paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../paths.js")>();
  return {
    ...actual,
    claudeConfigDir: () => globalTestDir,
  };
});

// We need to test writeMemoryMcpEntry, which calls writeJson and reads process.cwd()
// Use a real tmpdir as the cwd simulation by mocking process.cwd()

let testDir: string;
let originalCwd: () => string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-mcp-test-${Date.now()}`);
  globalTestDir = join(tmpdir(), `cf-mcp-global-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  mkdirSync(globalTestDir, { recursive: true });
  originalCwd = process.cwd;
  process.cwd = () => testDir;
});

afterEach(() => {
  process.cwd = originalCwd;
  rmSync(testDir, { recursive: true, force: true });
  rmSync(globalTestDir, { recursive: true, force: true });
});

describe("writeMemoryMcpEntry", () => {
  it("writes npx-based entry instead of absolute node path", async () => {
    const { writeMemoryMcpEntry } = await import("../memory-prompts.js");
    const memoryDir = "/some/project/docs/memory";

    writeMemoryMcpEntry(memoryDir);

    const mcpPath = join(testDir, ".mcp.json");
    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));

    expect(content.mcpServers["coding-friend-memory"]).toEqual({
      command: "npx",
      args: ["-y", "coding-friend-cli", "mcp-serve", memoryDir],
    });
  });

  it("does not require serverPath parameter", async () => {
    const { writeMemoryMcpEntry } = await import("../memory-prompts.js");
    const memoryDir = "/path/to/memory";

    // Should not throw (previously required serverPath as first argument)
    expect(() => writeMemoryMcpEntry(memoryDir)).not.toThrow();
  });

  it("merges with existing .mcp.json content", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          "other-server": { command: "node", args: ["other.js"] },
        },
      }),
      "utf-8",
    );

    const { writeMemoryMcpEntry } = await import("../memory-prompts.js");
    writeMemoryMcpEntry("/my/memory");

    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    // Existing server should still be there
    expect(content.mcpServers["other-server"]).toEqual({
      command: "node",
      args: ["other.js"],
    });
    // New entry should use npx
    expect(content.mcpServers["coding-friend-memory"].command).toBe("npx");
  });

  it("uses 'npx' not 'node' as command", async () => {
    const { writeMemoryMcpEntry } = await import("../memory-prompts.js");
    writeMemoryMcpEntry("/memory/dir");

    const content = JSON.parse(
      readFileSync(join(testDir, ".mcp.json"), "utf-8"),
    );
    expect(content.mcpServers["coding-friend-memory"].command).toBe("npx");
    expect(content.mcpServers["coding-friend-memory"].command).not.toBe("node");
  });

  it("includes -y flag and coding-friend-cli package in args", async () => {
    const { writeMemoryMcpEntry } = await import("../memory-prompts.js");
    const memoryDir = "/custom/memory";
    writeMemoryMcpEntry(memoryDir);

    const content = JSON.parse(
      readFileSync(join(testDir, ".mcp.json"), "utf-8"),
    );
    const args = content.mcpServers["coding-friend-memory"].args;
    expect(args[0]).toBe("-y");
    expect(args[1]).toBe("coding-friend-cli");
    expect(args[2]).toBe("mcp-serve");
    expect(args[3]).toBe(memoryDir);
  });
});

describe("editMemoryMcp", () => {
  it("calls registerMemoryMcp when not yet registered (first-time path)", async () => {
    const { isMemoryMcpRegistered, registerMemoryMcp } = await import(
      "../memory-mcp-register.js"
    );
    vi.mocked(isMemoryMcpRegistered).mockReturnValue(false);
    vi.mocked(registerMemoryMcp).mockReturnValue(true);

    const { editMemoryMcp } = await import("../memory-prompts.js");
    await editMemoryMcp();

    expect(registerMemoryMcp).toHaveBeenCalledOnce();
    // Must not write a project-scope .mcp.json
    expect(existsSync(join(testDir, ".mcp.json"))).toBe(false);
  });
});

describe("removeMemoryMcpEntry", () => {
  it("removes only coding-friend-memory when other servers remain, keeps file", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          "coding-friend-memory": { command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] },
          "other-server": { command: "node", args: ["other.js"] },
        },
      }),
      "utf-8",
    );

    const { removeMemoryMcpEntry } = await import("../memory-prompts.js");
    const result = removeMemoryMcpEntry();

    expect(result).toEqual({ removed: true, fileDeleted: false });
    expect(existsSync(mcpPath)).toBe(true);
    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(content.mcpServers["coding-friend-memory"]).toBeUndefined();
    expect(content.mcpServers["other-server"]).toEqual({ command: "node", args: ["other.js"] });
  });

  it("deletes .mcp.json when coding-friend-memory is the only server", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          "coding-friend-memory": { command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] },
        },
      }),
      "utf-8",
    );

    const { removeMemoryMcpEntry } = await import("../memory-prompts.js");
    const result = removeMemoryMcpEntry();

    expect(result).toEqual({ removed: true, fileDeleted: true });
    expect(existsSync(mcpPath)).toBe(false);
  });

  it("returns removed:false without throwing when .mcp.json does not exist", async () => {
    const { removeMemoryMcpEntry } = await import("../memory-prompts.js");
    const result = removeMemoryMcpEntry();

    expect(result).toEqual({ removed: false, fileDeleted: false });
  });

  it("returns removed:false and leaves file untouched when coding-friend-memory not present", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    const original = {
      mcpServers: {
        "other-server": { command: "node", args: ["other.js"] },
      },
    };
    writeFileSync(mcpPath, JSON.stringify(original), "utf-8");

    const { removeMemoryMcpEntry } = await import("../memory-prompts.js");
    const result = removeMemoryMcpEntry();

    expect(result).toEqual({ removed: false, fileDeleted: false });
    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(content).toEqual(original);
  });

  it("returns removed:false and does NOT throw when mcpServers is a non-object primitive", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    const original = { mcpServers: "legacy" };
    writeFileSync(mcpPath, JSON.stringify(original), "utf-8");

    const { removeMemoryMcpEntry } = await import("../memory-prompts.js");
    let result: { removed: boolean; fileDeleted: boolean } | undefined;
    expect(() => {
      result = removeMemoryMcpEntry();
    }).not.toThrow();
    expect(result).toEqual({ removed: false, fileDeleted: false });
    // File must remain untouched
    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(content).toEqual(original);
  });

  it("drops mcpServers key but keeps file when coding-friend-memory is removed and other top-level keys remain", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          "coding-friend-memory": { command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] },
        },
        other: "v",
      }),
      "utf-8",
    );

    const { removeMemoryMcpEntry } = await import("../memory-prompts.js");
    const result = removeMemoryMcpEntry();

    expect(result).toEqual({ removed: true, fileDeleted: false });
    expect(existsSync(mcpPath)).toBe(true);
    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(content).toEqual({ other: "v" });
    expect(content.mcpServers).toBeUndefined();
  });
});

describe("getMemoryMcpStatus", () => {
  it("returns userScope=true and scope='user' when registered and no .mcp.json entry", async () => {
    const { isMemoryMcpRegistered } = await import("../memory-mcp-register.js");
    vi.mocked(isMemoryMcpRegistered).mockReturnValue(true);

    const { getMemoryMcpStatus } = await import("../memory-prompts.js");
    const status = getMemoryMcpStatus(() => true);

    expect(status.configured).toBe(true);
    expect(status.userScope).toBe(true);
    expect(status.scope).toBe("user");
  });

  it("returns userScope=true and scope='local' when registered AND .mcp.json has a shadow entry", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          "coding-friend-memory": {
            command: "npx",
            args: ["-y", "coding-friend-cli", "mcp-serve"],
          },
        },
      }),
      "utf-8",
    );

    const { getMemoryMcpStatus } = await import("../memory-prompts.js");
    const status = getMemoryMcpStatus(() => true);

    expect(status.configured).toBe(true);
    expect(status.userScope).toBe(true);
    expect(status.scope).toBe("local");
  });

  it("returns userScope=false, scope='local' when not registered but project .mcp.json has entry", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          "coding-friend-memory": {
            command: "npx",
            args: ["-y", "coding-friend-cli", "mcp-serve"],
          },
        },
      }),
      "utf-8",
    );

    const { getMemoryMcpStatus } = await import("../memory-prompts.js");
    const status = getMemoryMcpStatus(() => false);

    expect(status.configured).toBe(true);
    expect(status.userScope).toBe(false);
    expect(status.scope).toBe("local");
  });

  it("returns configured=false, userScope=false when not registered and no .mcp.json", async () => {
    const { getMemoryMcpStatus } = await import("../memory-prompts.js");
    const status = getMemoryMcpStatus(() => false);

    expect(status.configured).toBe(false);
    expect(status.userScope).toBe(false);
    expect(status.scope).toBe(null);
  });

  it("returns configured=true, scope='global', userScope=false when global ~/.claude/.mcp.json has the entry", async () => {
    // No local .mcp.json in testDir
    // Write the entry to the global dir (mocked via claudeConfigDir -> globalTestDir)
    const globalMcpPath = join(globalTestDir, ".mcp.json");
    writeFileSync(
      globalMcpPath,
      JSON.stringify({
        mcpServers: {
          "coding-friend-memory": {
            command: "npx",
            args: ["-y", "coding-friend-cli", "mcp-serve"],
          },
        },
      }),
      "utf-8",
    );

    const { getMemoryMcpStatus } = await import("../memory-prompts.js");
    const status = getMemoryMcpStatus(() => false);

    expect(status.configured).toBe(true);
    expect(status.scope).toBe("global");
    expect(status.userScope).toBe(false);
  });
});
