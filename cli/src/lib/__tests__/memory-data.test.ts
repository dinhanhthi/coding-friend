import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

vi.mock("../exec.js", () => ({ run: vi.fn() }));
vi.mock("../config.js", () => ({ loadConfig: vi.fn(() => ({})) }));
vi.mock("../memory-prompts.js", () => ({
  getMemoryMcpStatus: vi.fn(() => ({
    configured: false,
    scope: null,
    userScope: false,
  })),
}));

import { run } from "../exec.js";
import { loadConfig } from "../config.js";
import {
  collectMemoryDetails,
  countMdFiles,
  dirSize,
  getProjectInfo,
  listMemories,
  searchMemories,
} from "../memory-data.js";
import { CliError } from "../output.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cf-memdata-"));
  vi.mocked(run).mockReset();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("countMdFiles", () => {
  it("counts .md files recursively and skips README.md", () => {
    mkdirSync(join(dir, "a", "b"), { recursive: true });
    writeFileSync(join(dir, "x.md"), "");
    writeFileSync(join(dir, "README.md"), "");
    writeFileSync(join(dir, "a", "b", "y.md"), "");
    writeFileSync(join(dir, "a", "note.txt"), "");
    expect(countMdFiles(dir)).toBe(2);
  });

  it("returns 0 for a missing dir", () => {
    expect(countMdFiles(join(dir, "nope"))).toBe(0);
  });
});

describe("dirSize", () => {
  it("sums file sizes recursively", () => {
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a"), "12345");
    writeFileSync(join(dir, "sub", "b"), "123");
    expect(dirSize(dir)).toBe(8);
  });
});

describe("getProjectInfo", () => {
  it("returns size-only defaults without a db.sqlite", () => {
    writeFileSync(join(dir, "f"), "abc");
    expect(getProjectInfo(dir, "p1", "/mcp")).toEqual({
      id: "p1",
      sourceDir: null,
      memories: 0,
      size: 3,
      lastUpdated: null,
    });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("collectMemoryDetails", () => {
  it("defaults the embedding model per provider and drops empty categories", () => {
    vi.mocked(loadConfig).mockReturnValue({
      memory: { embedding: { provider: "transformers" } },
    } as ReturnType<typeof loadConfig>);
    mkdirSync(join(dir, "full"));
    mkdirSync(join(dir, "empty"));
    mkdirSync(join(dir, ".hidden"));
    writeFileSync(join(dir, "full", "a.md"), "");
    writeFileSync(join(dir, ".hidden", "b.md"), "");

    expect(collectMemoryDetails(dir)).toEqual({
      embedding: { provider: "transformers", model: "Xenova/all-MiniLM-L6-v2" },
      mcp: { configured: false, scope: null, userScope: false },
      autoCapture: false,
      categories: [{ name: "full", count: 1 }],
    });
  });

  it("reports no embedding when neither provider nor model is set", () => {
    vi.mocked(loadConfig).mockReturnValue({} as ReturnType<typeof loadConfig>);
    expect(collectMemoryDetails(join(dir, "missing"))).toMatchObject({
      embedding: null,
      categories: [],
    });
  });
});

describe("searchMemories / listMemories", () => {
  it("passes the query via env and the limit into the script", () => {
    vi.mocked(run).mockReturnValue("[]");
    expect(searchMemories(dir, "/mcp", "a`b'c", 5)).toEqual([]);
    const [cmd, args, opts] = vi.mocked(run).mock.calls[0];
    expect(cmd).toBe("node");
    expect(args?.[1]).toContain("limit: 5");
    expect(args?.[1]).not.toContain("a`b'c");
    expect(opts?.["env"]?.CF_SEARCH_QUERY).toBe("a`b'c");
  });

  it("throws COMMAND_FAILED when the child fails or prints non-JSON", () => {
    vi.mocked(run).mockReturnValue(null);
    expect(() => listMemories(dir, "/mcp")).toThrow(CliError);
    vi.mocked(run).mockReturnValue("No memories found.");
    expect(() => listMemories(dir, "/mcp")).toThrow(
      expect.objectContaining({ code: "COMMAND_FAILED" }),
    );
  });
});
