import { getAllDocs } from "./docs";
import type { SearchIndexEntry } from "./types";

export function buildSearchIndex(): SearchIndexEntry[] {
  return getAllDocs().map((doc) => ({
    slug: doc.slug,
    category: doc.category,
    title: doc.frontmatter.title,
    tags: doc.frontmatter.tags,
    excerpt: doc.excerpt,
  }));
}

export function searchIndex(
  index: SearchIndexEntry[],
  query: string,
): SearchIndexEntry[] {
  const lower = query.toLowerCase();
  return index.filter((entry) => {
    return (
      entry.title.toLowerCase().includes(lower) ||
      entry.tags.some((t) => t.toLowerCase().includes(lower)) ||
      entry.excerpt.toLowerCase().includes(lower) ||
      entry.category.toLowerCase().includes(lower)
    );
  });
}
