/**
 * SQLite schema migrations.
 *
 * Each migration is a function that takes a Database instance and applies
 * the necessary schema changes. Migrations are idempotent.
 */

import {
  SCHEMA_V1,
  SCHEMA_VERSION,
  SCHEMA_V2_METADATA,
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
 * Migrate from schema v1 to v2: add metadata table.
 */
function migrateV1ToV2(db: DatabaseLike): void {
  // better-sqlite3 Database.exec — runs SQL, not shell commands
  db.exec(SCHEMA_V2_METADATA);
  // Insert default embedding metadata (must match DEFAULT_TRANSFORMERS_MODEL)
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run(
    "embedding_model",
    "Xenova/all-MiniLM-L6-v2",
  );
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run(
    "embedding_dims",
    "384",
  );
  // Update schema version
  db.prepare("UPDATE schema_version SET version = ?").run(2);
}

/**
 * Get a metadata value by key. Returns null if not found.
 */
export function getMetadata(db: DatabaseLike, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM metadata WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * Set a metadata key-value pair (insert or update).
 */
export function setMetadata(
  db: DatabaseLike,
  key: string,
  value: string,
): void {
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

/**
 * Check if the current embedding model/dims differ from what is stored.
 * Returns mismatched=false for fresh databases (no metadata yet).
 */
export function checkEmbeddingMismatch(
  db: DatabaseLike,
  currentModel: string,
  currentDims: number,
): {
  mismatched: boolean;
  storedModel: string | null;
  storedDims: number | null;
  currentModel: string;
  currentDims: number;
} {
  const storedModel = getMetadata(db, "embedding_model");
  const storedDimsStr = getMetadata(db, "embedding_dims");
  const storedDims =
    storedDimsStr !== null ? parseInt(storedDimsStr, 10) : null;

  // Fresh database or partial metadata -- not a mismatch
  if (storedModel === null || storedDims === null) {
    return {
      mismatched: false,
      storedModel,
      storedDims,
      currentModel,
      currentDims,
    };
  }

  const mismatched = storedModel !== currentModel || storedDims !== currentDims;

  return {
    mismatched,
    storedModel,
    storedDims,
    currentModel,
    currentDims,
  };
}

/**
 * Try to create the sqlite-vec virtual table.
 * Returns true if successful, false if extension not loaded.
 */
export function createVecTable(db: DatabaseLike, dims?: number): boolean {
  try {
    // better-sqlite3 Database.exec -- runs SQL, not shell commands
    db.exec(getVecTableSQL(dims));
    return true;
  } catch {
    // sqlite-vec extension not loaded -- vector search disabled
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

  if (currentVersion < 2) {
    migrateV1ToV2(db);
  }

  return { version: SCHEMA_VERSION, migrated: true };
}
