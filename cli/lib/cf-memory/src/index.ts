import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./server.js";
import { registerAllResources } from "./resources/index.js";
import { createBackendForTier } from "./lib/tier.js";
import type { TierConfig } from "./lib/tier.js";
import type { EmbeddingConfig } from "./backends/sqlite/embeddings.js";

const rawDir =
  process.argv[2] ?? process.env.MEMORY_DOCS_DIR ?? "./docs/memory";
const docsDir = path.resolve(rawDir);
const tierConfig = (process.env.MEMORY_TIER ?? "auto") as TierConfig;

// Daemon idle timeout from env (in milliseconds, 0 = disable)
const idleTimeoutMs = (() => {
  if (!process.env.MEMORY_DAEMON_IDLE_TIMEOUT) return undefined;
  const parsed = parseInt(process.env.MEMORY_DAEMON_IDLE_TIMEOUT, 10);
  return isNaN(parsed) ? undefined : parsed;
})();

// Embedding config from environment variables
const embeddingConfig: Partial<EmbeddingConfig> | undefined = (() => {
  const provider = process.env.MEMORY_EMBEDDING_PROVIDER as
    | EmbeddingConfig["provider"]
    | undefined;
  const model = process.env.MEMORY_EMBEDDING_MODEL;
  const ollamaUrl = process.env.MEMORY_EMBEDDING_OLLAMA_URL;
  if (!provider && !model && !ollamaUrl) return undefined;
  return {
    ...(provider && { provider }),
    ...(model && { model }),
    ...(ollamaUrl && { ollamaUrl }),
  };
})();

const daemonOptions =
  idleTimeoutMs !== undefined ? { idleTimeoutMs } : undefined;

const { backend, tier } = await createBackendForTier(
  docsDir,
  tierConfig,
  embeddingConfig,
  undefined,
  daemonOptions,
);

// Auto-start daemon for file watching (Tier 1 & 2)
// Daemon watches docs/memory/ for external changes (git pull, manual edits)
// and rebuilds the search index automatically.
if (tier.name !== "markdown") {
  const { spawnDaemon } = await import("./daemon/process.js");
  spawnDaemon(docsDir, embeddingConfig, daemonOptions).catch(() => {});
}

const server = new McpServer({
  name: "coding-friend-memory",
  version: "0.0.1",
});

registerAllTools(server, backend);
registerAllResources(server, backend);

const transport = new StdioServerTransport();
await server.connect(transport);
