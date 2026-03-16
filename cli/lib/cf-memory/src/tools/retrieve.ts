import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";

export function registerRetrieve(
  server: McpServer,
  backend: MemoryBackend,
): void {
  server.tool(
    "memory_retrieve",
    "Retrieve a specific memory by ID (format: category/slug).",
    {
      id: z.string().describe("Memory ID (e.g. features/auth-pattern)"),
    },
    async ({ id }) => {
      const memory = await backend.retrieve(id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Memory not found", id }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: memory.id,
                title: memory.frontmatter.title,
                description: memory.frontmatter.description,
                type: memory.frontmatter.type,
                tags: memory.frontmatter.tags,
                importance: memory.frontmatter.importance,
                created: memory.frontmatter.created,
                updated: memory.frontmatter.updated,
                content: memory.content,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
