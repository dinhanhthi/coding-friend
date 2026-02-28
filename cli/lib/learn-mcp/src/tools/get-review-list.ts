import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getReviewList } from "../lib/knowledge.js";

export function registerGetReviewList(
  server: McpServer,
  docsDir: string,
): void {
  server.tool(
    "get-review-list",
    "Get learning docs that need review. Returns docs marked as 'needs-review' or 'new', sorted by staleness. Docs marked 'remembered' are excluded.",
    {
      status: z
        .enum(["needs-review", "new"])
        .optional()
        .describe("Filter by specific status"),
      limit: z
        .number()
        .optional()
        .describe("Max number of results to return"),
    },
    async ({ status, limit }) => {
      const results = getReviewList(docsDir, status, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
