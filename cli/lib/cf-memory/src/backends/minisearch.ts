import MiniSearch from "minisearch";
import { MarkdownBackend } from "./markdown.js";
import type { MemoryBackend } from "../lib/backend.js";
import type {
  ListInput,
  Memory,
  MemoryMeta,
  MemoryStats,
  SearchInput,
  SearchResult,
  StoreInput,
  UpdateInput,
} from "../lib/types.js";

interface IndexedDoc {
  id: string;
  title: string;
  description: string;
  tags: string;
  content: string;
  type: string;
  category: string;
  importance: number;
}

export class MiniSearchBackend implements MemoryBackend {
  private markdown: MarkdownBackend;
  private index: MiniSearch<IndexedDoc>;

  constructor(docsDir: string) {
    this.markdown = new MarkdownBackend(docsDir);
    this.index = this.createIndex();
    this.buildIndex();
  }

  private createIndex(): MiniSearch<IndexedDoc> {
    return new MiniSearch<IndexedDoc>({
      fields: ["title", "description", "tags", "content"],
      storeFields: [
        "id",
        "title",
        "description",
        "tags",
        "type",
        "category",
        "importance",
      ],
      searchOptions: {
        boost: { title: 10, tags: 6, description: 4, content: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  private buildIndex(): void {
    this.index.removeAll();
    const metas = this.markdown.getAllMeta();
    for (const meta of metas) {
      const full = this.markdown.retrieveSync(meta.id);
      this.index.add({
        id: meta.id,
        title: meta.frontmatter.title,
        description: meta.frontmatter.description,
        tags: meta.frontmatter.tags.join(" "),
        content: full?.content ?? "",
        type: meta.frontmatter.type,
        category: meta.category,
        importance: meta.frontmatter.importance,
      });
    }
  }

  /**
   * Rebuild the in-memory index from markdown files.
   */
  async rebuild(): Promise<void> {
    this.index = this.createIndex();
    this.buildIndex();
  }

  async store(input: StoreInput): Promise<Memory> {
    const memory = await this.markdown.store(input);
    // Add to index
    this.index.add({
      id: memory.id,
      title: memory.frontmatter.title,
      description: memory.frontmatter.description,
      tags: memory.frontmatter.tags.join(" "),
      content: memory.content,
      type: memory.frontmatter.type,
      category: memory.category,
      importance: memory.frontmatter.importance,
    });
    return memory;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const limit = input.limit ?? 10;
    const query = input.query;

    if (!query.trim()) {
      // Empty query — fall back to list
      const metas = await this.list({
        type: input.type,
        limit,
      });
      return metas.map((m) => ({
        memory: m,
        score: 0,
        matchedOn: [],
      }));
    }

    let results = this.index.search(query);

    // Filter by type
    if (input.type) {
      results = results.filter((r) => {
        const stored = r as unknown as { type: string };
        return stored.type === input.type;
      });
    }

    // Filter by tags
    if (input.tags && input.tags.length > 0) {
      const lowerTags = input.tags.map((t) => t.toLowerCase());
      results = results.filter((r) => {
        const stored = r as unknown as { tags: string };
        const docTags = stored.tags.toLowerCase().split(" ");
        return lowerTags.some((lt) => docTags.some((dt) => dt.includes(lt)));
      });
    }

    const limited = results.slice(0, limit);

    // Convert to SearchResult format
    const output: SearchResult[] = [];
    for (const r of limited) {
      const memory = await this.markdown.retrieve(r.id);
      if (!memory) continue;

      const matchedOn = Object.keys(r.match);
      const meta: MemoryMeta = {
        id: memory.id,
        slug: memory.slug,
        category: memory.category,
        frontmatter: memory.frontmatter,
        excerpt: memory.content.slice(0, 160),
      };
      output.push({
        memory: meta,
        score: r.score,
        matchedOn,
      });
    }

    return output;
  }

  async retrieve(id: string): Promise<Memory | null> {
    return this.markdown.retrieve(id);
  }

  async list(input: ListInput): Promise<MemoryMeta[]> {
    return this.markdown.list(input);
  }

  async update(input: UpdateInput): Promise<Memory | null> {
    const memory = await this.markdown.update(input);
    if (memory) {
      // Re-index: remove old, add new
      this.index.discard(input.id);
      this.index.add({
        id: memory.id,
        title: memory.frontmatter.title,
        description: memory.frontmatter.description,
        tags: memory.frontmatter.tags.join(" "),
        content: memory.content,
        type: memory.frontmatter.type,
        category: memory.category,
        importance: memory.frontmatter.importance,
      });
    }
    return memory;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.markdown.delete(id);
    if (deleted) {
      this.index.discard(id);
    }
    return deleted;
  }

  async stats(): Promise<MemoryStats> {
    return this.markdown.stats();
  }

  async close(): Promise<void> {
    await this.markdown.close();
  }
}
