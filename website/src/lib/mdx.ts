import GithubSlugger from "github-slugger";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { visit } from "unist-util-visit";
import indexMd from "@/content/index.md";

/**
 * rehype plugin: ensure fenced <pre><code> elements have the "hljs" class
 * so highlight.js theme CSS applies uniformly. Skip inline code.
 */
export function rehypeCodeHljs() {
  return (tree: any) => {
    visit(tree, "element", (node: any, _index: any, parent: any) => {
      if (node.tagName !== "code") return;
      if (!parent || parent.tagName !== "pre") return;
      if (node.properties?.className?.includes("hljs")) return;
      node.properties = node.properties || {};
      node.properties.className = [
        ...(node.properties.className || []),
        "hljs",
      ];
    });
  };
}

const CF_KEYWORD_RE = /\/?cf(?:-[\w]+)*\b|\/plugin\b/g;

/**
 * rehype plugin: highlight cf-* keywords inside <code> blocks.
 * Wraps matches in <span class="hljs-cf-keyword">.
 * Only applies to code blocks (inside <pre>), not inline code.
 */
export function rehypeHighlightCfKeywords() {
  return (tree: any) => {
    visit(tree, "element", (node: any, _index: any, parent: any) => {
      if (node.tagName !== "code") return;
      if (!parent || parent.tagName !== "pre") return;

      const newChildren: any[] = [];
      let changed = false;

      for (const child of node.children) {
        if (child.type !== "text") {
          newChildren.push(child);
          continue;
        }

        const text = child.value as string;
        let lastIndex = 0;
        CF_KEYWORD_RE.lastIndex = 0;
        let match;
        let childHasMatch = false;

        while ((match = CF_KEYWORD_RE.exec(text)) !== null) {
          changed = true;
          childHasMatch = true;
          if (match.index > lastIndex) {
            newChildren.push({
              type: "text",
              value: text.slice(lastIndex, match.index),
            });
          }
          newChildren.push({
            type: "element",
            tagName: "span",
            properties: { className: ["hljs-cf-keyword"] },
            children: [{ type: "text", value: match[0] }],
          });
          lastIndex = match.index + match[0].length;
        }

        if (childHasMatch) {
          if (lastIndex < text.length) {
            newChildren.push({
              type: "text",
              value: text.slice(lastIndex),
            });
          }
        } else {
          newChildren.push(child);
        }
      }

      if (changed) {
        node.children = newChildren;
      }
    });
  };
}

/**
 * Treat raw HTML in markdown as literal text so `{docsDir}` / `<host>`
 * (and similar) render escaped instead of being dropped as unknown tags.
 * `format: "md"` already disables MDX expressions; CommonMark still parses HTML.
 */
export function remarkHtmlAsText() {
  return (tree: any) => {
    visit(tree, "html", (node: any) => {
      node.type = "text";
    });
  };
}

export function readIndexMd(): string {
  return indexMd;
}

/** Strip emoji so slugs stay `#supported-ai-coding-tools`, not `#-supported-ai-coding-tools`. */
export function headingTextForSlug(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/[\uFE0F\u200D]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hastToText(node: {
  type?: string;
  value?: string;
  children?: unknown[];
}): string {
  if (node.type === "text") return node.value ?? "";
  if (!Array.isArray(node.children)) return "";
  return node.children
    .map((child) => hastToText(child as typeof node))
    .join("");
}

/**
 * Set heading ids from emoji-stripped text so navbar hashes match
 * README links. Runs before rehype-slug, which skips existing ids.
 */
export function rehypeStableHeadingIds() {
  return (tree: any) => {
    const slugger = new GithubSlugger();
    visit(tree, "element", (node: any) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      if (node.properties?.id) return;
      const text = headingTextForSlug(hastToText(node));
      if (!text) return;
      node.properties = node.properties || {};
      node.properties.id = slugger.slug(text);
    });
  };
}

export type TocItem = { id: string; text: string; level: 2 | 3 };

function parseHeadings(
  source: string,
): { id: string; text: string; level: number }[] {
  const withoutFences = source.replace(/```[\s\S]*?```/g, "");
  const slugger = new GithubSlugger();
  const headings: { id: string; text: string; level: number }[] = [];

  for (const match of withoutFences.matchAll(/^(#{1,6}) (.+)$/gm)) {
    const level = match[1].length;
    let text = (match[2] ?? "").trim();
    if (!text || text.startsWith("#")) continue;
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    headings.push({
      id: slugger.slug(headingTextForSlug(text)),
      text,
      level,
    });
  }

  return headings;
}

export function getSections(source: string): { id: string; text: string }[] {
  return parseHeadings(source)
    .filter((heading) => heading.level === 2)
    .map(({ id, text }) => ({ id, text: headingTextForSlug(text) }));
}

export function getTocItems(source: string): TocItem[] {
  return parseHeadings(source)
    .filter((heading) => heading.level === 2 || heading.level === 3)
    .map((heading) => ({
      id: heading.id,
      text: headingTextForSlug(heading.text),
      level: heading.level as 2 | 3,
    }));
}

export const mdxOptions = {
  mdxOptions: {
    format: "md" as const,
    remarkPlugins: [remarkGfm, remarkHtmlAsText],
    rehypePlugins: [
      rehypeHighlight,
      rehypeCodeHljs,
      rehypeHighlightCfKeywords,
      rehypeStableHeadingIds,
      rehypeSlug,
    ],
  },
  blockJS: false,
};
