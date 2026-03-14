import { Hono } from "hono";
import { z } from "zod";
import type { MemoryBackend } from "../lib/backend.js";
import {
  MEMORY_TYPES,
  type MemoryType,
  type SearchInput,
} from "../lib/types.js";

const memoryTypeSchema = z.enum(MEMORY_TYPES);

const storeSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  type: memoryTypeSchema,
  tags: z.array(z.string()),
  content: z.string(),
  importance: z.number().min(1).max(5).optional(),
  source: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  content: z.string().optional(),
  importance: z.number().min(1).max(5).optional(),
});

function parseType(raw: string | undefined): MemoryType | undefined {
  if (!raw) return undefined;
  const result = memoryTypeSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export function createDaemonApp(backend: MemoryBackend): Hono {
  const app = new Hono();

  // Global error handler
  app.onError((err, c) => {
    return c.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  });

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      uptime: process.uptime(),
      pid: process.pid,
    });
  });

  // Stats
  app.get("/stats", async (c) => {
    const stats = await backend.stats();
    return c.json(stats);
  });

  // Store a new memory
  app.post("/memory", async (c) => {
    const raw = await c.req.json();
    const parsed = storeSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.issues },
        400,
      );
    }
    const memory = await backend.store(parsed.data);
    return c.json(
      { id: memory.id, title: memory.frontmatter.title, stored: true },
      201,
    );
  });

  // Search memories
  app.get("/memory/search", async (c) => {
    const query = c.req.query("query") ?? "";
    const type = parseType(c.req.query("type"));
    const tagsRaw = c.req.query("tags");
    const limitRaw = c.req.query("limit");

    const input: SearchInput = {
      query,
      type,
      tags: tagsRaw ? tagsRaw.split(",") : undefined,
      limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
    };

    const results = await backend.search(input);
    return c.json(results);
  });

  // Retrieve a memory by ID (category/slug)
  app.get("/memory/:category/:slug", async (c) => {
    const id = `${c.req.param("category")}/${c.req.param("slug")}`;
    const memory = await backend.retrieve(id);
    if (!memory) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(memory);
  });

  // List memories
  app.get("/memory", async (c) => {
    const type = parseType(c.req.query("type"));
    const category = c.req.query("category");
    const limitRaw = c.req.query("limit");

    const metas = await backend.list({
      type,
      category: category || undefined,
      limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
    });
    return c.json(metas);
  });

  // Update a memory
  app.patch("/memory/:category/:slug", async (c) => {
    const id = `${c.req.param("category")}/${c.req.param("slug")}`;
    const raw = await c.req.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.issues },
        400,
      );
    }
    const memory = await backend.update({ id, ...parsed.data });
    if (!memory) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      id: memory.id,
      title: memory.frontmatter.title,
      updated: true,
    });
  });

  // Delete a memory
  app.delete("/memory/:category/:slug", async (c) => {
    const id = `${c.req.param("category")}/${c.req.param("slug")}`;
    const deleted = await backend.delete(id);
    if (!deleted) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ id, deleted: true });
  });

  // Rebuild index (for MiniSearchBackend)
  app.post("/rebuild", async (c) => {
    if ("rebuild" in backend && typeof backend.rebuild === "function") {
      await (backend as MemoryBackend & { rebuild(): Promise<void> }).rebuild();
      return c.json({ rebuilt: true });
    }
    return c.json({
      rebuilt: false,
      reason: "Backend does not support rebuild",
    });
  });

  return app;
}
