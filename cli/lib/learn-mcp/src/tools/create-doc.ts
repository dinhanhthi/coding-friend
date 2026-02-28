import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDoc } from "../lib/docs.js";

export function registerCreateDoc(server: McpServer, docsDir: string): void {
  server.tool(
    "create-doc",
    "Create a new learning doc with proper YAML frontmatter. Provide the category, title, tags, and markdown content.",
    {
      category: z
        .string()
        .describe("Category folder name (created if missing)"),
      title: z.string().describe("Doc title"),
      tags: z.array(z.string()).describe("Tags for the doc"),
      content: z.string().describe("Markdown content (without frontmatter)"),
    },
    async ({ category, title, tags, content }) => {
      const filePath = createDoc(docsDir, category, title, tags, content);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ path: filePath, created: true }, null, 2),
          },
        ],
      };
    },
  );
}
