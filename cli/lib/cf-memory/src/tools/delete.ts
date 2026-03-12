import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";

export function registerDelete(
  server: McpServer,
  backend: MemoryBackend,
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
