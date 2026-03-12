import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";
import { MEMORY_TYPES } from "../lib/types.js";

export function registerStore(server: McpServer, backend: MemoryBackend): void {
  server.tool(
    "memory_store",
    "Store a new memory. Provide title, description, type, tags, and content.",
    {
      title: z.string().describe("Memory title"),
      description: z
        .string()
        .describe("One-line searchable summary, under 100 chars"),
      type: z.enum(MEMORY_TYPES).describe("Memory type"),
      tags: z.array(z.string()).describe("3-5 keyword tags"),
      content: z.string().describe("Markdown content (without frontmatter)"),
      importance: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Importance 1-5, default 3"),
      source: z
        .string()
        .optional()
        .describe("Source: conversation, auto-capture, manual"),
    },
    async ({ title, description, type, tags, content, importance, source }) => {
      const memory = await backend.store({
        title,
        description,
        type,
        tags,
        content,
        importance,
        source,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { id: memory.id, title: memory.frontmatter.title, stored: true },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
