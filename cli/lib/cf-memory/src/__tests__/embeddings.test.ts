import { describe, it, expect, vi } from "vitest";
import {
  contentHash,
  prepareEmbeddingText,
  MODEL_DIMS,
  DEFAULT_EMBEDDING_DIMS,
  resolveModelDims,
  EmbeddingPipeline,
  EmbeddingCache,
} from "../backends/sqlite/embeddings.js";
import type { DatabaseLike } from "../backends/sqlite/migrations.js";

describe("contentHash()", () => {
  it("returns a 16-character hex string", () => {
    const hash = contentHash("hello world");
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns consistent hashes for the same input", () => {
    const h1 = contentHash("test content");
    const h2 = contentHash("test content");
    expect(h1).toBe(h2);
  });

  it("returns different hashes for different inputs", () => {
    const h1 = contentHash("content A");
    const h2 = contentHash("content B");
    expect(h1).not.toBe(h2);
  });
});

describe("prepareEmbeddingText()", () => {
  it("combines title, description, tags, and content", () => {
    const text = prepareEmbeddingText({
      title: "API Auth",
      description: "JWT tokens in httpOnly cookies",
      tags: ["auth", "jwt"],
      content: "The project uses JWT.",
    });

    expect(text).toContain("API Auth");
    expect(text).toContain("JWT tokens");
    expect(text).toContain("auth jwt");
    expect(text).toContain("The project uses JWT.");
  });

  it("handles empty tags", () => {
    const text = prepareEmbeddingText({
      title: "Title",
      description: "Desc",
      tags: [],
      content: "Content",
    });

    expect(text).toContain("Title");
    expect(text).toContain("Desc");
    expect(text).toContain("Content");
  });

  it("truncates long content to ~2000 chars", () => {
    const longContent = "a".repeat(5000);
    const text = prepareEmbeddingText({
      title: "T",
      description: "D",
      tags: [],
      content: longContent,
    });

    // Content portion should be truncated
    expect(text.length).toBeLessThan(2200);
  });

  it("filters empty fields", () => {
    const text = prepareEmbeddingText({
      title: "Title",
      description: "",
      tags: [],
      content: "Content",
    });

    // Should not have double newlines from empty fields
    expect(text).not.toContain("\n\n\n");
  });
});

describe("MODEL_DIMS", () => {
  it("contains transformers.js model entries", () => {
    expect(MODEL_DIMS["Xenova/all-MiniLM-L6-v2"]).toBe(384);
    expect(MODEL_DIMS["Xenova/all-MiniLM-L12-v2"]).toBe(384);
  });

  it("contains ollama model entries", () => {
    expect(MODEL_DIMS["all-minilm:l6-v2"]).toBe(384);
    expect(MODEL_DIMS["all-minilm"]).toBe(384);
    expect(MODEL_DIMS["nomic-embed-text"]).toBe(768);
    expect(MODEL_DIMS["mxbai-embed-large"]).toBe(1024);
  });

  it("contains snowflake-arctic-embed variants", () => {
    expect(MODEL_DIMS["snowflake-arctic-embed:s"]).toBe(384);
    expect(MODEL_DIMS["snowflake-arctic-embed:m"]).toBe(768);
    expect(MODEL_DIMS["snowflake-arctic-embed:l"]).toBe(1024);
  });

  it("contains bge model variants", () => {
    expect(MODEL_DIMS["bge-small-en-v1.5"]).toBe(384);
    expect(MODEL_DIMS["bge-base-en-v1.5"]).toBe(768);
    expect(MODEL_DIMS["bge-large-en-v1.5"]).toBe(1024);
  });
});

describe("DEFAULT_EMBEDDING_DIMS", () => {
  it("is 384", () => {
    expect(DEFAULT_EMBEDDING_DIMS).toBe(384);
  });
});

describe("resolveModelDims()", () => {
  it("returns correct dims for known transformers model", () => {
    expect(resolveModelDims("Xenova/all-MiniLM-L6-v2", "transformers")).toBe(
      384,
    );
  });

  it("returns correct dims for known ollama model", () => {
    expect(resolveModelDims("nomic-embed-text", "ollama")).toBe(768);
  });

  it("returns correct dims for mxbai-embed-large", () => {
    expect(resolveModelDims("mxbai-embed-large", "ollama")).toBe(1024);
  });

  it("returns default 384 for undefined model", () => {
    expect(resolveModelDims(undefined, "transformers")).toBe(384);
  });

  it("returns default 384 for unknown model and logs warning", () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const dims = resolveModelDims("some-unknown-model", "ollama");
    expect(dims).toBe(384);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("some-unknown-model"),
    );
    stderrSpy.mockRestore();
  });
});

