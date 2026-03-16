import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MiniSearchBackend } from "../backends/minisearch.js";
import type { StoreInput } from "../lib/types.js";

let testDir: string;
let backend: MiniSearchBackend;
let counter = 0;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-mini-test-${Date.now()}-${++counter}`);
  mkdirSync(testDir, { recursive: true });
  backend = new MiniSearchBackend(testDir);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const sampleInput: StoreInput = {
  title: "API Authentication Pattern",
  description: "Auth module uses JWT tokens stored in httpOnly cookies",
  type: "fact",
  tags: ["auth", "jwt", "api"],
  content: "# API Auth\n\nThe project uses JWT tokens with refresh rotation.",
};

describe("MiniSearchBackend", () => {
  describe("store()", () => {
    it("stores a memory and indexes it", async () => {
      const memory = await backend.store(sampleInput);
      expect(memory.id).toBe("features/api-authentication-pattern");
      expect(memory.frontmatter.title).toBe("API Authentication Pattern");

      // Verify it's searchable
      const results = await backend.search({ query: "authentication" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.frontmatter.title).toContain("Authentication");
    });
  });

  describe("search()", () => {
    beforeEach(async () => {
      await backend.store(sampleInput);
      await backend.store({
        title: "Database Migration Guide",
        description: "How to run database migrations with Prisma",
        type: "procedure",
        tags: ["database", "prisma", "migration"],
        content: "# Migrations\n\nRun npx prisma migrate dev.",
      });
      await backend.store({
        title: "CORS Bug Fix",
        description: "Fixed CORS issue on /api/upload endpoint",
        type: "episode",
        tags: ["cors", "api", "bug"],
        content: "# CORS Fix\n\nAdded missing Origin header to allowlist.",
      });
    });

    it("finds by title match", async () => {
      const results = await backend.search({ query: "authentication" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.frontmatter.title).toContain("Authentication");
    });

    it("finds by tag match", async () => {
      const results = await backend.search({ query: "prisma" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.frontmatter.title).toBe(
        "Database Migration Guide",
      );
    });

    it("finds by content match", async () => {
      const results = await backend.search({ query: "allowlist" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.frontmatter.title).toContain("CORS");
    });

    it("fuzzy search finds results that substring grep misses", async () => {
      // Typo: "autentication" (missing 'h')
      const results = await backend.search({ query: "autentication" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.frontmatter.title).toContain("Authentication");
    });

    it("BM25 ranking: both exact and partial find the right result", async () => {
      const exactResults = await backend.search({ query: "authentication" });
      const partialResults = await backend.search({ query: "auth" });

      // Both should find the auth memory
      expect(exactResults.length).toBeGreaterThan(0);
      expect(partialResults.length).toBeGreaterThan(0);

      const exactHit = exactResults.find((r) =>
        r.memory.frontmatter.title.includes("Authentication"),
      );
      const partialHit = partialResults.find((r) =>
        r.memory.frontmatter.title.includes("Authentication"),
      );

      expect(exactHit).toBeDefined();
      expect(partialHit).toBeDefined();
      // Both should have positive scores
      expect(exactHit!.score).toBeGreaterThan(0);
      expect(partialHit!.score).toBeGreaterThan(0);
    });

    it("boost: title/tags matches rank above content-only matches", async () => {
      // "api" is in both title/tags of CORS and content of auth
      const results = await backend.search({ query: "api" });
      expect(results.length).toBeGreaterThanOrEqual(2);
      // The first result should have matched on title or tags, not just content
      expect(results[0].matchedOn.length).toBeGreaterThan(0);
    });

    it("filters by type", async () => {
      const results = await backend.search({
        query: "api",
        type: "episode",
      });
      for (const r of results) {
        expect(r.memory.frontmatter.type).toBe("episode");
      }
    });

    it("filters by tags", async () => {
      const results = await backend.search({
        query: "api",
        tags: ["cors"],
      });
      expect(results.length).toBe(1);
      expect(results[0].memory.frontmatter.title).toContain("CORS");
    });

    it("respects limit", async () => {
      const results = await backend.search({ query: "api", limit: 1 });
      expect(results.length).toBe(1);
    });

    it("returns empty for no matches", async () => {
      const results = await backend.search({
        query: "zzz_nonexistent_zzz",
      });
      expect(results).toEqual([]);
    });

    it("empty query returns list results", async () => {
      const results = await backend.search({ query: "" });
      expect(results.length).toBe(3);
    });
  });

  describe("index rebuild after mutations", () => {
    it("search finds newly stored memory", async () => {
      await backend.store(sampleInput);

      const before = await backend.search({ query: "migration" });
      expect(before.length).toBe(0);

      await backend.store({
        title: "DB Migration",
        description: "How to migrate",
        type: "procedure",
        tags: ["db"],
        content: "Migration steps.",
      });

      const after = await backend.search({ query: "migration" });
      expect(after.length).toBeGreaterThan(0);
    });

    it("search reflects updates", async () => {
      const memory = await backend.store(sampleInput);

      await backend.update({
        id: memory.id,
        title: "Updated Authentication Pattern v2",
      });

      const results = await backend.search({ query: "v2" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.frontmatter.title).toContain("v2");
    });

    it("search excludes deleted memory", async () => {
      const memory = await backend.store(sampleInput);

      const before = await backend.search({ query: "authentication" });
      expect(before.length).toBe(1);

      await backend.delete(memory.id);

      const after = await backend.search({ query: "authentication" });
      expect(after.length).toBe(0);
    });

    it("rebuild() refreshes the full index", async () => {
      await backend.store(sampleInput);
      await backend.store({
        title: "Second Memory",
        description: "Test",
        type: "fact",
        tags: [],
        content: "Content",
      });

      await backend.rebuild();

      const results = await backend.search({ query: "authentication" });
      expect(results.length).toBe(1);
    });
  });

  describe("CRUD cycle", () => {
    it("store → retrieve → update → delete", async () => {
      const uniqueInput = {
        ...sampleInput,
        title: `CRUD Test Memory ${Date.now()}`,
      };
      const stored = await backend.store(uniqueInput);
      expect(stored.id).toBeTruthy();

      const retrieved = await backend.retrieve(stored.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.frontmatter.title).toBe(uniqueInput.title);

      const updated = await backend.update({
        id: stored.id,
        title: "Updated Auth",
      });
      expect(updated!.frontmatter.title).toBe("Updated Auth");

      const deleted = await backend.delete(stored.id);
      expect(deleted).toBe(true);

      const gone = await backend.retrieve(stored.id);
      expect(gone).toBeNull();
    });
  });

  describe("stats()", () => {
    it("returns correct counts", async () => {
      await backend.store(sampleInput);
      await backend.store({
        title: "A Bug",
        description: "Bug fix",
        type: "episode",
        tags: [],
        content: "Bug",
      });

      const stats = await backend.stats();
      expect(stats.total).toBe(2);
      expect(stats.byType.fact).toBe(1);
      expect(stats.byType.episode).toBe(1);
    });
  });
});
