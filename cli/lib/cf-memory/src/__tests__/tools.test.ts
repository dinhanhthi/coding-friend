import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MarkdownBackend } from "../backends/markdown.js";
import { registerAllTools } from "../server.js";
import { registerAllResources } from "../resources/index.js";

let testDir: string;
let server: McpServer;
let backend: MarkdownBackend;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-tools-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  backend = new MarkdownBackend(testDir);
  server = new McpServer({
    name: "test-memory-server",
    version: "0.0.1",
  });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("MCP Tool Registration", () => {
  it("registers all 6 tools without error", () => {
    expect(() => registerAllTools(server, backend)).not.toThrow();
  });

  it("registers all 2 resources without error", () => {
    expect(() => registerAllResources(server, backend)).not.toThrow();
  });

  it("registers both tools and resources together", () => {
    expect(() => {
      registerAllTools(server, backend);
      registerAllResources(server, backend);
    }).not.toThrow();
  });
});

describe("MemoryBackend interface compliance", () => {
  it("has all 8 required methods", () => {
    expect(typeof backend.store).toBe("function");
    expect(typeof backend.search).toBe("function");
    expect(typeof backend.retrieve).toBe("function");
    expect(typeof backend.list).toBe("function");
    expect(typeof backend.update).toBe("function");
    expect(typeof backend.delete).toBe("function");
    expect(typeof backend.stats).toBe("function");
    expect(typeof backend.close).toBe("function");
  });
});

describe("Type validation", () => {
  it("MEMORY_TYPES has exactly 5 types", async () => {
    const { MEMORY_TYPES } = await import("../lib/types.js");
    expect(MEMORY_TYPES).toHaveLength(5);
    expect(MEMORY_TYPES).toContain("fact");
    expect(MEMORY_TYPES).toContain("preference");
    expect(MEMORY_TYPES).toContain("context");
    expect(MEMORY_TYPES).toContain("episode");
    expect(MEMORY_TYPES).toContain("procedure");
  });

  it("MEMORY_CATEGORIES maps all types to folders", async () => {
    const { MEMORY_CATEGORIES, MEMORY_TYPES } = await import("../lib/types.js");
    for (const type of MEMORY_TYPES) {
      expect(MEMORY_CATEGORIES[type]).toBeTruthy();
    }
  });

  it("CATEGORY_TO_TYPE is inverse of MEMORY_CATEGORIES", async () => {
    const { MEMORY_CATEGORIES, CATEGORY_TO_TYPE } =
      await import("../lib/types.js");
    for (const [type, category] of Object.entries(MEMORY_CATEGORIES)) {
      expect(CATEGORY_TO_TYPE[category]).toBe(type);
    }
  });
});
