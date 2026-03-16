/**
 * SqliteBackend — Tier 1 memory backend with hybrid search.
 *
 * Uses better-sqlite3 for storage, FTS5 for keyword search,
 * sqlite-vec for vector similarity, and RRF for fusion.
 *
 * Markdown files remain the source of truth. SQLite is a derived index
 * that can be rebuilt from markdown at any time.
 *
 * DB path: ~/.coding-friend/memory/projects/{12-char-sha256}/db.sqlite
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { MemoryBackend } from "../../lib/backend.js";
import { MarkdownBackend } from "../markdown.js";
import {
  makeExcerpt,
  type ListInput,
  type Memory,
  type MemoryFrontmatter,
  type MemoryMeta,
  type MemoryStats,
  type MemoryType,
  type SearchInput,
  type SearchResult,
  type StoreInput,
  type UpdateInput,
} from "../../lib/types.js";
import { loadDepSync } from "../../lib/lazy-install.js";
import {
  migrate,
  createVecTable,
  checkEmbeddingMismatch,
  setMetadata,
  type DatabaseLike,
} from "./migrations.js";
import {
  EmbeddingPipeline,
  EmbeddingCache,
  contentHash,
  prepareEmbeddingText,
  type EmbeddingConfig,
} from "./embeddings.js";
import { hybridSearch } from "./search.js";

/**
 * Compute a short hash of the docsDir path for project isolation.
 */
function projectHash(docsDir: string): string {
  return crypto
    .createHash("sha256")
    .update(path.resolve(docsDir))
    .digest("hex")
    .slice(0, 12);
}

export interface SqliteBackendOptions {
  depsDir?: string;
  dbPath?: string;
  embedding?: Partial<EmbeddingConfig>;
  skipVec?: boolean;
}

export class SqliteBackend implements MemoryBackend {
  private db: DatabaseLike;
  private markdown: MarkdownBackend;
  private pipeline: EmbeddingPipeline | null = null;
  private cache: EmbeddingCache | null = null;
  private vecEnabled = false;
  private needsEmbeddingRebuild = false;
  private dbPath: string;

  constructor(
    private docsDir: string,
    opts?: SqliteBackendOptions,
  ) {
    this.markdown = new MarkdownBackend(docsDir);

    // Determine DB path
    if (opts?.dbPath) {
      this.dbPath = opts.dbPath;
    } else {
      const depsDir = opts?.depsDir ?? this.getDefaultDepsDir();
      const hash = projectHash(docsDir);
      const projectDir = path.join(depsDir, "projects", hash);
      fs.mkdirSync(projectDir, { recursive: true });
      this.dbPath = path.join(projectDir, "db.sqlite");
    }

    // Open database using lazily-installed better-sqlite3
    this.db = this.openDatabase(opts?.depsDir);

    // Run migrations
    migrate(this.db);

    // Try to set up vector search
    if (!opts?.skipVec) {
      this.vecEnabled = this.setupVec(opts?.depsDir);
    }

    // Set up embedding pipeline and cache
    if (this.vecEnabled) {
      this.pipeline = new EmbeddingPipeline({
        ...opts?.embedding,
        depsDir: opts?.depsDir,
      });
      this.cache = new EmbeddingCache(this.db);

      // Check if embedding model changed
      const mismatch = checkEmbeddingMismatch(
        this.db,
        this.pipeline.modelName,
        this.pipeline.dims,
      );
      if (mismatch.mismatched) {
        process.stderr.write(
          `[cf-memory] Embedding model changed: ${mismatch.storedModel} (${mismatch.storedDims}d) → ${mismatch.currentModel} (${mismatch.currentDims}d)\n` +
            `[cf-memory] Vector search disabled. Run "cf memory rebuild" to re-embed.\n`,
        );
        this.vecEnabled = false;
        this.needsEmbeddingRebuild = true;
      }
    }
  }

  private getDefaultDepsDir(): string {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
    return path.join(home, ".coding-friend", "memory");
  }

  private openDatabase(depsDir?: string): DatabaseLike {
    const Database = loadDepSync<{ new (path: string): DatabaseLike }>(
      "better-sqlite3",
      depsDir,
    );
    // better-sqlite3 exports the class as default in CJS
    const DbConstructor =
      (Database as unknown as { default: { new (path: string): DatabaseLike } })
        .default ?? Database;
    return new DbConstructor(this.dbPath);
  }

  private setupVec(depsDir?: string): boolean {
    try {
      const sqliteVec = loadDepSync<{ load: (db: unknown) => void }>(
        "sqlite-vec",
        depsDir,
      );
      const loader =
        (sqliteVec as unknown as { default: { load: (db: unknown) => void } })
          .default ?? sqliteVec;
      loader.load(this.db);
      return createVecTable(this.db);
    } catch {
      return false;
    }
  }

  getDbPath(): string {
    return this.dbPath;
  }

