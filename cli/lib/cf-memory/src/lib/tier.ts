import type { MemoryBackend } from "./backend.js";
import { DaemonClient } from "./daemon-client.js";
import { MarkdownBackend } from "../backends/markdown.js";
import { getDaemonPaths, isDaemonRunning } from "../daemon/process.js";

export type TierName = "full" | "lite" | "markdown";
export type TierConfig = "auto" | TierName;

export interface TierInfo {
  name: TierName;
  label: string;
  number: 1 | 2 | 3;
}

export const TIERS: Record<TierName, TierInfo> = {
  full: { name: "full", label: "Tier 1 (SQLite + Hybrid)", number: 1 },
  lite: { name: "lite", label: "Tier 2 (MiniSearch + Daemon)", number: 2 },
  markdown: { name: "markdown", label: "Tier 3 (Markdown)", number: 3 },
};

/**
 * Detect the best available tier.
 *
 * Priority: SQLite (Tier 1) → Daemon running (Tier 2) → Markdown (Tier 3)
 */
export async function detectTier(configTier?: TierConfig): Promise<TierInfo> {
  // Explicit config override
  if (configTier && configTier !== "auto") {
    return TIERS[configTier];
  }

  // TODO Phase 3: check if SQLite deps are available → Tier 1

  // Check if daemon is running → Tier 2
  if (await isDaemonRunning()) {
    return TIERS.lite;
  }

  // Default: Tier 3
  return TIERS.markdown;
}

/**
 * Create the appropriate backend for the detected tier.
 */
export async function createBackendForTier(
  docsDir: string,
  configTier?: TierConfig,
): Promise<{ backend: MemoryBackend; tier: TierInfo }> {
  const tier = await detectTier(configTier);

  switch (tier.name) {
    case "lite": {
      // Use daemon client
      const paths = getDaemonPaths();
      const client = new DaemonClient(paths.socketPath);
      const alive = await client.ping();
      if (alive) {
        return { backend: client, tier };
      }
      // Daemon not reachable, fall back to Tier 3
      return {
        backend: new MarkdownBackend(docsDir),
        tier: TIERS.markdown,
      };
    }
    // TODO Phase 3: case "full" → SqliteBackend
    case "full":
    case "markdown":
    default:
      return {
        backend: new MarkdownBackend(docsDir),
        tier: TIERS.markdown,
      };
  }
}
