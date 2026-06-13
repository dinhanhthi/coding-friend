/**
 * Regression tests for lazy DB creation in SqliteBackend.
 *
 * Verifies that constructing a SqliteBackend (or performing read operations)
 * on a project with no existing memories does NOT create the DB file or dir,
 * and that the first write (store) creates the DB and the item is findable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { areSqliteDepsAvailable } from "../lib/lazy-install.js";
import { SqliteBackend } from "../backends/sqlite/index.js";
import { createBackendForTier } from "../lib/tier.js";
import type { StoreInput } from "../lib/types.js";

let testDir: string;
let dbPath: string;
let docsDir: string;
let counter = 0;

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `cf-memory-lazy-db-test-${Date.now()}-${++counter}`,
  );
  mkdirSync(testDir, { recursive: true });
  docsDir = join(testDir, "docs", "memory");
  dbPath = join(testDir, "db.sqlite");
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const sampleInput: StoreInput = {
  title: "Lazy DB Test Memory",
  description: "Created to test lazy DB init",
  type: "fact",
  tags: ["test"],
  content: "# Lazy DB\n\nThis memory tests deferred DB creation.",
};

const depsAvailable = areSqliteDepsAvailable();

describe("SqliteBackend — lazy DB creation", () => {
  it.skipIf(!depsAvailable)(
    "(a) constructing the backend does NOT create the DB file",
    () => {
      new SqliteBackend(docsDir, { dbPath, skipVec: true });

      expect(existsSync(dbPath)).toBe(false);
    },
  );

  it.skipIf(!depsAvailable)(
    "(b) search() on empty backend returns [] without creating the DB",
    async () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      const results = await backend.search({ query: "anything" });

      expect(results).toEqual([]);
      expect(existsSync(dbPath)).toBe(false);

      await backend.close();
    },
  );

  it.skipIf(!depsAvailable)(
    "(b) list() on empty backend returns [] without creating the DB",
    async () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      const metas = await backend.list({});

      expect(metas).toEqual([]);
      expect(existsSync(dbPath)).toBe(false);

      await backend.close();
    },
  );

  it.skipIf(!depsAvailable)(
    "(b) stats() on empty backend returns zeroed stats without creating the DB",
    async () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      const stats = await backend.stats();

      expect(stats).toEqual({ total: 0, byCategory: {}, byType: {} });
      expect(existsSync(dbPath)).toBe(false);

      await backend.close();
    },
  );

  it.skipIf(!depsAvailable)(
    "(c) after store(), DB file exists and search() finds the item",
    async () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      // DB should not exist before write
      expect(existsSync(dbPath)).toBe(false);

      await backend.store(sampleInput);

      // DB should now exist
      expect(existsSync(dbPath)).toBe(true);

      // Item should be findable via empty-query search (routes through list)
      const results = await backend.search({ query: "" });
      expect(results.length).toBe(1);
      expect(results[0].memory.frontmatter.title).toBe("Lazy DB Test Memory");

      await backend.close();
    },
  );

  it.skipIf(!depsAvailable)(
    "close() on a never-opened backend does not throw",
    async () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      await expect(backend.close()).resolves.toBeUndefined();
      expect(existsSync(dbPath)).toBe(false);
    },
  );

  it.skipIf(!depsAvailable)(
    "getDbPath() returns the computed path without touching the filesystem",
    () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      expect(backend.getDbPath()).toBe(dbPath);
      expect(existsSync(dbPath)).toBe(false);
    },
  );

  it.skipIf(!depsAvailable)(
    "delete(nonexistentId) returns false and does not create the DB",
    async () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      const result = await backend.delete("nonexistent/id");

      expect(result).toBe(false);
      expect(existsSync(dbPath)).toBe(false);

      await backend.close();
    },
  );

  it.skipIf(!depsAvailable)(
    "update(nonexistentId) returns null and does not create the DB",
    async () => {
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      const result = await backend.update({ id: "nonexistent/id", title: "New Title" });

      expect(result).toBeNull();
      expect(existsSync(dbPath)).toBe(false);

      await backend.close();
    },
  );

  it.skipIf(!depsAvailable)(
    "rebuild() on empty docs/memory does not create the DB file",
    async () => {
      // docsDir does not exist (no memories)
      const backend = new SqliteBackend(docsDir, { dbPath, skipVec: true });

      await backend.rebuild();

      expect(existsSync(dbPath)).toBe(false);

      await backend.close();
    },
  );
});

describe("SqliteBackend — lazy DB via createBackendForTier (integration)", () => {
  it.skipIf(!depsAvailable)(
    "createBackendForTier 'full' on empty project does not create DB file before or after read ops",
    async () => {
      // Use explicit dbPath so we do not pollute ~/.coding-friend
      const { backend, tier } = await createBackendForTier(
        docsDir,
        "full",
        undefined,
        { dbPath },
      );

      expect(tier.name).toBe("full");

      // (1) No DB file after construction
      expect(existsSync(dbPath)).toBe(false);

      // (2) Read ops must not create the DB file
      await backend.list({});
      expect(existsSync(dbPath)).toBe(false);

      await backend.search({ query: "anything" });
      expect(existsSync(dbPath)).toBe(false);

      await backend.stats();
      expect(existsSync(dbPath)).toBe(false);

      await backend.close();
    },
  );
});
