import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchDocs } from "../lib/docs.js";

export function registerSearchDocs(server: McpServer, docsDir: string): void {
  server.tool(
    "search-docs",
    "Full-text search across all learning docs. Searches titles, tags, and content. Optionally filter by category.",
    {
      query: z.string().describe("Search query text"),
      category: z
        .string()
        .optional()
        .describe("Limit search to this category"),
    },
    async ({ query, category }) => {
      const results = searchDocs(docsDir, query, category);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
