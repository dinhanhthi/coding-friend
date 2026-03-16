import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";
import { MEMORY_TYPES } from "../lib/types.js";

export function registerSearch(
  server: McpServer,
  backend: MemoryBackend,
): void {
  server.tool(
    "memory_search",
    "Search memories by query. Returns ranked results matching title, description, tags, or content.",
    {
      query: z.string().describe("Search query"),
      type: z.enum(MEMORY_TYPES).optional().describe("Filter by memory type"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tags (OR match)"),
      limit: z.number().optional().describe("Max results, default 10"),
    },
    async ({ query, type, tags, limit }) => {
      const results = await backend.search({ query, type, tags, limit });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              results.map((r) => ({
                id: r.memory.id,
                title: r.memory.frontmatter.title,
                description: r.memory.frontmatter.description,
                type: r.memory.frontmatter.type,
                tags: r.memory.frontmatter.tags,
                score: r.score,
                matchedOn: r.matchedOn,
                excerpt: r.memory.excerpt,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
