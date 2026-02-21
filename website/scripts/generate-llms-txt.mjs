/**
 * Generate llms.txt and llms-full.txt for the website.
 * See https://llmstxt.org/ for the specification.
 *
 * - llms.txt: Structured index with links to each doc page
 * - llms-full.txt: Full content of all docs inlined
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DIR = path.join(ROOT, "src/content/docs");
const PUBLIC_DIR = path.join(ROOT, "public");
const SITE_URL = "https://coding-friend.com";

// Navigation structure (mirrors src/lib/navigation.ts)
const navigation = [
  {
    title: "Getting Started",
    items: [
      { title: "Installation", slug: "getting-started/installation" },
      { title: "Quick Start", slug: "getting-started/quick-start" },
    ],
  },
  {
    title: "Skills",
    items: [
      { title: "Overview", slug: "skills/overview" },
      { title: "/cf-plan", slug: "skills/cf-plan" },
      { title: "/cf-fix", slug: "skills/cf-fix" },
      { title: "/cf-ask", slug: "skills/cf-ask" },
      { title: "/cf-optimize", slug: "skills/cf-optimize" },
      { title: "/cf-review", slug: "skills/cf-review" },
      { title: "/cf-commit", slug: "skills/cf-commit" },
      { title: "/cf-ship", slug: "skills/cf-ship" },
      { title: "/cf-remember", slug: "skills/cf-remember" },
      { title: "/cf-learn", slug: "skills/cf-learn" },
      { title: "/cf-research", slug: "skills/cf-research" },
    ],
  },
  {
    title: "Auto-Invoked Skills",
    items: [
      { title: "cf-tdd", slug: "skills/cf-tdd" },
      { title: "cf-sys-debug", slug: "skills/cf-sys-debug" },
      { title: "cf-code-review", slug: "skills/cf-code-review" },
      { title: "cf-verification", slug: "skills/cf-verification" },
    ],
  },
  {
    title: "CLI Commands",
    items: [
      { title: "Overview", slug: "cli/overview" },
      { title: "cf init", slug: "cli/cf-init" },
      { title: "cf host", slug: "cli/cf-host" },
      { title: "cf mcp", slug: "cli/cf-mcp" },
      { title: "cf statusline", slug: "cli/cf-statusline" },
      { title: "cf update", slug: "cli/cf-update" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { title: "Config File", slug: "configuration/config-json" },
      { title: "Ignore Patterns", slug: "configuration/ignore-patterns" },
      { title: "Privacy", slug: "configuration/privacy" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Agents", slug: "reference/agents" },
      { title: "Hooks", slug: "reference/hooks" },
      { title: "Security", slug: "reference/security" },
      { title: "Multi-Platform", slug: "reference/multi-platform" },
    ],
  },
];

function readDoc(slug) {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return { frontmatter: data, content: content.trim() };
}

function docUrl(slug) {
  return `${SITE_URL}/docs/${slug}/`;
}

function stripMdxComponents(content) {
  // Remove MDX import statements
  content = content.replace(/^import\s+.*$/gm, "");
  // Remove JSX-style component usage like <Callout>...</Callout>
  content = content.replace(/<Callout[^>]*>([\s\S]*?)<\/Callout>/g, "> $1");
  return content.trim();
}

function generateLlmsTxt() {
  const lines = [];

  lines.push("# Coding Friend");
  lines.push("");
  lines.push(
    "> Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code. It provides skills (slash commands), auto-invoked agents, CLI tools, and multi-platform support for structured development practices like TDD, code review, and smart commits."
  );
  lines.push("");

  for (const section of navigation) {
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
  const lines = [];

  lines.push("# Coding Friend");
  lines.push("");
  lines.push(
    "> Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code. It provides skills (slash commands), auto-invoked agents, CLI tools, and multi-platform support for structured development practices like TDD, code review, and smart commits."
  );
  lines.push("");

  for (const section of navigation) {
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
