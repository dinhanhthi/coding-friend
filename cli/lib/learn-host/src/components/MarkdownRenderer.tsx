import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-slate prose-headings:scroll-mt-20 prose-a:text-link prose-code:before:content-none prose-code:after:content-none dark:prose-invert dark:prose-a:text-link max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeSlug]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
