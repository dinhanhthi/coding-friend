import { Hono } from "hono";
import type { MemoryBackend } from "../lib/backend.js";
import type {
  ListInput,
  MemoryType,
  SearchInput,
  StoreInput,
  UpdateInput,
} from "../lib/types.js";

export function createDaemonApp(backend: MemoryBackend): Hono {
  const app = new Hono();

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
    try {
      const body = (await c.req.json()) as StoreInput;
      const memory = await backend.store(body);
      return c.json(
        { id: memory.id, title: memory.frontmatter.title, stored: true },
        201,
      );
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Store failed" },
        400,
      );
    }
  });

  // Search memories
  app.get("/memory/search", async (c) => {
    const query = c.req.query("query") ?? "";
    const type = c.req.query("type") as MemoryType | undefined;
    const tagsRaw = c.req.query("tags");
    const limitRaw = c.req.query("limit");

    const input: SearchInput = {
      query,
      type: type || undefined,
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
    const type = c.req.query("type") as MemoryType | undefined;
    const category = c.req.query("category");
    const limitRaw = c.req.query("limit");

    const input: ListInput = {
      type: type || undefined,
      category: category || undefined,
      limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
    };

    const metas = await backend.list(input);
    return c.json(metas);
  });

  // Update a memory
  app.patch("/memory/:category/:slug", async (c) => {
    try {
      const id = `${c.req.param("category")}/${c.req.param("slug")}`;
      const body = (await c.req.json()) as Omit<UpdateInput, "id">;
      const memory = await backend.update({ id, ...body });
      if (!memory) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json({
        id: memory.id,
        title: memory.frontmatter.title,
        updated: true,
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Update failed" },
        400,
      );
    }
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
