import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { CategoryInfo, Doc, DocFrontmatter, DocMeta } from "./types";

function getDocsDir(): string {
  const raw = process.env.DOCS_DIR || path.join(process.cwd(), "../../docs/learn");
  return path.resolve(raw);
}

function isMarkdownDoc(fileName: string): boolean {
  return fileName.endsWith(".md") && fileName !== "README.md";
}

function parseFrontmatter(raw: matter.GrayMatterFile<string>): DocFrontmatter {
  const d = raw.data;
  return {
    title: String(d.title ?? "Untitled"),
    category: String(d.category ?? ""),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    created: String(d.created ?? ""),
    updated: String(d.updated ?? ""),
  };
}

function makeExcerpt(content: string, maxLen = 160): string {
  const text = content
    .replace(/^#+\s.*/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

export function getAllCategories(): CategoryInfo[] {
  const docsDir = getDocsDir();
  if (!fs.existsSync(docsDir)) return [];
  return fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => {
      const catPath = path.join(docsDir, d.name);
      const count = fs
        .readdirSync(catPath)
        .filter(isMarkdownDoc).length;
      return { name: d.name, docCount: count };
    })
    .filter((c) => c.docCount > 0);
}

export function getAllDocs(): DocMeta[] {
  const docsDir = getDocsDir();
  const docs: DocMeta[] = [];
  const categories = getAllCategories();

  for (const cat of categories) {
    const catPath = path.join(docsDir, cat.name);
    const files = fs.readdirSync(catPath).filter(isMarkdownDoc);

    for (const file of files) {
      const filePath = path.join(catPath, file);
      const raw = matter(fs.readFileSync(filePath, "utf-8"));
      const frontmatter = parseFrontmatter(raw);

      docs.push({
        slug: path.basename(file, ".md"),
        category: cat.name,
        frontmatter: { ...frontmatter, category: cat.name },
        excerpt: makeExcerpt(raw.content),
      });
    }
  }

  return docs.sort(
    (a, b) =>
      new Date(b.frontmatter.updated || b.frontmatter.created).getTime() -
      new Date(a.frontmatter.updated || a.frontmatter.created).getTime(),
  );
}

export function getDocsByCategory(category: string): DocMeta[] {
  return getAllDocs().filter((d) => d.category === category);
}

export function getDocBySlug(category: string, slug: string): Doc | null {
  const docsDir = getDocsDir();
  const filePath = path.join(docsDir, category, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = matter(fs.readFileSync(filePath, "utf-8"));
  const frontmatter = parseFrontmatter(raw);

  return {
    slug,
    category,
    frontmatter: { ...frontmatter, category },
    excerpt: makeExcerpt(raw.content),
    content: raw.content,
  };
}

export function getAllTags(): { tag: string; count: number }[] {
  const tagMap = new Map<string, number>();
  for (const doc of getAllDocs()) {
    for (const tag of doc.frontmatter.tags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
