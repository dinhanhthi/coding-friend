/**
 * SQLite schema migrations.
 *
 * Each migration is a function that takes a Database instance and applies
 * the necessary schema changes. Migrations are idempotent.
 */

import {
  SCHEMA_V1,
  SCHEMA_VERSION,
  PRAGMA_SETTINGS,
  getVecTableSQL,
} from "./schema.js";

export type DatabaseLike = {
  // better-sqlite3's exec method — runs SQL, NOT child_process.exec
  exec(sql: string): void;
  pragma(pragma: string): unknown;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
};

/**
 * Get the current schema version from the database.
 * Returns 0 if the schema hasn't been initialized yet.
 */
export function getSchemaVersion(db: DatabaseLike): number {
  try {
    const row = db
      .prepare("SELECT version FROM schema_version LIMIT 1")
      .get() as { version: number } | undefined;
    return row?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Apply PRAGMA settings for performance.
 */
export function applyPragmas(db: DatabaseLike): void {
  for (const pragma of PRAGMA_SETTINGS) {
    db.exec(pragma);
  }
}

/**
 * Initialize the schema from scratch (version 0 → 1).
 */
function migrateV0ToV1(db: DatabaseLike): void {
  for (const sql of SCHEMA_V1) {
    db.exec(sql);
  }
}

/**
 * Try to create the sqlite-vec virtual table.
 * Returns true if successful, false if extension not loaded.
 */
export function createVecTable(db: DatabaseLike): boolean {
  try {
    db.exec(getVecTableSQL());
    return true;
  } catch {
    // sqlite-vec extension not loaded — vector search disabled
    return false;
  }
}

/**
 * Run all necessary migrations to bring the database to the current version.
 *
 * This is idempotent: running it multiple times on the same database
 * produces the same result.
 */
export function migrate(db: DatabaseLike): {
  version: number;
  migrated: boolean;
} {
  applyPragmas(db);

  const currentVersion = getSchemaVersion(db);

  if (currentVersion >= SCHEMA_VERSION) {
    return { version: currentVersion, migrated: false };
  }

  // Apply migrations in order
  if (currentVersion < 1) {
    migrateV0ToV1(db);
  }

  // Future migrations would go here:
  // if (currentVersion < 2) migrateV1ToV2(db);

  return { version: SCHEMA_VERSION, migrated: true };
}
