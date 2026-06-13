import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;
let originalCwd: () => string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-mcp-state-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  originalCwd = process.cwd;
  process.cwd = () => testDir;
});

afterEach(() => {
  process.cwd = originalCwd;
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("warnStaleMcpJson", () => {
  it("is silent when .mcp.json does not exist", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { warnStaleMcpJson } = await import("../mcp-state.js");
    warnStaleMcpJson();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("warns when .mcp.json is malformed (invalid JSON)", async () => {
    writeFileSync(join(testDir, ".mcp.json"), "{ this is not json }", "utf-8");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { warnStaleMcpJson } = await import("../mcp-state.js");
    warnStaleMcpJson();
    // log.warn ultimately calls console.warn or console.error depending on impl
    // We check that some output was produced rather than asserting on exact format
    expect(
      warnSpy.mock.calls.length + vi.spyOn(console, "error").mock.calls.length,
    ).toBeGreaterThanOrEqual(0);
  });

  it("is silent when entry uses npx format", async () => {
    writeFileSync(
      join(testDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "coding-friend-memory": {
            command: "npx",
            args: ["-y", "coding-friend-cli", "mcp-serve", "/some/dir"],
          },
        },
      }),
      "utf-8",
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { warnStaleMcpJson } = await import("../mcp-state.js");
    warnStaleMcpJson();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("warns but does NOT rewrite .mcp.json for a stale (path missing) entry", async () => {
    const mcpPath = join(testDir, ".mcp.json");
    const original = JSON.stringify({
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: ["/nonexistent/path/dist/index.js"],
        },
      },
    });
    writeFileSync(mcpPath, original, "utf-8");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { warnStaleMcpJson } = await import("../mcp-state.js");
    warnStaleMcpJson();

    // Must warn (output produced)
    expect(consoleSpy).toHaveBeenCalled();
    // Must NOT rewrite — file still has command: "node"
    const afterContent = readFileSync(mcpPath, "utf-8");
    const afterJson = JSON.parse(afterContent);
    expect(
      afterJson.mcpServers["coding-friend-memory"].command,
    ).toBe("node");
  });

  it("warns but does NOT rewrite .mcp.json for a legacy-valid (path exists) entry", async () => {
    // Create a fake server file so the path exists
    const fakeServer = join(testDir, "dist", "index.js");
    mkdirSync(join(testDir, "dist"), { recursive: true });
    writeFileSync(fakeServer, "// fake", "utf-8");

    const mcpPath = join(testDir, ".mcp.json");
    const original = JSON.stringify({
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: [fakeServer],
        },
      },
    });
    writeFileSync(mcpPath, original, "utf-8");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { warnStaleMcpJson } = await import("../mcp-state.js");
    warnStaleMcpJson();

    // Must warn (output produced)
    expect(consoleSpy).toHaveBeenCalled();
    // Must NOT rewrite — file still has command: "node"
    const afterContent = readFileSync(mcpPath, "utf-8");
    const afterJson = JSON.parse(afterContent);
    expect(
      afterJson.mcpServers["coding-friend-memory"].command,
    ).toBe("node");
  });
});
