import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCategories } from "../lib/docs.js";

export function registerListCategories(
  server: McpServer,
  docsDir: string,
): void {
  server.tool(
    "list-categories",
    "List all learning doc categories with document counts",
    {},
    async () => {
      const categories = getCategories(docsDir);
      return {
        content: [{ type: "text", text: JSON.stringify(categories, null, 2) }],
      };
    },
  );
}
