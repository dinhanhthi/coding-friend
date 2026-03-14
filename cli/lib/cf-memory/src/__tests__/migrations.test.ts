import { describe, it, expect } from "vitest";
import {
  getSchemaVersion,
  migrate,
  applyPragmas,
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
        run(..._params: unknown[]) {
          statements.push(sql);
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
});
