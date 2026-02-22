import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { Doc, DocFrontmatter } from "./types";

const contentDir = path.join(process.cwd(), "src/content/docs");

export function getDocBySlug(slug: string): Doc | null {
  const filePath = path.join(contentDir, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug,
    frontmatter: data as DocFrontmatter,
    content,
  };
}

export function getAllDocSlugs(): string[] {
  const slugs: string[] = [];

  function walk(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith(".mdx")) {
        slugs.push(`${prefix}${entry.name.replace(".mdx", "")}`);
      }
    }
  }

  walk(contentDir, "");
  return slugs;
}

export function extractHeadings(content: string) {
  const headings: { id: string; text: string; level: number }[] = [];
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
