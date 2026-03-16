import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";
import { MEMORY_TYPES } from "../lib/types.js";

export function registerList(server: McpServer, backend: MemoryBackend): void {
  server.tool(
    "memory_list",
    "List memories with optional filtering by type or category.",
    {
      type: z.enum(MEMORY_TYPES).optional().describe("Filter by memory type"),
      category: z.string().optional().describe("Filter by category folder"),
      limit: z.number().optional().describe("Max results, default 50"),
    },
    async ({ type, category, limit }) => {
      const metas = await backend.list({ type, category, limit });
      return {
        content: [
          {
            type: "text" as const,
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
}
