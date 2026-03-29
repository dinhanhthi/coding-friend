import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";
import { removeFromClaudeMd } from "../lib/claude-md.js";
import type { ToolRegistrationContext } from "../server.js";

export function registerDelete(
  server: McpServer,
  backend: MemoryBackend,
  ctx?: ToolRegistrationContext,
): void {
  server.tool(
    "memory_delete",
    "Delete a memory by ID.",
    {
      id: z.string().describe("Memory ID (e.g. features/auth-pattern)"),
    },
    async ({ id }) => {
      const deleted = await backend.delete(id);
      if (!deleted) {
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
      // Remove from CLAUDE.md if it was a conventions entry
      if (id.startsWith("conventions/") && ctx?.docsDir) {
        try {
          removeFromClaudeMd(ctx.docsDir, id);
        } catch {
          // Best-effort
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ id, deleted: true }, null, 2),
          },
        ],
      };
    },
  );
}
