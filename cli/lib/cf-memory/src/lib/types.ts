export const MEMORY_TYPES = [
  "fact",
  "preference",
  "context",
  "episode",
  "procedure",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_CATEGORIES: Record<MemoryType, string> = {
  fact: "features",
  preference: "conventions",
  context: "decisions",
  episode: "bugs",
  procedure: "infrastructure",
};

export const CATEGORY_TO_TYPE: Record<string, MemoryType> = {
  features: "fact",
  conventions: "preference",
  decisions: "context",
  bugs: "episode",
  infrastructure: "procedure",
};

export interface MemoryFrontmatter {
  title: string;
  description: string;
  type: MemoryType;
  tags: string[];
  importance: number;
  created: string;
  updated: string;
  source: string;
}

export interface Memory {
  id: string;
  slug: string;
  category: string;
  frontmatter: MemoryFrontmatter;
  content: string;
}

export interface MemoryMeta {
  id: string;
  slug: string;
  category: string;
  frontmatter: MemoryFrontmatter;
  excerpt: string;
}

export interface SearchResult {
  memory: MemoryMeta;
  score: number;
  matchedOn: string[];
}

export interface MemoryStats {
  total: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
}

export interface StoreInput {
  title: string;
  description: string;
  type: MemoryType;
  tags: string[];
  content: string;
  importance?: number;
  source?: string;
  index_only?: boolean;
}

export interface SearchInput {
  query: string;
  type?: MemoryType;
  tags?: string[];
  limit?: number;
}

export interface ListInput {
  type?: MemoryType;
  category?: string;
  limit?: number;
}

export interface UpdateInput {
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  content?: string;
  importance?: number;
}

/**
 * Create a short excerpt from markdown content.
 */
export function makeExcerpt(content: string, maxLen = 160): string {
  const text = content
    .replace(/^#+\s.*/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}
