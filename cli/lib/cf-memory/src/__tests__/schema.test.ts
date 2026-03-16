import { describe, it, expect } from "vitest";
import {
  SCHEMA_V1,
  SCHEMA_VERSION,
  PRAGMA_SETTINGS,
  EMBEDDING_DIMS,
  SCHEMA_V2_METADATA,
  getVecTableSQL,
} from "../backends/sqlite/schema.js";

describe("Schema constants", () => {
  it("SCHEMA_VERSION is 2", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("EMBEDDING_DIMS is 384 (all-MiniLM-L6-v2)", () => {
    expect(EMBEDDING_DIMS).toBe(384);
  });

  it("SCHEMA_V1 contains all required table creation statements", () => {
    const combined = SCHEMA_V1.join(" ");

    // Main tables
    expect(combined).toContain("CREATE TABLE IF NOT EXISTS schema_version");
    expect(combined).toContain("CREATE TABLE IF NOT EXISTS memories");
    expect(combined).toContain("CREATE TABLE IF NOT EXISTS embedding_cache");

    // FTS5 virtual table
    expect(combined).toContain(
      "CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5",
    );

    // FTS5 sync triggers
    expect(combined).toContain("CREATE TRIGGER IF NOT EXISTS memories_ai");
    expect(combined).toContain("CREATE TRIGGER IF NOT EXISTS memories_ad");
    expect(combined).toContain("CREATE TRIGGER IF NOT EXISTS memories_au");

    // Indexes
    expect(combined).toContain("CREATE INDEX IF NOT EXISTS idx_memories_type");
    expect(combined).toContain(
      "CREATE INDEX IF NOT EXISTS idx_memories_category",
    );
    expect(combined).toContain(
      "CREATE INDEX IF NOT EXISTS idx_memories_updated",
    );
    expect(combined).toContain(
      "CREATE INDEX IF NOT EXISTS idx_memories_content_hash",
    );
  });

  it("memories table has all required columns", () => {
    const memoriesTable = SCHEMA_V1.find((s) =>
      s.includes("CREATE TABLE IF NOT EXISTS memories"),
    )!;

    const requiredColumns = [
      "id TEXT PRIMARY KEY",
      "slug TEXT NOT NULL",
      "category TEXT NOT NULL",
      "title TEXT NOT NULL",
      "description TEXT NOT NULL",
      "type TEXT NOT NULL",
      "tags TEXT NOT NULL",
      "importance INTEGER NOT NULL",
      "created TEXT NOT NULL",
      "updated TEXT NOT NULL",
      "source TEXT NOT NULL",
      "content TEXT NOT NULL",
      "content_hash TEXT NOT NULL",
    ];

    for (const col of requiredColumns) {
      expect(memoriesTable).toContain(col);
    }
  });

  it("FTS5 table uses porter tokenizer", () => {
    const ftsTable = SCHEMA_V1.find((s) => s.includes("memories_fts"))!;
    expect(ftsTable).toContain("tokenize='porter unicode61'");
  });

  it("embedding_cache table has required columns", () => {
    const cacheTable = SCHEMA_V1.find((s) =>
      s.includes("CREATE TABLE IF NOT EXISTS embedding_cache"),
    )!;
    expect(cacheTable).toContain("content_hash TEXT PRIMARY KEY");
    expect(cacheTable).toContain("embedding BLOB NOT NULL");
    expect(cacheTable).toContain("model TEXT NOT NULL");
  });
});

describe("PRAGMA_SETTINGS", () => {
  it("enables WAL mode", () => {
    expect(PRAGMA_SETTINGS).toContain("PRAGMA journal_mode = WAL");
  });

  it("sets synchronous to NORMAL", () => {
    expect(PRAGMA_SETTINGS).toContain("PRAGMA synchronous = NORMAL");
  });

  it("sets cache size", () => {
    const cachePragma = PRAGMA_SETTINGS.find((p) => p.includes("cache_size"));
    expect(cachePragma).toBeDefined();
  });
});

describe("getVecTableSQL()", () => {
  it("creates vec0 table with default dims", () => {
    const sql = getVecTableSQL();
    expect(sql).toContain(
      "CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0",
    );
    expect(sql).toContain("float[384]");
  });

  it("supports custom dimensions", () => {
    const sql = getVecTableSQL(768);
    expect(sql).toContain("float[768]");
  });
});

describe("SCHEMA_V2_METADATA", () => {
  it("creates metadata table with key-value structure", () => {
    expect(SCHEMA_V2_METADATA).toContain("CREATE TABLE IF NOT EXISTS metadata");
    expect(SCHEMA_V2_METADATA).toContain("key TEXT PRIMARY KEY");
    expect(SCHEMA_V2_METADATA).toContain("value TEXT NOT NULL");
  });
});
