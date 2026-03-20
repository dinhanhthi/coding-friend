import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { MemoryBackend } from "../lib/backend.js";
import {
  CATEGORY_TO_TYPE,
  MEMORY_CATEGORIES,
  makeExcerpt,
  type ListInput,
  type Memory,
  type MemoryFrontmatter,
  type MemoryMeta,
  type MemoryStats,
  type MemoryType,
  type SearchInput,
  type SearchResult,
  type StoreInput,
  type UpdateInput,
} from "../lib/types.js";

/**
 * Validate that a resolved path stays within docsDir to prevent path traversal.
 */
function safePath(docsDir: string, ...segments: string[]): string | null {
  const resolved = path.resolve(docsDir, ...segments);
  if (
    !resolved.startsWith(path.resolve(docsDir) + path.sep) &&
    resolved !== path.resolve(docsDir)
  ) {
    return null;
  }
  return resolved;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseFrontmatter(
  raw: matter.GrayMatterFile<string>,
  category: string,
): MemoryFrontmatter {
  const d = raw.data;
  return {
    title: String(d.title ?? "Untitled"),
    description: String(d.description ?? ""),
    type: (d.type as MemoryType) ?? CATEGORY_TO_TYPE[category] ?? "fact",
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    importance: Number(d.importance ?? 3),
    created: String(d.created ?? ""),
    updated: String(d.updated ?? ""),
    source: String(d.source ?? "conversation"),
  };
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export class MarkdownBackend implements MemoryBackend {
  constructor(private docsDir: string) {}

  private getCategories(): string[] {
    if (!fs.existsSync(this.docsDir)) return [];
    return fs
      .readdirSync(this.docsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  }

  getAllMeta(): MemoryMeta[] {
    const metas: MemoryMeta[] = [];

    for (const category of this.getCategories()) {
      const catPath = path.join(this.docsDir, category);
      const files = fs
        .readdirSync(catPath)
        .filter((f) => f.endsWith(".md") && f !== "README.md");

      for (const file of files) {
        const filePath = path.join(catPath, file);
        const raw = matter(fs.readFileSync(filePath, "utf-8"));
        const frontmatter = parseFrontmatter(raw, category);
        const slug = path.basename(file, ".md");

        metas.push({
          id: `${category}/${slug}`,
          slug,
          category,
          frontmatter,
          excerpt: makeExcerpt(raw.content),
        });
      }
    }

    return metas.sort(
      (a, b) =>
        new Date(b.frontmatter.updated || b.frontmatter.created).getTime() -
        new Date(a.frontmatter.updated || a.frontmatter.created).getTime(),
    );
  }

  async store(input: StoreInput): Promise<Memory> {
    const category = MEMORY_CATEGORIES[input.type];
    const catDir = path.join(this.docsDir, category);
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }

    const slug = slugify(input.title);
    const filePath = path.join(catDir, `${slug}.md`);
    const now = today();

    const buildFrontmatter = (): MemoryFrontmatter => ({
      title: input.title,
      description: input.description,
      type: input.type,
      tags: input.tags,
      importance: input.importance ?? 3,
      created: now,
      updated: now,
      source: input.source ?? "conversation",
    });

    // index_only: verify file exists, return Memory from input without writing
    if (input.index_only) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`index_only: file not found for "${category}/${slug}"`);
      }
      return {
        id: `${category}/${slug}`,
        slug,
        category,
        frontmatter: buildFrontmatter(),
        content: input.content,
      };
    }

    // Handle duplicate slugs
    let finalSlug = slug;
    if (fs.existsSync(filePath)) {
      finalSlug = `${slug}-${Date.now()}`;
    }

    const finalPath = path.join(catDir, `${finalSlug}.md`);
    const frontmatter = buildFrontmatter();

    const doc = matter.stringify(
      input.content,
      frontmatter as unknown as Record<string, unknown>,
    );
    fs.writeFileSync(finalPath, doc, "utf-8");

    return {
      id: `${category}/${finalSlug}`,
      slug: finalSlug,
      category,
      frontmatter,
      content: input.content,
    };
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const query = input.query.toLowerCase();
    let metas = this.getAllMeta();

    if (input.type) {
      metas = metas.filter((m) => m.frontmatter.type === input.type);
    }

    if (input.tags && input.tags.length > 0) {
      const lowerTags = input.tags.map((t) => t.toLowerCase());
      metas = metas.filter((m) =>
        lowerTags.some((lt) =>
          m.frontmatter.tags.some((t) => t.toLowerCase() === lt),
        ),
      );
    }

    const results: SearchResult[] = [];

    for (const meta of metas) {
      const matchedOn: string[] = [];
      let score = 0;

      // Title match (highest weight)
      if (meta.frontmatter.title.toLowerCase().includes(query)) {
        matchedOn.push("title");
        score += 10;
      }

      // Description match
      if (meta.frontmatter.description.toLowerCase().includes(query)) {
        matchedOn.push("description");
        score += 8;
      }

      // Tag match
      if (meta.frontmatter.tags.some((t) => t.toLowerCase().includes(query))) {
        matchedOn.push("tags");
        score += 6;
      }

      // Content match (full file read — heavier)
      if (matchedOn.length === 0) {
        const full = await this.retrieve(meta.id);
        if (full && full.content.toLowerCase().includes(query)) {
          matchedOn.push("content");
          score += 2;
        }
      }

      if (matchedOn.length > 0) {
        results.push({ memory: meta, score, matchedOn });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const limit = input.limit ?? 10;
    return results.slice(0, limit);
  }

  retrieveSync(id: string): Memory | null {
    const [category, slug] = id.split("/");
    if (!category || !slug) return null;

    const filePath = safePath(this.docsDir, category, `${slug}.md`);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const raw = matter(fs.readFileSync(filePath, "utf-8"));
    const frontmatter = parseFrontmatter(raw, category);

    return {
      id,
      slug,
      category,
      frontmatter,
      content: raw.content,
    };
  }

  async retrieve(id: string): Promise<Memory | null> {
    return this.retrieveSync(id);
  }

  async list(input: ListInput): Promise<MemoryMeta[]> {
    let metas = this.getAllMeta();

    if (input.type) {
      metas = metas.filter((m) => m.frontmatter.type === input.type);
    }

    if (input.category) {
      metas = metas.filter((m) => m.category === input.category);
    }

    const limit = input.limit ?? 50;
    return metas.slice(0, limit);
  }

  async update(input: UpdateInput): Promise<Memory | null> {
    const [category, slug] = input.id.split("/");
    if (!category || !slug) return null;

    const filePath = safePath(this.docsDir, category, `${slug}.md`);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const raw = matter(fs.readFileSync(filePath, "utf-8"));
    const now = today();

    if (input.title) raw.data.title = input.title;
    if (input.description) raw.data.description = input.description;
    if (input.tags) {
      raw.data.tags = [...new Set([...(raw.data.tags || []), ...input.tags])];
    }
    if (input.importance !== undefined) raw.data.importance = input.importance;
    raw.data.updated = now;

    const newContent = input.content
      ? raw.content + "\n\n" + input.content
      : raw.content;

    fs.writeFileSync(filePath, matter.stringify(newContent, raw.data), "utf-8");

    const frontmatter = parseFrontmatter(
      matter(fs.readFileSync(filePath, "utf-8")),
      category,
    );

    return {
      id: input.id,
      slug,
      category,
      frontmatter,
      content: newContent,
    };
  }

  async delete(id: string): Promise<boolean> {
    const [category, slug] = id.split("/");
    if (!category || !slug) return false;

    const filePath = safePath(this.docsDir, category, `${slug}.md`);
    if (!filePath || !fs.existsSync(filePath)) return false;

    fs.unlinkSync(filePath);
    return true;
  }

  async stats(): Promise<MemoryStats> {
    const metas = this.getAllMeta();
    const byCategory: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const meta of metas) {
      byCategory[meta.category] = (byCategory[meta.category] ?? 0) + 1;
      byType[meta.frontmatter.type] = (byType[meta.frontmatter.type] ?? 0) + 1;
    }

    return {
      total: metas.length,
      byCategory,
      byType,
    };
  }

  async close(): Promise<void> {
    // No-op for markdown backend
  }
}
