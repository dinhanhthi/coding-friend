import { describe, it, expect } from "vitest";
import {
  getSchemaVersion,
  migrate,
  applyPragmas,
  getMetadata,
  setMetadata,
  checkEmbeddingMismatch,
  type DatabaseLike,
} from "../backends/sqlite/migrations.js";
import { SCHEMA_VERSION } from "../backends/sqlite/schema.js";

/**
 * In-memory mock database for testing schema logic without better-sqlite3.
 *
 * Tracks SQL statements and supports basic prepare/get/run.
 * Note: The `exec` method here is better-sqlite3's SQL execution,
 * NOT child_process.exec — there is no shell involvement.
 */
function createMockDb(): DatabaseLike & {
  statements: string[];
  tables: Map<string, Array<Record<string, unknown>>>;
} {
  const statements: string[] = [];
  const tables = new Map<string, Array<Record<string, unknown>>>();

  return {
    statements,
    tables,
    // better-sqlite3 Database.exec() — runs SQL, not shell commands
    exec(sql: string) {
      statements.push(sql);

      // Simulate table creation and data insertion
      if (sql.includes("INSERT INTO schema_version")) {
        const match = sql.match(/VALUES\s*\((\d+)\)/);
        if (match) {
          tables.set("schema_version", [{ version: parseInt(match[1], 10) }]);
        }
      }
    },
    pragma(pragma: string) {
      statements.push(`PRAGMA ${pragma}`);
      return undefined;
    },
    prepare(sql: string) {
      return {
        get(..._params: unknown[]) {
          if (sql.includes("schema_version")) {
            const rows = tables.get("schema_version");
            return rows?.[0];
          }
          return undefined;
        },
        run(...params: unknown[]) {
          statements.push(sql);
          // Simulate schema_version UPDATE from migrations
          if (sql.includes("UPDATE schema_version SET version")) {
            const version = params[0] as number;
            tables.set("schema_version", [{ version }]);
          }
          return {};
        },
      };
    },
  };
}

describe("getSchemaVersion()", () => {
  it("returns 0 when table doesn't exist", () => {
    const db = createMockDb();
    // Override prepare to throw (simulating missing table)
    db.prepare = () => ({
      get() {
        throw new Error("no such table: schema_version");
      },
      run() {
        return {};
      },
    });

    expect(getSchemaVersion(db)).toBe(0);
  });

  it("returns version from schema_version table", () => {
    const db = createMockDb();
    db.tables.set("schema_version", [{ version: 1 }]);
    expect(getSchemaVersion(db)).toBe(1);
  });
});

describe("applyPragmas()", () => {
  it("runs all PRAGMA settings", () => {
    const db = createMockDb();
    applyPragmas(db);

    expect(db.statements.some((s) => s.includes("journal_mode"))).toBe(true);
    expect(db.statements.some((s) => s.includes("synchronous"))).toBe(true);
    expect(db.statements.some((s) => s.includes("cache_size"))).toBe(true);
  });
});

describe("migrate()", () => {
  it("applies schema from version 0", () => {
    const db = createMockDb();
    const result = migrate(db);

    expect(result.version).toBe(SCHEMA_VERSION);
    expect(result.migrated).toBe(true);

    // Should have run schema creation SQL
    expect(db.statements.some((s) => s.includes("CREATE TABLE"))).toBe(true);
    expect(db.statements.some((s) => s.includes("memories_fts"))).toBe(true);
  });

  it("is idempotent — running twice produces same result", () => {
    const db = createMockDb();

    const first = migrate(db);
    expect(first.migrated).toBe(true);

    // Now schema_version exists with version 1
    const second = migrate(db);
    expect(second.version).toBe(SCHEMA_VERSION);
    expect(second.migrated).toBe(false);
  });

  it("skips migration when already at current version", () => {
    const db = createMockDb();
    db.tables.set("schema_version", [{ version: SCHEMA_VERSION }]);

    const result = migrate(db);
    expect(result.migrated).toBe(false);
    expect(result.version).toBe(SCHEMA_VERSION);
  });

  it("migrates from v1 to v2 creating metadata table", () => {
    const db = createMockDb();
    // Simulate existing v1 database
    db.tables.set("schema_version", [{ version: 1 }]);

    const result = migrate(db);
    expect(result.version).toBe(SCHEMA_VERSION);
    expect(result.migrated).toBe(true);

    // Should have created metadata table
    expect(
      db.statements.some((s) =>
        s.includes("CREATE TABLE IF NOT EXISTS metadata"),
      ),
    ).toBe(true);
  });
});

