import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import matter from "gray-matter";
import type {
  CategoryInfo,
  Doc,
  DocFrontmatter,
  DocMeta,
  TocItem,
} from "./types";

/**
 * Resolve the docs directory using the same logic as `cf host`:
 * 1. DOCS_DIR env var (set by `cf host`)
 * 2. Local .coding-friend/config.json → learn.outputDir
 * 3. Global ~/.coding-friend/config.json → learn.outputDir
 * 4. Default: docs/learn (relative to project root)
 */
function getDocsDir(): string {
  if (process.env.DOCS_DIR) {
    return path.resolve(process.env.DOCS_DIR);
  }

  // Find project root by walking up from cwd looking for .coding-friend/
  const projectRoot = findProjectRoot(process.cwd());

  // Try local config
  const localConfig = readJsonSafe(
    path.join(projectRoot, ".coding-friend", "config.json"),
  );
  if (localConfig?.learn?.outputDir) {
    return resolvePath(localConfig.learn.outputDir, projectRoot);
  }

  // Try global config
  const globalConfig = readJsonSafe(
    path.join(homedir(), ".coding-friend", "config.json"),
  );
  if (globalConfig?.learn?.outputDir) {
    return resolvePath(globalConfig.learn.outputDir, projectRoot);
  }

  // Default
  return path.join(projectRoot, "docs", "learn");
}

function findProjectRoot(from: string): string {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".coding-friend"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback: assume learn-host is at <root>/lib/learn-host
  return path.resolve(from, "../..");
}

function resolvePath(p: string, base: string): string {
  if (p.startsWith("/")) return p;
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return path.resolve(base, p);
}

interface CfConfig {
  learn?: { outputDir?: string };
}

function readJsonSafe(filePath: string): CfConfig | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as CfConfig;
  } catch {
    return null;
  }
}

function isMarkdownDoc(fileName: string): boolean {
  return fileName.endsWith(".md") && fileName !== "README.md";
}

function formatDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return str;
}

function parseFrontmatter(raw: matter.GrayMatterFile<string>): DocFrontmatter {
  const d = raw.data;
  return {
    title: String(d.title ?? "Untitled"),
    category: String(d.category ?? ""),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    created: formatDate(d.created),
    updated: formatDate(d.updated),
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
      const count = fs.readdirSync(catPath).filter(isMarkdownDoc).length;
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

export function extractHeadings(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    headings.push({ id, text, level: match[1].length });
  }
  return headings;
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
