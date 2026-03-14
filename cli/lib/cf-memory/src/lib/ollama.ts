/**
 * Ollama integration for embedding generation.
 *
 * Provides auto-detection of Ollama availability and model listing.
 */

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_HOST ?? "http://localhost:11434";

/**
 * Check if Ollama is running at the given URL.
 */
export async function isOllamaRunning(
  url: string = DEFAULT_OLLAMA_URL,
): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List available Ollama models.
 */
export async function listOllamaModels(
  url: string = DEFAULT_OLLAMA_URL,
): Promise<string[]> {
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

/**
 * Check if a specific embedding model is available in Ollama.
 */
export async function hasOllamaEmbeddingModel(
  model: string = "all-minilm:l6-v2",
  url: string = DEFAULT_OLLAMA_URL,
): Promise<boolean> {
  const models = await listOllamaModels(url);
  return models.some((m) => m.startsWith(model));
}

/**
 * Auto-detect the best embedding provider.
 *
 * Prefers Ollama if available and has an embedding model,
 * otherwise falls back to Transformers.js.
 */
export async function detectEmbeddingProvider(
  ollamaUrl?: string,
): Promise<{ provider: "ollama" | "transformers"; model?: string }> {
  const url = ollamaUrl ?? DEFAULT_OLLAMA_URL;

  if (await isOllamaRunning(url)) {
    if (await hasOllamaEmbeddingModel("all-minilm:l6-v2", url)) {
      return { provider: "ollama", model: "all-minilm:l6-v2" };
    }
    // Ollama running but no embedding model — use transformers
  }

  return { provider: "transformers" };
}
