import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";
import { buildUpdateStatus } from "../lib/status-frame.js";
import type { ToolRegistrationContext } from "../server.js";

export function registerUpdate(
  server: McpServer,
  backend: MemoryBackend,
  ctx?: ToolRegistrationContext,
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

      const response = {
        id: memory.id,
        title: memory.frontmatter.title,
        updated: true,
      };

      const parts: Array<{ type: "text"; text: string }> = [
        {
          type: "text" as const,
          text: JSON.stringify(response, null, 2),
        },
      ];

      if (ctx?.docsDir) {
        const markdownPath = path.join(ctx.docsDir, `${memory.id}.md`);
        parts.push({
          type: "text" as const,
          text: buildUpdateStatus({
            id: memory.id,
            title: memory.frontmatter.title,
            markdownPath,
            dbPath: ctx.dbPath ?? null,
          }),
        });
      }

      return { content: parts };
    },
  );
}
