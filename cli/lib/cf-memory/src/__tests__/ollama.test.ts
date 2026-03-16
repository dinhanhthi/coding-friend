import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isOllamaRunning,
  listOllamaModels,
  hasOllamaEmbeddingModel,
  detectEmbeddingProvider,
} from "../lib/ollama.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isOllamaRunning()", () => {
  it("returns false when Ollama is not running", async () => {
    // Use a port that's very unlikely to be in use
    const result = await isOllamaRunning("http://localhost:19999");
    expect(result).toBe(false);
  });

  it("handles network errors gracefully", async () => {
    const result = await isOllamaRunning("http://invalid-host-xyz:11434");
    expect(result).toBe(false);
  });
});

describe("listOllamaModels()", () => {
  it("returns empty array when Ollama is not running", async () => {
    const models = await listOllamaModels("http://localhost:19999");
    expect(models).toEqual([]);
  });
});

describe("hasOllamaEmbeddingModel()", () => {
  it("returns false when Ollama is not running", async () => {
    const has = await hasOllamaEmbeddingModel(
      "all-minilm:l6-v2",
      "http://localhost:19999",
    );
    expect(has).toBe(false);
  });
});

describe("detectEmbeddingProvider()", () => {
  it("falls back to transformers when Ollama is not available", async () => {
    const result = await detectEmbeddingProvider("http://localhost:19999");
    expect(result.provider).toBe("transformers");
  });
});
