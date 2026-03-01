import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trackKnowledge } from "../lib/knowledge.js";

export function registerTrackKnowledge(
  server: McpServer,
  docsDir: string,
): void {
  server.tool(
    "track-knowledge",
    "Record the user's self-assessment of their understanding of a specific learning doc. Status: 'remembered', 'needs-review', or 'new'.",
    {
      category: z.string().describe("Category folder name"),
      slug: z.string().describe("Doc filename without .md extension"),
      status: z
        .enum(["remembered", "needs-review", "new"])
        .describe("User's self-assessment of knowledge retention"),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about understanding level"),
    },
    async ({ category, slug, status, notes }) => {
      const entry = trackKnowledge(docsDir, category, slug, status, notes);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ tracked: true, entry }, null, 2),
          },
        ],
      };
    },
  );
}
