import { MDXRemote } from "next-mdx-remote/rsc";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import TableOfContents from "@/components/TableOfContents";
import CodeBlock from "@/components/CodeBlock";
import MdxLink from "@/components/MdxLink";
import { readIndexMd, getSections, getTocItems, mdxOptions } from "@/lib/mdx";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

const PLUGIN_VERSION = process.env.NEXT_PUBLIC_PLUGIN_VERSION;
const CLI_VERSION = process.env.NEXT_PUBLIC_CLI_VERSION;

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
      <footer className="border-border bg-nav fixed inset-x-0 bottom-0 z-50 border-t">
        <div className="text-text-muted mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-1 px-4 py-3 text-sm sm:flex-row sm:gap-x-2">
          <span className="text-center whitespace-nowrap">
            💝 Made by{" "}
            <FooterLink href="https://dinhanhthi.com">Anh-Thi Dinh</FooterLink>
          </span>
          <span className="hidden sm:block" aria-hidden="true">
            •
          </span>
          <div className="flex items-center gap-x-2">
            <FooterLink href="https://github.com/dinhanhthi/coding-friend/releases">
              Changelog
            </FooterLink>
          </div>
          {PLUGIN_VERSION || CLI_VERSION ? (
            <>
              <span className="hidden sm:block" aria-hidden="true">
                •
              </span>
              <div className="flex items-center gap-x-2">
                {PLUGIN_VERSION ? (
                  <FooterLink href="https://github.com/dinhanhthi/coding-friend/releases">
                    plugin <span className="font-mono">v{PLUGIN_VERSION}</span>
                  </FooterLink>
                ) : null}
                {PLUGIN_VERSION && CLI_VERSION ? (
                  <span aria-hidden="true">•</span>
                ) : null}
                {CLI_VERSION ? (
                  <FooterLink href="https://www.npmjs.com/package/coding-friend-cli">
                    cli <span className="font-mono">v{CLI_VERSION}</span>
                  </FooterLink>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </footer>
    </>
  );
}
