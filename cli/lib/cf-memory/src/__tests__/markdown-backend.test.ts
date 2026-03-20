import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import matter from "gray-matter";
import { MarkdownBackend } from "../backends/markdown.js";
import type { StoreInput } from "../lib/types.js";

let testDir: string;
let backend: MarkdownBackend;
let counter = 0;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-test-${Date.now()}-${++counter}`);
  mkdirSync(testDir, { recursive: true });
  backend = new MarkdownBackend(testDir);
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

describe("MarkdownBackend", () => {
  describe("store()", () => {
    it("creates a markdown file with correct frontmatter", async () => {
      const memory = await backend.store(sampleInput);

      expect(memory.id).toBe("features/api-authentication-pattern");
      expect(memory.slug).toBe("api-authentication-pattern");
      expect(memory.category).toBe("features");
      expect(memory.frontmatter.title).toBe("API Authentication Pattern");
      expect(memory.frontmatter.type).toBe("fact");
      expect(memory.frontmatter.tags).toEqual(["auth", "jwt", "api"]);
      expect(memory.frontmatter.importance).toBe(3);
      expect(memory.frontmatter.source).toBe("conversation");

      // Verify file on disk
      const filePath = join(
        testDir,
        "features",
        "api-authentication-pattern.md",
      );
      expect(existsSync(filePath)).toBe(true);

      const raw = matter(readFileSync(filePath, "utf-8"));
      expect(raw.data.title).toBe("API Authentication Pattern");
      expect(raw.data.type).toBe("fact");
      expect(raw.content.trim()).toContain("# API Auth");
    });

    it("maps type to correct category folder", async () => {
      const types = [
        { type: "fact", category: "features" },
        { type: "preference", category: "conventions" },
        { type: "context", category: "decisions" },
        { type: "episode", category: "bugs" },
        { type: "procedure", category: "infrastructure" },
      ] as const;

      for (const { type, category } of types) {
        const memory = await backend.store({
          ...sampleInput,
          title: `Test ${type}`,
          type,
        });
        expect(memory.category).toBe(category);
        expect(existsSync(join(testDir, category))).toBe(true);
      }
    });

    it("handles duplicate slugs by appending timestamp", async () => {
      const m1 = await backend.store(sampleInput);
      const m2 = await backend.store(sampleInput);

      expect(m1.slug).toBe("api-authentication-pattern");
      expect(m2.slug).not.toBe(m1.slug);
      expect(m2.slug).toContain("api-authentication-pattern-");
    });

    it("index_only=true returns Memory without writing when file exists", async () => {
      // Pre-create the file via normal store
      const original = await backend.store(sampleInput);
      const filePath = join(
        testDir,
        "features",
        "api-authentication-pattern.md",
      );
      expect(existsSync(filePath)).toBe(true);

      // Snapshot file content before index_only call
      const contentBefore = readFileSync(filePath, "utf-8");

      // Now store with index_only — should NOT create a second file
      const indexed = await backend.store({ ...sampleInput, index_only: true });

      // Should return clean slug (no timestamp suffix)
      expect(indexed.slug).toBe("api-authentication-pattern");
      expect(indexed.id).toBe("features/api-authentication-pattern");
      expect(indexed.category).toBe("features");
      expect(indexed.frontmatter.title).toBe(sampleInput.title);
      expect(indexed.frontmatter.type).toBe(sampleInput.type);
      expect(indexed.content).toBe(sampleInput.content);

      // Verify no duplicate file was created (only one .md file in features/)
      const files = readdirSync(join(testDir, "features")).filter((f: string) =>
        f.endsWith(".md"),
      );
      expect(files.length).toBe(1);

      // Verify existing file was not modified
      expect(readFileSync(filePath, "utf-8")).toBe(contentBefore);
    });

    it("index_only=true throws when file does not exist", async () => {
      await expect(
        backend.store({ ...sampleInput, index_only: true }),
      ).rejects.toThrow(/index_only.*file not found/i);
    });

    it("respects custom importance and source", async () => {
      const memory = await backend.store({
        ...sampleInput,
        importance: 5,
        source: "auto-capture",
      });

      expect(memory.frontmatter.importance).toBe(5);
      expect(memory.frontmatter.source).toBe("auto-capture");
    });
  });

  describe("retrieve()", () => {
    it("retrieves a stored memory by ID", async () => {
      await backend.store(sampleInput);
      const memory = await backend.retrieve(
        "features/api-authentication-pattern",
      );

      expect(memory).not.toBeNull();
      expect(memory!.frontmatter.title).toBe("API Authentication Pattern");
      expect(memory!.content).toContain("JWT tokens");
    });

    it("returns null for non-existent ID", async () => {
      const memory = await backend.retrieve("features/nonexistent");
      expect(memory).toBeNull();
    });

    it("returns null for invalid ID format", async () => {
      expect(await backend.retrieve("invalid")).toBeNull();
      expect(await backend.retrieve("")).toBeNull();
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
      expect(results[0].matchedOn).toContain("title");
    });

    it("finds by description match", async () => {
      const results = await backend.search({ query: "JWT" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchedOn).toContain("description");
    });

    it("finds by tag match", async () => {
      const results = await backend.search({ query: "prisma" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchedOn).toContain("tags");
    });

    it("finds by content match", async () => {
      const results = await backend.search({ query: "allowlist" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchedOn).toContain("content");
    });

    it("filters by type", async () => {
      const results = await backend.search({
        query: "api",
        type: "episode",
      });
      expect(results.length).toBe(1);
      expect(results[0].memory.frontmatter.type).toBe("episode");
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

    it("ranks title matches higher than content matches", async () => {
      const results = await backend.search({ query: "api" });
      expect(results.length).toBeGreaterThan(1);
      // Title/description matches should score higher
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it("returns empty array for no matches", async () => {
      const results = await backend.search({ query: "zzz_nonexistent_zzz" });
      expect(results).toEqual([]);
    });
  });

  describe("list()", () => {
    beforeEach(async () => {
      await backend.store(sampleInput);
      await backend.store({
        title: "Code Style",
        description: "Always use async/await",
        type: "preference",
        tags: ["style"],
        content: "Use async/await.",
      });
    });

    it("lists all memories", async () => {
      const metas = await backend.list({});
      expect(metas.length).toBe(2);
    });

    it("filters by type", async () => {
      const metas = await backend.list({ type: "fact" });
      expect(metas.length).toBe(1);
      expect(metas[0].frontmatter.type).toBe("fact");
    });

    it("filters by category", async () => {
      const metas = await backend.list({ category: "conventions" });
      expect(metas.length).toBe(1);
      expect(metas[0].category).toBe("conventions");
    });

    it("respects limit", async () => {
      const metas = await backend.list({ limit: 1 });
      expect(metas.length).toBe(1);
    });

    it("sorts by updated date descending", async () => {
      const metas = await backend.list({});
      const dates = metas.map((m) => m.frontmatter.updated);
      expect(dates[0]).toBe(dates[1]); // same day in tests
    });

    it("returns empty for non-existent docs dir", async () => {
      const emptyBackend = new MarkdownBackend("/tmp/nonexistent-cf-test");
      const metas = await emptyBackend.list({});
      expect(metas).toEqual([]);
    });
  });

  describe("update()", () => {
    it("updates title and tags", async () => {
      await backend.store(sampleInput);
      const updated = await backend.update({
        id: "features/api-authentication-pattern",
        title: "Updated Auth Pattern",
        tags: ["security", "oauth"],
      });

      expect(updated).not.toBeNull();
      expect(updated!.frontmatter.title).toBe("Updated Auth Pattern");
      // Tags are merged
      expect(updated!.frontmatter.tags).toContain("auth");
      expect(updated!.frontmatter.tags).toContain("security");
      expect(updated!.frontmatter.tags).toContain("oauth");
    });

    it("appends content", async () => {
      await backend.store(sampleInput);
      const updated = await backend.update({
        id: "features/api-authentication-pattern",
        content: "## New Section\n\nAdditional info.",
      });

      expect(updated).not.toBeNull();
      expect(updated!.content).toContain("JWT tokens");
      expect(updated!.content).toContain("New Section");
    });

    it("returns null for non-existent memory", async () => {
      const result = await backend.update({
        id: "features/nonexistent",
        title: "Test",
      });
      expect(result).toBeNull();
    });
  });

  describe("delete()", () => {
    it("deletes a stored memory", async () => {
      await backend.store(sampleInput);
      const deleted = await backend.delete(
        "features/api-authentication-pattern",
      );
      expect(deleted).toBe(true);

      const retrieved = await backend.retrieve(
        "features/api-authentication-pattern",
      );
      expect(retrieved).toBeNull();
    });

    it("returns false for non-existent memory", async () => {
      const deleted = await backend.delete("features/nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("stats()", () => {
    it("returns correct counts", async () => {
      await backend.store(sampleInput);
      await backend.store({
        title: "Another Fact",
        description: "Test",
        type: "fact",
        tags: [],
        content: "Content",
      });
      await backend.store({
        title: "A Bug",
        description: "Test bug",
        type: "episode",
        tags: [],
        content: "Bug content",
      });

      const stats = await backend.stats();
      expect(stats.total).toBe(3);
      expect(stats.byCategory.features).toBe(2);
      expect(stats.byCategory.bugs).toBe(1);
      expect(stats.byType.fact).toBe(2);
      expect(stats.byType.episode).toBe(1);
    });

    it("returns zeros for empty dir", async () => {
      const stats = await backend.stats();
      expect(stats.total).toBe(0);
    });
  });

  describe("CRUD cycle", () => {
    it("store → retrieve → update → delete", async () => {
      // Store with unique title to avoid any collision
      const input = {
        ...sampleInput,
        title: "CRUD Test Memory " + Date.now(),
      };
      const stored = await backend.store(input);
      expect(stored.id).toBeTruthy();

      // Retrieve
      const retrieved = await backend.retrieve(stored.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.frontmatter.title).toBe(input.title);

      // Update
      const updated = await backend.update({
        id: stored.id,
        title: "Updated Title",
        content: "Additional content.",
      });
      expect(updated!.frontmatter.title).toBe("Updated Title");

      // Verify update persisted
      const reread = await backend.retrieve(stored.id);
      expect(reread!.frontmatter.title).toBe("Updated Title");
      expect(reread!.content).toContain("Additional content");

      // Delete
      const deleted = await backend.delete(stored.id);
      expect(deleted).toBe(true);

      // Verify deleted
      const gone = await backend.retrieve(stored.id);
      expect(gone).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles special characters in title", async () => {
      const memory = await backend.store({
        ...sampleInput,
        title: "What's the API/Auth flow? (v2.0)",
      });
      expect(memory.slug).toBe("what-s-the-api-auth-flow-v2-0");
    });

    it("handles empty docs directory", async () => {
      const metas = await backend.list({});
      expect(metas).toEqual([]);

      const results = await backend.search({ query: "anything" });
      expect(results).toEqual([]);
    });

    it("close() is a no-op", async () => {
      await expect(backend.close()).resolves.toBeUndefined();
    });

    it("rejects path traversal in retrieve/update/delete", async () => {
      await backend.store(sampleInput);

      expect(await backend.retrieve("../../etc/passwd")).toBeNull();
      expect(await backend.retrieve("features/../../../etc/passwd")).toBeNull();
      expect(
        await backend.update({ id: "../../etc/passwd", title: "hack" }),
      ).toBeNull();
      expect(await backend.delete("../../etc/passwd")).toBe(false);
    });
  });
});
