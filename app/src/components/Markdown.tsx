import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { classifyLink } from "@/lib/markdown-links";

const LINK =
  "cursor-default text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none";

/** Typography for the rendered tree (no typography plugin: arbitrary variants on the root). */
const PROSE = [
  "min-w-0 text-sm leading-relaxed text-ink-2 break-words",
  "[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-ink",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink",
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink",
  "[&_:is(h4,h5,h6)]:mt-4 [&_:is(h4,h5,h6)]:mb-1 [&_:is(h4,h5,h6)]:font-semibold [&_:is(h4,h5,h6)]:text-ink",
  "[&>:first-child]:mt-0 [&_p]:my-3 [&_hr]:my-6 [&_hr]:border-rule",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-rule-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted",
  "[&_code]:rounded [&_code]:bg-paper-3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-rule [&_pre]:bg-paper-2 [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-3 [&_table]:block [&_table]:overflow-x-auto [&_table]:border-collapse",
  "[&_:is(th,td)]:border [&_:is(th,td)]:border-rule [&_:is(th,td)]:px-2 [&_:is(th,td)]:py-1 [&_th]:bg-paper-2 [&_th]:text-left [&_th]:font-medium",
].join(" ");

/**
 * Renders untrusted markdown (docs, memory, learn): no raw HTML (`skipHtml`), no rehype
 * plugin, images as `[image: alt]` text (never fetched), links per `classifyLink`. No link
 * is a real `<a href>`, so nothing in the content can navigate the webview.
 */
export function Markdown({
  content,
  currentPath,
  onNavigate,
  onOpenExternal,
}: {
  content: string;
  /** The rendered file, relative to its tree: relative `.md` links resolve from it. */
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenExternal: (url: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      // The default `urlTransform` already emptied `javascript:`, `data:`, … hrefs.
      a({ href = "", children }) {
        const target = classifyLink(href, currentPath);
        if (target.kind === "text")
          return <span title={href || undefined}>{children}</span>;
        const open =
          target.kind === "internal"
            ? () => onNavigate(target.path)
            : () => onOpenExternal(target.url);
        return (
          <button
            type="button"
            className={LINK}
            title={target.kind === "internal" ? target.path : target.url}
            onClick={open}
          >
            {children}
          </button>
        );
      },
      img({ alt }) {
        return (
          <span className="text-muted">
            {alt ? `[image: ${alt}]` : "[image]"}
          </span>
        );
      },
    }),
    [currentPath, onNavigate, onOpenExternal],
  );

  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