/**
 * Enhanced mock database that supports metadata table operations.
 */
function createMetadataMockDb(): DatabaseLike & {
  metadata: Map<string, string>;
} {
  const metadata = new Map<string, string>();

  return {
    metadata,
    // better-sqlite3 Database.exec() - runs SQL, not shell commands
    exec(_sql: string) {
      // Handle metadata table creation (no-op in mock)
    },
    pragma() {
      return undefined;
    },
    prepare(sql: string) {
      return {
        get(...params: unknown[]) {
          if (sql.includes("SELECT value FROM metadata WHERE key = ?")) {
            const key = params[0] as string;
            const val = metadata.get(key);
            return val !== undefined ? { value: val } : undefined;
          }
          return undefined;
        },
        run(...params: unknown[]) {
          if (sql.includes("INSERT OR REPLACE INTO metadata")) {
            const key = params[0] as string;
            const value = params[1] as string;
            metadata.set(key, value);
          }
          return {};
        },
      };
    },
  };
}

describe("getMetadata() and setMetadata()", () => {
  it("returns null for missing key", () => {
    const db = createMetadataMockDb();
    expect(getMetadata(db, "nonexistent")).toBeNull();
  });

  it("stores and retrieves a value", () => {
    const db = createMetadataMockDb();
    setMetadata(db, "embedding_model", "nomic-embed-text");
    expect(getMetadata(db, "embedding_model")).toBe("nomic-embed-text");
  });

  it("overwrites existing value", () => {
    const db = createMetadataMockDb();
    setMetadata(db, "embedding_dims", "384");
    setMetadata(db, "embedding_dims", "768");
    expect(getMetadata(db, "embedding_dims")).toBe("768");
  });
});

describe("checkEmbeddingMismatch()", () => {
  it("returns mismatched=false when model and dims match", () => {
    const db = createMetadataMockDb();
    setMetadata(db, "embedding_model", "all-MiniLM-L6-v2");
    setMetadata(db, "embedding_dims", "384");

    const result = checkEmbeddingMismatch(db, "all-MiniLM-L6-v2", 384);
    expect(result.mismatched).toBe(false);
    expect(result.storedModel).toBe("all-MiniLM-L6-v2");
    expect(result.storedDims).toBe(384);
    expect(result.currentModel).toBe("all-MiniLM-L6-v2");
    expect(result.currentDims).toBe(384);
  });

  it("returns mismatched=true when model changed", () => {
    const db = createMetadataMockDb();
    setMetadata(db, "embedding_model", "all-MiniLM-L6-v2");
    setMetadata(db, "embedding_dims", "384");

    const result = checkEmbeddingMismatch(db, "nomic-embed-text", 768);
    expect(result.mismatched).toBe(true);
    expect(result.storedModel).toBe("all-MiniLM-L6-v2");
    expect(result.storedDims).toBe(384);
    expect(result.currentModel).toBe("nomic-embed-text");
    expect(result.currentDims).toBe(768);
  });

  it("returns mismatched=true when only dims changed", () => {
    const db = createMetadataMockDb();
    setMetadata(db, "embedding_model", "custom-model");
    setMetadata(db, "embedding_dims", "384");

    const result = checkEmbeddingMismatch(db, "custom-model", 768);
    expect(result.mismatched).toBe(true);
  });

  it("returns mismatched=false when no metadata exists (fresh db)", () => {
    const db = createMetadataMockDb();
    // No metadata set -- fresh database
    const result = checkEmbeddingMismatch(db, "all-MiniLM-L6-v2", 384);
    expect(result.mismatched).toBe(false);
  });

  it("returns mismatched=false when only partial metadata exists", () => {
    const db = createMetadataMockDb();
    // Only model set, no dims -- treat as fresh
    setMetadata(db, "embedding_model", "all-MiniLM-L6-v2");
    const result = checkEmbeddingMismatch(db, "all-MiniLM-L6-v2", 384);
    expect(result.mismatched).toBe(false);
  });
});
