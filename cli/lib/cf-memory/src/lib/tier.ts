import type { MemoryBackend } from "./backend.js";
import { DaemonClient } from "./daemon-client.js";
import { MarkdownBackend } from "../backends/markdown.js";
import {
  getDaemonPaths,
  isDaemonRunning,
  spawnDaemon,
} from "../daemon/process.js";
import { areSqliteDepsAvailable } from "./lazy-install.js";
import type { EmbeddingConfig } from "../backends/sqlite/embeddings.js";
import type { SqliteBackendOptions } from "../backends/sqlite/index.js";

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

  // Check if SQLite deps are available → Tier 1
  if (areSqliteDepsAvailable()) {
    return TIERS.full;
  }

  // Check if daemon is running → Tier 2
  if (await isDaemonRunning()) {
    return TIERS.lite;
  }

  // Default: Tier 3
  return TIERS.markdown;
}

/** Build a respawn callback that DaemonClient can call when the daemon is gone. */
function makeRespawn(
  docsDir: string,
  embeddingConfig?: Partial<EmbeddingConfig>,
  idleTimeoutMs?: number,
): () => Promise<boolean> {
  return async () => {
    const result = await spawnDaemon(docsDir, embeddingConfig, {
      idleTimeoutMs,
    });
    return result !== null;
  };
}

/**
 * Create the appropriate backend for the detected tier.
 */
export async function createBackendForTier(
  docsDir: string,
  configTier?: TierConfig,
  embeddingConfig?: Partial<EmbeddingConfig>,
  sqliteOptions?: Pick<SqliteBackendOptions, "dbPath">,
  daemonOptions?: { idleTimeoutMs?: number },
): Promise<{ backend: MemoryBackend; tier: TierInfo }> {
  const tier = await detectTier(configTier);
  const respawn = makeRespawn(
    docsDir,
    embeddingConfig,
    daemonOptions?.idleTimeoutMs,
  );

  switch (tier.name) {
    case "full": {
      // Try to create SqliteBackend, fall back if it fails
      try {
        const { SqliteBackend } = await import("../backends/sqlite/index.js");
        const backend = new SqliteBackend(docsDir, {
          ...(embeddingConfig ? { embedding: embeddingConfig } : {}),
          ...sqliteOptions,
        });
        return { backend, tier };
      } catch {
        // SQLite backend failed — fall through to daemon or markdown
        if (await isDaemonRunning()) {
          const paths = getDaemonPaths();
          const client = new DaemonClient(paths.socketPath, { respawn });
          const alive = await client.ping();
          if (alive) {
            return { backend: client, tier: TIERS.lite };
          }
        }
        return {
          backend: new MarkdownBackend(docsDir),
          tier: TIERS.markdown,
        };
      }
    }
    case "lite": {
      // Use daemon client
      const paths = getDaemonPaths();
      const client = new DaemonClient(paths.socketPath, { respawn });
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
    case "markdown":
    default:
      return {
        backend: new MarkdownBackend(docsDir),
        tier: TIERS.markdown,
      };
  }
}
