/**
 * SQLite schema definitions for Tier 1 memory backend.
 *
 * Tables:
 * - memories: main table storing memory metadata + content
 * - memories_fts: FTS5 virtual table for full-text search
 * - vec_memories: sqlite-vec virtual table for vector similarity
 * - embedding_cache: content hash → embedding mapping
 * - schema_version: single-row version tracker
 */

/** Current schema version — bump when adding migrations */
export const SCHEMA_VERSION = 1;

/** Embedding dimensions for all-MiniLM-L6-v2 */
export const EMBEDDING_DIMS = 384;

/**
 * SQL statements to create the initial schema (version 1).
 */
export const SCHEMA_V1: string[] = [
  // Version tracking
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  )`,

  // Main memories table
  `CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    importance INTEGER NOT NULL DEFAULT 3,
    created TEXT NOT NULL,
    updated TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'conversation',
    content TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT ''
  )`,

  // Indexes for common queries
  `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash)`,

  // FTS5 virtual table for full-text search (BM25 ranking)
  `CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    title,
    description,
    tags,
    content,
    content=memories,
    content_rowid=rowid,
    tokenize='porter unicode61'
  )`,

  // FTS5 triggers to keep the index in sync
  `CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, title, description, tags, content)
    VALUES (new.rowid, new.title, new.description, new.tags, new.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, description, tags, content)
    VALUES ('delete', old.rowid, old.title, old.description, old.tags, old.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, description, tags, content)
    VALUES ('delete', old.rowid, old.title, old.description, old.tags, old.content);
    INSERT INTO memories_fts(rowid, title, description, tags, content)
    VALUES (new.rowid, new.title, new.description, new.tags, new.content);
  END`,

  // Embedding cache: avoids re-embedding unchanged content
  `CREATE TABLE IF NOT EXISTS embedding_cache (
    content_hash TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    model TEXT NOT NULL,
    created TEXT NOT NULL
  )`,

  // Insert schema version
  `INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION})`,
];

/**
 * PRAGMA settings for optimal performance.
 */
export const PRAGMA_SETTINGS: string[] = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
  "PRAGMA cache_size = -64000", // 64MB cache
  "PRAGMA foreign_keys = ON",
  "PRAGMA temp_store = MEMORY",
  "PRAGMA mmap_size = 268435456", // 256MB mmap
];

/**
 * SQL to create the sqlite-vec virtual table.
 * This is separate because sqlite-vec extension must be loaded first.
 */
export function getVecTableSQL(dims: number = EMBEDDING_DIMS): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
    memory_id TEXT PRIMARY KEY,
    embedding float[${dims}]
  )`;
}
