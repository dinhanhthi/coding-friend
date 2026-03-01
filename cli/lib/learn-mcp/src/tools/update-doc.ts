import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateDoc } from "../lib/docs.js";

export function registerUpdateDoc(server: McpServer, docsDir: string): void {
  server.tool(
    "update-doc",
    "Update an existing learning doc. Can append content, add tags, or update the title. Content is appended (not replaced).",
    {
      category: z.string().describe("Category folder name"),
      slug: z.string().describe("Doc filename without .md extension"),
      content: z.string().optional().describe("Markdown content to append"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags to add (merged with existing)"),
      title: z.string().optional().describe("New title"),
    },
    async ({ category, slug, content, tags, title }) => {
      const filePath = updateDoc(docsDir, category, slug, {
        content,
        tags,
        title,
      });
      if (!filePath) {
        return {
          content: [
            { type: "text", text: `Doc not found: ${category}/${slug}.md` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ path: filePath, updated: true }, null, 2),
          },
        ],
      };
    },
  );
}
