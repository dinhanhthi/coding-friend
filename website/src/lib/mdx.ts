import { visit } from "unist-util-visit";

/**
 * rehype plugin: ensure all <pre><code> elements have the "hljs" class
 * so highlight.js theme CSS applies uniformly.
 */
export function rehypeCodeHljs() {
  return (tree: any) => {
    visit(tree, "element", (node: any) => {
      if (
        node.tagName === "code" &&
        node.properties &&
        !node.properties.className?.includes("hljs")
      ) {
        node.properties.className = [
          ...(node.properties.className || []),
          "hljs",
        ];
      }
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
