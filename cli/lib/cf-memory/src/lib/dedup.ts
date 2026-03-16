import type { MemoryBackend } from "./backend.js";
import type { StoreInput } from "./types.js";

export interface DedupResult {
  isDuplicate: boolean;
  similarId?: string;
  similarity: number;
}

interface DedupOptions {
  threshold?: number;
}

export function textSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0),
    );

  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export async function checkDuplicate(
  backend: MemoryBackend,
  input: StoreInput,
  options?: DedupOptions,
): Promise<DedupResult> {
  const searchScoreThreshold = options?.threshold ?? 0.8;
  const titleThreshold = 0.85;

  // Search by title only — more reliable across all backend tiers
  // (MarkdownBackend uses substring matching, composite queries miss)
  const results = await backend.search({ query: input.title, limit: 5 });

  let maxSimilarity = 0;
  const inputText = input.title + " " + input.description;

  for (const result of results) {
    const resultText =
      result.memory.frontmatter.title +
      " " +
      result.memory.frontmatter.description;

    const titleSim = textSimilarity(
      input.title,
      result.memory.frontmatter.title,
    );
    const overallSim = textSimilarity(inputText, resultText);

    const combinedSim = Math.max(titleSim, overallSim);
    if (combinedSim > maxSimilarity) {
      maxSimilarity = combinedSim;
    }

    if (result.score > searchScoreThreshold && titleSim > titleThreshold) {
      return {
        isDuplicate: true,
        similarId: result.memory.id,
        similarity: combinedSim,
      };
    }
  }

  return { isDuplicate: false, similarity: maxSimilarity };
}
