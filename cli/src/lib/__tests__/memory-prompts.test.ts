import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We need to test writeMemoryMcpEntry, which calls writeJson and reads process.cwd()
// Use a real tmpdir as the cwd simulation by mocking process.cwd()

let testDir: string;
let originalCwd: () => string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-mcp-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  originalCwd = process.cwd;
  process.cwd = () => testDir;
});

afterEach(() => {
  process.cwd = originalCwd;
  rmSync(testDir, { recursive: true, force: true });
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
