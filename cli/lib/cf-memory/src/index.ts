import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./server.js";
import { registerAllResources } from "./resources/index.js";
import { createBackendForTier } from "./lib/tier.js";
import type { TierConfig } from "./lib/tier.js";

const rawDir =
  process.argv[2] ?? process.env.MEMORY_DOCS_DIR ?? "./docs/memory";
const docsDir = path.resolve(rawDir);
const tierConfig = (process.env.MEMORY_TIER ?? "auto") as TierConfig;

const { backend, tier } = await createBackendForTier(docsDir, tierConfig);

const server = new McpServer({
  name: "coding-friend-memory",
  version: "0.0.1",
});

registerAllTools(server, backend);
registerAllResources(server, backend);

const transport = new StdioServerTransport();
await server.connect(transport);