  isVecEnabled(): boolean {
    return this.vecEnabled;
  }

  isRebuildNeeded(): boolean {
    return this.needsEmbeddingRebuild;
  }

  async store(input: StoreInput): Promise<Memory> {
    // 1. Store to markdown (source of truth)
    const memory = await this.markdown.store(input);

    // 2. Index in SQLite
    const hash = contentHash(
      prepareEmbeddingText({
        title: memory.frontmatter.title,
        description: memory.frontmatter.description,
        tags: memory.frontmatter.tags,
        content: memory.content,
      }),
    );

    this.upsertRow(memory, hash);

    // 3. Generate and store embedding (async, non-blocking for store)
    if (this.vecEnabled && this.pipeline) {
      this.embedAndStore(memory.id, memory, hash).catch((err) => {
        process.stderr.write(
          `[cf-memory] Embedding failed for ${memory.id}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });
    }

    return memory;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const query = input.query?.trim();

    if (!query) {
      const metas = await this.list({ type: input.type, limit: input.limit });
      return metas.map((m) => ({ memory: m, score: 0, matchedOn: [] }));
    }

    const limit = input.limit ?? 10;

    const ranked = await hybridSearch({
      db: this.db,
      query,
      limit,
      pipeline: this.pipeline,
      vecEnabled: this.vecEnabled,
      typeFilter: input.type,
    });

    // Convert ranked results to SearchResult format
    const results: SearchResult[] = [];
    for (const r of ranked) {
      const row = this.getRow(r.id);
      if (!row) continue;

      // Apply tag filter
      if (input.tags && input.tags.length > 0) {
        const rowTags = JSON.parse(row.tags as string) as string[];
        const lowerTags = input.tags.map((t) => t.toLowerCase());
        if (
          !lowerTags.some((lt) => rowTags.some((rt) => rt.toLowerCase() === lt))
        ) {
          continue;
        }
      }

      const frontmatter = this.rowToFrontmatter(row);
      results.push({
        memory: {
          id: String(row.id),
          slug: String(row.slug),
          category: String(row.category),
          frontmatter,
          excerpt: makeExcerpt(String(row.content)),
        },
        score: r.score,
        matchedOn: r.matchedOn,
      });
    }

    return results;
  }

  async retrieve(id: string): Promise<Memory | null> {
    // Read from markdown (source of truth)
    return this.markdown.retrieve(id);
  }

  async list(input: ListInput): Promise<MemoryMeta[]> {
    let sql = "SELECT * FROM memories WHERE 1=1";
    const params: unknown[] = [];

    if (input.type) {
      sql += " AND type = ?";
      params.push(input.type);
    }

    if (input.category) {
      sql += " AND category = ?";
      params.push(input.category);
    }

    sql += " ORDER BY updated DESC";

    const limit = input.limit ?? 50;
    sql += " LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = (
      stmt as unknown as {
        all(...p: unknown[]): Array<Record<string, unknown>>;
      }
    ).all(...params);

    return rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      category: String(row.category),
      frontmatter: this.rowToFrontmatter(row),
      excerpt: makeExcerpt(String(row.content)),
    }));
  }

  async update(input: UpdateInput): Promise<Memory | null> {
    // 1. Update markdown (source of truth)
    const memory = await this.markdown.update(input);
    if (!memory) return null;

    // 2. Re-index in SQLite
    const hash = contentHash(
      prepareEmbeddingText({
        title: memory.frontmatter.title,
        description: memory.frontmatter.description,
        tags: memory.frontmatter.tags,
        content: memory.content,
      }),
    );

    this.upsertRow(memory, hash);

    // 3. Re-embed
    if (this.vecEnabled && this.pipeline) {
      this.embedAndStore(memory.id, memory, hash).catch((err) => {
        process.stderr.write(
          `[cf-memory] Embedding failed for ${memory.id}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });
    }

    return memory;
  }

  async delete(id: string): Promise<boolean> {
    // 1. Delete from markdown
    const deleted = await this.markdown.delete(id);
    if (!deleted) return false;

    // 2. Remove from SQLite
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);

    // 3. Remove from vec table
    if (this.vecEnabled) {
      try {
        this.db.prepare("DELETE FROM vec_memories WHERE memory_id = ?").run(id);
      } catch {
        // Ignore vec errors
      }
    }

    return true;
  }

  async stats(): Promise<MemoryStats> {
    const rows = (
      this.db.prepare(
        "SELECT category, type, COUNT(*) as count FROM memories GROUP BY category, type",
      ) as unknown as {
        all(): Array<{ category: string; type: string; count: number }>;
      }
    ).all();

    const byCategory: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let total = 0;

    for (const row of rows) {
      byCategory[row.category] = (byCategory[row.category] ?? 0) + row.count;
      byType[row.type] = (byType[row.type] ?? 0) + row.count;
      total += row.count;
    }

    return { total, byCategory, byType };
  }

