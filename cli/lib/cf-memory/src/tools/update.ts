import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";

export function registerUpdate(
  server: McpServer,
  backend: MemoryBackend,
): void {
  server.tool(
    "memory_update",
    "Update an existing memory. Provide the ID and fields to update. Content is appended.",
    {
      id: z.string().describe("Memory ID (e.g. features/auth-pattern)"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags to add (merged with existing)"),
      content: z.string().optional().describe("Content to append to existing"),
      importance: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("New importance"),
    },
    async ({ id, title, description, tags, content, importance }) => {
      const memory = await backend.update({
        id,
        title,
        description,
        tags,
        content,
        importance,
      });
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
              { id: memory.id, title: memory.frontmatter.title, updated: true },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
