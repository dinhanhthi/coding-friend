import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import CodeBlock from "@/components/CodeBlock";
import CopyableBlockquote from "@/components/CopyableBlockquote";
import MdxLink from "@/components/MdxLink";
import ScrollTable from "@/components/ScrollTable";
import TableOfContents from "@/components/TableOfContents";
import ZoomableImage from "@/components/ZoomableImage";
import { stripHeroContent } from "@/lib/landing";
import { getTocItems, mdxOptions, readIndexMd } from "@/lib/mdx";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Install Coding Friend, then every skill, flag, agent, hook and config option.",
  alternates: { canonical: "/docs/" },
};

export default function DocsPage() {
  const source = readIndexMd();
  const tocItems = getTocItems(source);

  return (
    <main className="doc-page shell">
      <TableOfContents items={tocItems} />
      <div className="doc-page__body">
        <header className="doc-page__head">
          <h1>Docs</h1>
          <p>
            Install Coding Friend, then every skill, flag, agent, hook and
            config option, on one page.
          </p>
        </header>
        <article className="prose prose-code:before:content-none prose-code:after:content-none max-w-none">
          <MDXRemote
            source={stripHeroContent(source)}
            components={{
              pre: CodeBlock,
              blockquote: CopyableBlockquote,
              a: MdxLink,
              img: ZoomableImage,
              table: ScrollTable,
            }}
            options={mdxOptions}
          />
        </article>
      </div>
    </main>
  );
}
