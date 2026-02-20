import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAllDocs, getDocsByCategory, getDocsByTag } from "../lib/docs.js";

export function registerListDocs(server: McpServer, docsDir: string): void {
  server.tool(
    "list-docs",
    "List learning docs. Optionally filter by category or tag. Returns doc metadata (title, category, tags, dates, excerpt).",
    {
      category: z.string().optional().describe("Filter by category name"),
      tag: z.string().optional().describe("Filter by tag"),
      limit: z.number().optional().describe("Max number of docs to return"),
    },
    async ({ category, tag, limit }) => {
      let docs = category
        ? getDocsByCategory(docsDir, category)
        : tag
          ? getDocsByTag(docsDir, tag)
          : getAllDocs(docsDir);

      if (limit && limit > 0) {
        docs = docs.slice(0, limit);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(docs, null, 2) }],
      };
    },
  );
}
