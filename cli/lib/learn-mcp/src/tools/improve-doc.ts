import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readDoc } from "../lib/docs.js";

const EXPECTED_SECTIONS = ["What", "Why", "How", "Gotchas", "Read More"];

export function registerImproveDoc(server: McpServer, docsDir: string): void {
  server.tool(
    "improve-doc",
    "Analyze a learning doc and return improvement suggestions. Checks for missing sections, short content, missing code examples, stale dates, etc.",
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

      const suggestions: string[] = [];

      for (const section of EXPECTED_SECTIONS) {
        const regex = new RegExp(`^##\\s+${section}`, "m");
        if (!regex.test(doc.content)) {
          suggestions.push(`Missing section: ## ${section}`);
        }
      }

      const howMatch = doc.content.match(/## How\n([\s\S]*?)(?=\n## |$)/);
      if (howMatch && !howMatch[1]!.includes("```")) {
        suggestions.push(
          "The 'How' section has no code examples. Add real code from the project.",
        );
      }

      const sections = doc.content.split(/^## /m).slice(1);
      for (const section of sections) {
        const lines = section.split("\n").filter((l) => l.trim()).length;
        const name = section.split("\n")[0]?.trim();
        if (lines < 3 && name) {
          suggestions.push(
            `Section '${name}' is very short (${lines} lines). Consider expanding.`,
          );
        }
      }

      if (doc.frontmatter.tags.length === 0) {
        suggestions.push(
          "No tags found. Add relevant tags for discoverability.",
        );
      }

      if (doc.frontmatter.updated) {
        const updated = new Date(doc.frontmatter.updated);
        const daysSince = Math.floor(
          (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSince > 90) {
          suggestions.push(
            `Doc hasn't been updated in ${daysSince} days. Review if content is still accurate.`,
          );
        }
      }

      const readMoreMatch = doc.content.match(
        /## Read More\n([\s\S]*?)(?=\n## |$)/,
      );
      if (readMoreMatch && !readMoreMatch[1]!.includes("http")) {
        suggestions.push(
          "The 'Read More' section has no external links. Add links to official docs or tutorials.",
        );
      }

      const result =
        suggestions.length > 0
          ? suggestions
          : ["Doc looks good! No improvement suggestions."];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ suggestions: result }, null, 2),
          },
        ],
      };
    },
  );
}
