export interface DocFrontmatter {
  title: string;
  category: string;
  tags: string[];
  created: string;
  updated: string;
}

export interface DocMeta {
  slug: string;
  category: string;
  frontmatter: DocFrontmatter;
  excerpt: string;
}

export interface Doc extends DocMeta {
  content: string;
}

export interface CategoryInfo {
  name: string;
  docCount: number;
}

export interface KnowledgeEntry {
  status: "remembered" | "needs-review" | "new";
  lastReviewed: string | null;
  reviewCount: number;
  notes: string;
  firstSeen: string;
}

export interface KnowledgeTracking {
  version: 1;
  entries: Record<string, KnowledgeEntry>;
}
