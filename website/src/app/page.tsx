import { MDXRemote } from "next-mdx-remote/rsc";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import TableOfContents from "@/components/TableOfContents";
import CodeBlock from "@/components/CodeBlock";
import MdxLink from "@/components/MdxLink";
import { readIndexMd, getSections, getTocItems, mdxOptions } from "@/lib/mdx";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

const footerLinkClass =
  "hover:text-heading underline-offset-4 transition-colors duration-150 hover:underline";

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={footerLinkClass}
    >
      {children}
    </a>
  );
}

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
  const tocItems = getTocItems(source);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar sections={sections} />
      <TableOfContents items={tocItems} />
      <main id="top" className="mx-auto max-w-3xl px-4 pt-12 pb-24 sm:px-6">
        <article className="prose prose-invert prose-headings:text-heading prose-a:text-link prose-a:no-underline prose-code:before:content-none prose-code:after:content-none max-w-none">
          <MDXRemote
            source={source}
            components={{ pre: CodeBlock, a: MdxLink }}
            options={mdxOptions}
          />
        </article>
      </main>
      <footer className="border-border bg-nav fixed inset-x-0 bottom-0 z-50 h-14 border-t">
        <div className="text-text-muted mx-auto flex h-full max-w-3xl items-center gap-x-4 px-4 text-sm sm:px-6">
          <span>
            Made by{" "}
            <FooterLink href="https://dinhanhthi.com">Anh-Thi Dinh</FooterLink>
          </span>
          <span aria-hidden="true">•</span>
          <FooterLink href="https://github.com/dinhanhthi/coding-friend">
            GitHub
          </FooterLink>
          <span aria-hidden="true">•</span>
          <FooterLink href="https://www.npmjs.com/package/coding-friend-cli">
            npm
          </FooterLink>
          <span aria-hidden="true">•</span>
          <FooterLink href="https://github.com/dinhanhthi/coding-friend/releases">
            Changelog
          </FooterLink>
        </div>
      </footer>
    </>
  );
}