  /**
   * Rebuild the SQLite index from markdown files.
   *
   * Two-pass approach:
   * 1. Synchronous transaction: clear + re-insert all rows (atomic)
   * 2. Async pass: generate embeddings (non-transactional, failures logged)
   */
  async rebuild(): Promise<void> {
    // If embedding model changed, recreate vec table with new dimensions
    if (this.needsEmbeddingRebuild && this.pipeline) {
      try {
        this.db.prepare("DROP TABLE IF EXISTS vec_memories").run();
        createVecTable(this.db, this.pipeline.dims);
        this.vecEnabled = true;
      } catch {
        // Vec setup failed
      }
    }

    // Read all markdown files first
    const metas = this.markdown.getAllMeta();
    const memories: Array<{ memory: Memory; hash: string }> = [];

    for (const meta of metas) {
      const full = await this.markdown.retrieve(meta.id);
      if (!full) continue;

      const hash = contentHash(
        prepareEmbeddingText({
          title: full.frontmatter.title,
          description: full.frontmatter.description,
          tags: full.frontmatter.tags,
          content: full.content,
        }),
      );
      memories.push({ memory: full, hash });
    }

    // Pass 1: Atomic transaction for all SQLite rows
    this.db.prepare("BEGIN").run();
    try {
      this.db.prepare("DELETE FROM memories").run();
      if (this.vecEnabled) {
        try {
          this.db.prepare("DELETE FROM vec_memories").run();
        } catch {
          // Ignore if vec table doesn't exist
        }
      }
      this.db.prepare("DELETE FROM embedding_cache").run();

      for (const { memory, hash } of memories) {
        this.upsertRow(memory, hash);
      }

      this.db.prepare("COMMIT").run();
    } catch (err) {
      this.db.prepare("ROLLBACK").run();
      throw err;
    }

    // Pass 2: Async embedding generation (non-transactional)
    if (this.vecEnabled && this.pipeline) {
      for (const { memory, hash } of memories) {
        try {
          await this.embedAndStore(memory.id, memory, hash);
        } catch (err) {
          process.stderr.write(
            `[cf-memory] Embedding failed for ${memory.id}: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }
    }

    // Update metadata with current embedding model info
    if (this.pipeline) {
      setMetadata(this.db, "embedding_model", this.pipeline.modelName);
      setMetadata(this.db, "embedding_dims", String(this.pipeline.dims));
      this.needsEmbeddingRebuild = false;
    }
  }

  async close(): Promise<void> {
    try {
      (this.db as unknown as { close(): void }).close();
    } catch {
      // Already closed
    }
  }

  // --- Private helpers ---

  private upsertRow(memory: Memory, hash: string): void {
    const sql = `
      INSERT OR REPLACE INTO memories
        (id, slug, category, title, description, type, tags, importance, created, updated, source, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db
      .prepare(sql)
      .run(
        memory.id,
        memory.slug,
        memory.category,
        memory.frontmatter.title,
        memory.frontmatter.description,
        memory.frontmatter.type,
        JSON.stringify(memory.frontmatter.tags),
        memory.frontmatter.importance,
        memory.frontmatter.created,
        memory.frontmatter.updated,
        memory.frontmatter.source,
        memory.content,
        hash,
      );
  }

  private getRow(id: string): Record<string, unknown> | null {
    return (
      (
        this.db.prepare("SELECT * FROM memories WHERE id = ?") as unknown as {
          get(id: string): Record<string, unknown> | undefined;
        }
      ).get(id) ?? null
    );
  }

  private rowToFrontmatter(row: Record<string, unknown>): MemoryFrontmatter {
    return {
      title: String(row.title),
      description: String(row.description),
      type: String(row.type) as MemoryType,
      tags: JSON.parse(String(row.tags ?? "[]")),
      importance: Number(row.importance ?? 3),
      created: String(row.created),
      updated: String(row.updated),
      source: String(row.source ?? "conversation"),
    };
  }

  private async embedAndStore(
    id: string,
    memory: Memory,
    hash: string,
  ): Promise<void> {
    if (!this.pipeline || !this.cache) return;

    // Check cache first
    let embedding = this.cache.get(hash, this.pipeline.dims);
    if (!embedding) {
      const text = prepareEmbeddingText({
        title: memory.frontmatter.title,
        description: memory.frontmatter.description,
        tags: memory.frontmatter.tags,
        content: memory.content,
      });
      embedding = await this.pipeline.embed(text);
      this.cache.set(hash, embedding, this.pipeline.modelName);
    }

    // Store in vec table — use byteOffset/byteLength for correct Float32Array handling
    const buffer = Buffer.from(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength,
    );
    try {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO vec_memories (memory_id, embedding) VALUES (?, ?)",
        )
        .run(id, buffer);
    } catch {
      // sqlite-vec error — ignore
    }
  }
}