describe("EmbeddingPipeline.dims", () => {
  it("returns 384 for default transformers config", () => {
    const pipeline = new EmbeddingPipeline();
    expect(pipeline.dims).toBe(384);
  });

  it("returns 384 for default ollama config", () => {
    const pipeline = new EmbeddingPipeline({ provider: "ollama" });
    expect(pipeline.dims).toBe(384);
  });

  it("returns 768 for nomic-embed-text ollama model", () => {
    const pipeline = new EmbeddingPipeline({
      provider: "ollama",
      model: "nomic-embed-text",
    });
    expect(pipeline.dims).toBe(768);
  });

  it("returns 1024 for mxbai-embed-large ollama model", () => {
    const pipeline = new EmbeddingPipeline({
      provider: "ollama",
      model: "mxbai-embed-large",
    });
    expect(pipeline.dims).toBe(1024);
  });
});

describe("EmbeddingPipeline.modelName", () => {
  it("returns default transformers model when no model specified", () => {
    const pipeline = new EmbeddingPipeline();
    expect(pipeline.modelName).toBe("Xenova/all-MiniLM-L6-v2");
  });

  it("returns default ollama model when no model specified", () => {
    const pipeline = new EmbeddingPipeline({ provider: "ollama" });
    expect(pipeline.modelName).toBe("all-minilm:l6-v2");
  });

  it("returns configured model name", () => {
    const pipeline = new EmbeddingPipeline({
      provider: "ollama",
      model: "nomic-embed-text",
    });
    expect(pipeline.modelName).toBe("nomic-embed-text");
  });
});

describe("EmbeddingCache.get() with dims parameter", () => {
  function createMockCacheDb(embeddingData?: {
    hash: string;
    embedding: Buffer;
  }): DatabaseLike {
    return {
      exec() {},
      pragma() {
        return undefined;
      },
      prepare(sql: string) {
        return {
          get(...params: unknown[]) {
            if (
              sql.includes("SELECT embedding FROM embedding_cache") &&
              embeddingData &&
              params[0] === embeddingData.hash
            ) {
              return { embedding: embeddingData.embedding };
            }
            return undefined;
          },
          run() {
            return {};
          },
        };
      },
    };
  }

  it("returns Float32Array with specified dims", () => {
    const dims = 768;
    const floats = new Float32Array(dims);
    for (let i = 0; i < dims; i++) floats[i] = i * 0.001;
    const buffer = Buffer.from(
      floats.buffer,
      floats.byteOffset,
      floats.byteLength,
    );

    const db = createMockCacheDb({ hash: "testhash", embedding: buffer });
    const cache = new EmbeddingCache(db);
    const result = cache.get("testhash", dims);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(dims);
    expect(result![0]).toBeCloseTo(0);
    expect(result![1]).toBeCloseTo(0.001);
  });

  it("returns null for missing hash", () => {
    const db = createMockCacheDb();
    const cache = new EmbeddingCache(db);
    const result = cache.get("missinghash", 384);
    expect(result).toBeNull();
  });

  it("works with 384 dims", () => {
    const dims = 384;
    const floats = new Float32Array(dims);
    floats[0] = 1.0;
    const buffer = Buffer.from(
      floats.buffer,
      floats.byteOffset,
      floats.byteLength,
    );

    const db = createMockCacheDb({ hash: "hash384", embedding: buffer });
    const cache = new EmbeddingCache(db);
    const result = cache.get("hash384", dims);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(384);
    expect(result![0]).toBeCloseTo(1.0);
  });

  it("returns null when cached buffer is smaller than requested dims", () => {
    // Simulate stale cache: 384-dim embedding cached, but requesting 768 dims
    const smallDims = 384;
    const floats = new Float32Array(smallDims);
    floats[0] = 1.0;
    const buffer = Buffer.from(
      floats.buffer,
      floats.byteOffset,
      floats.byteLength,
    );

    const db = createMockCacheDb({ hash: "stale", embedding: buffer });
    const cache = new EmbeddingCache(db);
    const result = cache.get("stale", 768);

    expect(result).toBeNull();
  });
});
