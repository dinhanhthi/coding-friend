import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";
import { MEMORY_TYPES } from "../lib/types.js";
import { checkDuplicate } from "../lib/dedup.js";
import { buildStoreStatus } from "../lib/status-frame.js";
import { syncToClaudeMd } from "../lib/claude-md.js";
import type { ToolRegistrationContext } from "../server.js";

export function registerStore(
  server: McpServer,
  backend: MemoryBackend,
  ctx?: ToolRegistrationContext,
): void {
  server.tool(
    "memory_store",
    "Store a new memory. Provide title, description, type, tags, and content.",
    {
      title: z.string().describe("Memory title"),
      description: z
        .string()
        .describe("One-line searchable summary, under 100 chars"),
      type: z.enum(MEMORY_TYPES).describe("Memory type"),
      tags: z.array(z.string()).describe("3-5 keyword tags"),
      content: z.string().describe("Markdown content (without frontmatter)"),
      importance: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Importance 1-5, default 3"),
      source: z
        .string()
        .optional()
        .describe("Source: conversation, auto-capture, manual"),
      index_only: z
        .boolean()
        .optional()
        .describe(
          "When true, skip file creation and return a Memory object for indexing. File must already exist on disk.",
        ),
      sync_to_claude_md: z
        .boolean()
        .optional()
        .describe(
          "When true, sync this memory to the project's CLAUDE.md regardless of category. " +
            "Use for memories containing project-wide rules, conventions, or decisions that should be visible in CLAUDE.md. " +
            "Convention memories (type: preference) are always synced automatically.",
        ),
    },
    async ({
      title,
      description,
      type,
      tags,
      content,
      importance,
      source,
      index_only,
      sync_to_claude_md,
    }) => {
      const input = {
        title,
        description,
        type,
        tags,
        content,
        importance,
        source,
        index_only,
      };

      let dedup: Awaited<ReturnType<typeof checkDuplicate>> | null = null;
      if (!index_only) {
        try {
          dedup = await checkDuplicate(backend, input);
        } catch {
          // Dedup is best-effort — don't block store on search errors
        }
      }

      const memory = await backend.store(input);

      // Sync to CLAUDE.md: auto for conventions, opt-in for other categories
      let claudeMdUpdated = false;
      const shouldSync =
        (memory.category === "conventions" || sync_to_claude_md) &&
        ctx?.docsDir;
      if (shouldSync) {
        try {
          syncToClaudeMd(ctx.docsDir, memory.id, description);
          claudeMdUpdated = true;
        } catch {
          // Best-effort — don't block store on CLAUDE.md sync errors
        }
      }

      const response: Record<string, unknown> = {
        id: memory.id,
        title: memory.frontmatter.title,
        stored: true,
      };

      let warning: string | undefined;
      if (dedup?.isDuplicate) {
        warning = `Near-duplicate found: ${dedup.similarId} (similarity: ${dedup.similarity.toFixed(2)}). Memory stored anyway.`;
        response.warning = warning;
      }

      const parts: Array<{ type: "text"; text: string }> = [
        {
          type: "text" as const,
          text: JSON.stringify(response, null, 2),
        },
      ];

      if (ctx?.docsDir) {
        const markdownPath = path.join(ctx.docsDir, `${memory.id}.md`);
        parts.push({
          type: "text" as const,
          text: buildStoreStatus({
            id: memory.id,
            title: memory.frontmatter.title,
            markdownPath,
            dbPath: ctx.dbPath ?? null,
            claudeMdUpdated,
            warning,
          }),
        });
      }

      return { content: parts };
    },
  );
}
