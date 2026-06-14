import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SqliteBackend } from "../backends/sqlite/index.js";
import { areSqliteDepsAvailable } from "../lib/lazy-install.js";

const sqliteAvailable = areSqliteDepsAvailable();
const describeIfSqlite = sqliteAvailable ? describe : describe.skip;

let testDir: string;
let docsDir: string;
let dbPath: string;
let claudeMemory: SqliteBackend;
let codexMemory: SqliteBackend;
let counter = 0;

function createBackend(): SqliteBackend {
  return new SqliteBackend(docsDir, {
    dbPath,
    skipVec: true,
  });
}

describeIfSqlite(
  "memory cohabitation: Claude and Codex share one SQLite DB",
  () => {
    beforeEach(() => {
      testDir = join(
        tmpdir(),
        `cf-memory-cohabitation-${Date.now()}-${++counter}`,
      );
      docsDir = join(testDir, "docs", "memory");
      dbPath = join(testDir, "db.sqlite");
      mkdirSync(docsDir, { recursive: true });
      claudeMemory = createBackend();
      codexMemory = createBackend();
    });

    afterEach(async () => {
      await claudeMemory?.close();
      await codexMemory?.close();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("finds Claude-written memory from the Codex backend", async () => {
      await claudeMemory.store({
        title: "Claude Shared Auth Pattern",
        description: "Auth memory written from Claude host",
        type: "fact",
        tags: ["auth", "cohabitation"],
        content: "Shared auth memory visible to Codex.",
        source: "claude-test",
      });

      const results = await codexMemory.search({ query: "shared auth" });
      expect(
        results.map((result) => result.memory.frontmatter.title),
      ).toContain("Claude Shared Auth Pattern");
    });

    it("finds Codex-written memory from the Claude backend", async () => {
      await codexMemory.store({
        title: "Codex Shared Review Pattern",
        description: "Review memory written from Codex host",
        type: "procedure",
        tags: ["review", "cohabitation"],
        content: "Shared review memory visible to Claude.",
        source: "codex-test",
      });

      const results = await claudeMemory.search({ query: "shared review" });
      expect(
        results.map((result) => result.memory.frontmatter.title),
      ).toContain("Codex Shared Review Pattern");
    });

    it("handles quick successive writes from both hosts", async () => {
      await Promise.all([
        claudeMemory.store({
          title: "Claude Concurrent Write",
          description: "First concurrent memory",
          type: "context",
          tags: ["concurrent"],
          content: "Claude wrote this during a cohabitation smoke test.",
          source: "claude-test",
        }),
        codexMemory.store({
          title: "Codex Concurrent Write",
          description: "Second concurrent memory",
          type: "context",
          tags: ["concurrent"],
          content: "Codex wrote this during a cohabitation smoke test.",
          source: "codex-test",
        }),
      ]);

      const results = await claudeMemory.search({ query: "concurrent write" });
      const titles = results.map((result) => result.memory.frontmatter.title);
      expect(titles).toContain("Claude Concurrent Write");
      expect(titles).toContain("Codex Concurrent Write");
      expect(existsSync(dbPath)).toBe(true);
    });
  },
);

if (!sqliteAvailable) {
  describe("memory cohabitation: SQLite deps unavailable", () => {
    it("skips SQLite cohabitation smoke without lazy-installed deps", () => {
      expect(sqliteAvailable).toBe(false);
    });
  });
}
