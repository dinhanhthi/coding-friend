import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { CategoryInfo, Doc, DocFrontmatter, DocMeta } from "./types.js";

function isMarkdownDoc(filePath: string): boolean {
  const name = path.basename(filePath);
  return name.endsWith(".md") && name !== "README.md";
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

export function getCategories(docsDir: string): CategoryInfo[] {
  if (!fs.existsSync(docsDir)) return [];
  return fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => {
      const catPath = path.join(docsDir, d.name);
      const count = fs
        .readdirSync(catPath)
        .filter((f) => isMarkdownDoc(f)).length;
      return { name: d.name, docCount: count };
    })
    .filter((c) => c.docCount > 0);
}

export function getAllDocs(docsDir: string): DocMeta[] {
  const docs: DocMeta[] = [];
  const categories = getCategories(docsDir);

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

export function getDocsByCategory(
  docsDir: string,
  category: string,
): DocMeta[] {
  return getAllDocs(docsDir).filter((d) => d.category === category);
}

export function getDocsByTag(docsDir: string, tag: string): DocMeta[] {
  const lowerTag = tag.toLowerCase();
  return getAllDocs(docsDir).filter((d) =>
    d.frontmatter.tags.some((t) => t.toLowerCase() === lowerTag),
  );
}

export function readDoc(
  docsDir: string,
  category: string,
  slug: string,
): Doc | null {
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

export function searchDocs(
  docsDir: string,
  query: string,
  category?: string,
): DocMeta[] {
  const lowerQuery = query.toLowerCase();
  let docs = getAllDocs(docsDir);

  if (category) {
    docs = docs.filter((d) => d.category === category);
  }

  return docs.filter((d) => {
    const titleMatch = d.frontmatter.title.toLowerCase().includes(lowerQuery);
    const tagMatch = d.frontmatter.tags.some((t) =>
      t.toLowerCase().includes(lowerQuery),
    );
    const excerptMatch = d.excerpt.toLowerCase().includes(lowerQuery);

    if (titleMatch || tagMatch || excerptMatch) return true;

    const full = readDoc(docsDir, d.category, d.slug);
    return full?.content.toLowerCase().includes(lowerQuery) ?? false;
  });
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createDoc(
  docsDir: string,
  category: string,
  title: string,
  tags: string[],
  content: string,
): string {
  const catDir = path.join(docsDir, category);
  if (!fs.existsSync(catDir)) {
    fs.mkdirSync(catDir, { recursive: true });
  }

  const slug = slugify(title);
  const filePath = path.join(catDir, `${slug}.md`);
  const today = new Date().toISOString().split("T")[0];

  const doc = matter.stringify(content, {
    title,
    category,
    tags,
    created: today,
    updated: today,
  });

  fs.writeFileSync(filePath, doc, "utf-8");
  return filePath;
}

export function updateDoc(
  docsDir: string,
  category: string,
  slug: string,
  updates: { content?: string; tags?: string[]; title?: string },
): string | null {
  const filePath = path.join(docsDir, category, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = matter(fs.readFileSync(filePath, "utf-8"));
  const today = new Date().toISOString().split("T")[0];

  if (updates.tags) {
    raw.data.tags = [
      ...new Set([...(raw.data.tags || []), ...updates.tags]),
    ];
  }
  if (updates.title) {
    raw.data.title = updates.title;
  }
  raw.data.updated = today;

  const newContent = updates.content
    ? raw.content + "\n\n" + updates.content
    : raw.content;

  fs.writeFileSync(filePath, matter.stringify(newContent, raw.data), "utf-8");
  return filePath;
}
