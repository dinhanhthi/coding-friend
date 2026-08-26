import { MDXRemote } from "next-mdx-remote/rsc";
import Navbar from "@/components/Navbar";
import CodeBlock from "@/components/CodeBlock";
import MdxLink from "@/components/MdxLink";
import { readIndexMd, getSections, mdxOptions } from "@/lib/mdx";

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Coding Friend",
    description:
      "A lean toolkit for systematic debugging, smart commits, code review, and knowledge capture — with optional TDD support across your engineering workflow.",
    url: "https://cf.dinhanhthi.com",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Person",
      name: "Anh-Thi Dinh",
      url: "https://dinhanhthi.com",
    },
  };

  const source = readIndexMd();
  const sections = getSections(source);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar sections={sections} />
      <main id="top" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <article className="prose prose-invert prose-headings:text-heading prose-a:text-link prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none max-w-none">
          <MDXRemote
            source={source}
            components={{ pre: CodeBlock, a: MdxLink }}
            options={mdxOptions}
          />
        </article>
      </main>
      <footer className="text-text-muted mx-auto max-w-3xl px-4 py-10 text-sm sm:px-6">
        Made by <a href="https://dinhanhthi.com">Anh-Thi Dinh</a> ·{" "}
        <a href="https://github.com/dinhanhthi/coding-friend">GitHub</a> ·{" "}
        <a href="https://www.npmjs.com/package/coding-friend-cli">npm</a>
      </footer>
    </>
  );
}
