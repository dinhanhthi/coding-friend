import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readDoc } from "../lib/docs.js";

export function registerReadDoc(server: McpServer, docsDir: string): void {
  server.tool(
    "read-doc",
    "Read the full content of a single learning doc by category and slug (filename without .md).",
    {
      category: z.string().describe("Category folder name"),
      slug: z.string().describe("Doc filename without .md extension"),
    },
    async ({ category, slug }) => {
      const doc = readDoc(docsDir, category, slug);
      if (!doc) {
        return {
          content: [
            { type: "text", text: `Doc not found: ${category}/${slug}.md` },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(doc, null, 2) }],
      };
    },
  );
}
