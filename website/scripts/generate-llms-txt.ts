/**
 * Generate llms.txt and llms-full.txt for the website.
 * See https://llmstxt.org/ for the specification.
 *
 * - llms.txt: Structured index with links to each doc page
 * - llms-full.txt: Full content of all docs inlined
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { docsNavigation } from "../src/lib/navigation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "src/content/docs");
const PUBLIC_DIR = path.join(ROOT, "public");
const SITE_URL = "https://cf.dinhanhthi.com";

function readDoc(slug: string) {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return { frontmatter: data, content: content.trim() };
}

function docUrl(slug: string) {
  return `${SITE_URL}/docs/${slug}/`;
}

function stripMdxComponents(content: string) {
  // Remove MDX import statements
  content = content.replace(/^import\s+.*$/gm, "");
  // Remove JSX-style component usage like <Callout>...</Callout>
  content = content.replace(/<Callout[^>]*>([\s\S]*?)<\/Callout>/g, "> $1");
  return content.trim();
}

function generateLlmsTxt() {
  const lines: string[] = [];

  lines.push("# Coding Friend");
  lines.push("");
  lines.push(
    "> Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code. It provides skills (slash commands), auto-invoked agents, CLI tools, and multi-platform support for structured development practices like TDD, code review, and smart commits."
  );
  lines.push("");

  for (const section of docsNavigation) {
    lines.push(`## ${section.title}`);
    lines.push("");
    for (const item of section.items) {
      const doc = readDoc(item.slug);
      const description = doc?.frontmatter?.description
        ? `: ${doc.frontmatter.description}`
        : "";
      lines.push(`- [${item.title}](${docUrl(item.slug)})${description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateLlmsFullTxt() {
  const lines: string[] = [];

  lines.push("# Coding Friend");
  lines.push("");
  lines.push(
    "> Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code. It provides skills (slash commands), auto-invoked agents, CLI tools, and multi-platform support for structured development practices like TDD, code review, and smart commits."
  );
  lines.push("");

  for (const section of docsNavigation) {
    lines.push(`## ${section.title}`);
    lines.push("");
    for (const item of section.items) {
      const doc = readDoc(item.slug);
      if (!doc) continue;

      const title = doc.frontmatter.title || item.title;
      lines.push(`### ${title}`);
      lines.push("");
      if (doc.frontmatter.description) {
        lines.push(doc.frontmatter.description);
        lines.push("");
      }
      lines.push(stripMdxComponents(doc.content));
      lines.push("");
    }
  }

  return lines.join("\n");
}

// Generate both files
const llmsTxt = generateLlmsTxt();
const llmsFullTxt = generateLlmsFullTxt();

fs.writeFileSync(path.join(PUBLIC_DIR, "llms.txt"), llmsTxt);
fs.writeFileSync(path.join(PUBLIC_DIR, "llms-full.txt"), llmsFullTxt);

console.log("Generated llms.txt and llms-full.txt in public/");
