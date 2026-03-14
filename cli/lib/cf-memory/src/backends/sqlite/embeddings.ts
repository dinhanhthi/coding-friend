/**
 * Embedding pipeline for semantic search.
 *
 * Supports two providers:
 * - Transformers.js (local, default): all-MiniLM-L6-v2, 384 dims
 * - Ollama (optional): configurable model, auto-detect availability
 *
 * Embeddings are cached by content hash in the SQLite embedding_cache table.
 */
import crypto from "node:crypto";
import { EMBEDDING_DIMS } from "./schema.js";
import type { DatabaseLike } from "./migrations.js";

export type EmbeddingProvider = "transformers" | "ollama";

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model?: string;
  ollamaUrl?: string;
  depsDir?: string;
}

const DEFAULT_TRANSFORMERS_MODEL = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_OLLAMA_MODEL = "all-minilm:l6-v2";
const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/**
 * Compute a content hash for embedding cache lookups.
 */
export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Prepare text for embedding: combine title + description + tags + content.
 */
export function prepareEmbeddingText(fields: {
  title: string;
  description: string;
  tags: string[];
  content: string;
}): string {
  return [
    fields.title,
    fields.description,
    fields.tags.join(" "),
    fields.content.slice(0, 2000), // Truncate long content
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * EmbeddingPipeline — lazy-loads the model and generates embeddings.
 */
export class EmbeddingPipeline {
  private config: EmbeddingConfig;
  private pipeline: unknown = null;
  private loading: Promise<void> | null = null;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      provider: config?.provider ?? "transformers",
      model: config?.model,
      ollamaUrl: config?.ollamaUrl,
      depsDir: config?.depsDir,
    };
  }

  /**
   * Get the expected embedding dimensions.
   */
  get dims(): number {
    return EMBEDDING_DIMS;
  }

  /**
   * Lazy-load the embedding model.
   */
  private async ensureModel(): Promise<void> {
    if (this.pipeline) return;
    if (this.loading) {
      await this.loading;
      return;
    }

    this.loading = this.loadModel();
    await this.loading;
  }

  private async loadModel(): Promise<void> {
    if (this.config.provider === "ollama") {
      // Ollama doesn't need model preloading — it's server-side
      this.pipeline = "ollama";
      return;
    }

    // Load Transformers.js from lazy-installed deps
    const { loadDepAsync } = await import("../../lib/lazy-install.js");
    const transformers = await loadDepAsync<{
      pipeline: (
        task: string,
        model: string,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
    }>("@huggingface/transformers", this.config.depsDir);

    const model = this.config.model ?? DEFAULT_TRANSFORMERS_MODEL;

    this.pipeline = await transformers.pipeline("feature-extraction", model, {
      dtype: "fp32",
    });
  }

  /**
   * Generate an embedding for the given text.
   *
   * Returns a Float32Array of EMBEDDING_DIMS dimensions.
   */
  async embed(text: string): Promise<Float32Array> {
    await this.ensureModel();

    if (this.config.provider === "ollama") {
      return this.embedWithOllama(text);
    }

    return this.embedWithTransformers(text);
  }

  private async embedWithTransformers(text: string): Promise<Float32Array> {
    const pipe = this.pipeline as (
      text: string,
      options: { pooling: string; normalize: boolean },
    ) => Promise<{ data: Float32Array }>;

    const result = await pipe(text, {
      pooling: "mean",
      normalize: true,
    });

    return new Float32Array(result.data);
  }

  private async embedWithOllama(text: string): Promise<Float32Array> {
    const url = this.config.ollamaUrl ?? DEFAULT_OLLAMA_URL;
    const model = this.config.model ?? DEFAULT_OLLAMA_MODEL;

    const response = await fetch(`${url}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    return new Float32Array(data.embedding);
  }

  /**
   * Check if Ollama is available at the configured URL.
   */
  async isOllamaAvailable(): Promise<boolean> {
    const url = this.config.ollamaUrl ?? DEFAULT_OLLAMA_URL;
    try {
      const response = await fetch(`${url}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Embedding cache operations — backed by SQLite.
 */
export class EmbeddingCache {
  constructor(private db: DatabaseLike) {}

  /**
   * Get a cached embedding by content hash.
   */
  get(hash: string): Float32Array | null {
    const row = this.db
      .prepare("SELECT embedding FROM embedding_cache WHERE content_hash = ?")
      .get(hash) as { embedding: Buffer } | undefined;

    if (!row) return null;
    // Copy to a fresh Buffer to avoid alignment issues with pooled ArrayBuffers
    const buf = Buffer.from(row.embedding);
    return new Float32Array(buf.buffer, buf.byteOffset, EMBEDDING_DIMS);
  }

  /**
   * Store an embedding in the cache.
   */
  set(hash: string, embedding: Float32Array, model: string): void {
    // Use byteOffset + byteLength to handle Float32Array views correctly
    const buffer = Buffer.from(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength,
    );
    this.db
      .prepare(
        "INSERT OR REPLACE INTO embedding_cache (content_hash, embedding, model, created) VALUES (?, ?, ?, ?)",
      )
      .run(hash, buffer, model, new Date().toISOString());
  }

  /**
   * Check if a hash exists in the cache.
   */
  has(hash: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM embedding_cache WHERE content_hash = ? LIMIT 1")
      .get(hash);
    return !!row;
  }

  /**
   * Remove an entry from the cache.
   */
  delete(hash: string): void {
    this.db
      .prepare("DELETE FROM embedding_cache WHERE content_hash = ?")
      .run(hash);
  }
}
