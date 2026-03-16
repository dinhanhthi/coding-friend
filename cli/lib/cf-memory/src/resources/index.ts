import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryBackend } from "../lib/backend.js";

export function registerAllResources(
  server: McpServer,
  backend: MemoryBackend,
): void {
  // memory://index — browse all memories
  server.registerResource(
    "memory-index",
    "memory://index",
    {
      title: "Memory Index",
      description: "Browse all stored memories with titles, types, and tags",
      mimeType: "application/json",
    },
    async (uri) => {
      const metas = await backend.list({});
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              metas.map((m) => ({
                id: m.id,
                title: m.frontmatter.title,
                description: m.frontmatter.description,
                type: m.frontmatter.type,
                tags: m.frontmatter.tags,
                updated: m.frontmatter.updated,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // memory://stats — storage statistics
  server.registerResource(
    "memory-stats",
    "memory://stats",
    {
      title: "Memory Stats",
      description: "Storage statistics: total count, by category, by type",
      mimeType: "application/json",
    },
    async (uri) => {
      const stats = await backend.stats();
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    },
  );
}
