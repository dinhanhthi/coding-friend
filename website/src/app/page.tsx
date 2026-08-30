import { MDXRemote } from "next-mdx-remote/rsc";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import TableOfContents from "@/components/TableOfContents";
import CodeBlock from "@/components/CodeBlock";
import MdxLink from "@/components/MdxLink";
import ZoomableImage from "@/components/ZoomableImage";
import CompareSplit from "@/components/CompareSplit";
import {
  readIndexMd,
  extractCompareSplit,
  getSections,
  getTocItems,
  mdxOptions,
} from "@/lib/mdx";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

const PLUGIN_VERSION = process.env.NEXT_PUBLIC_PLUGIN_VERSION;
const CLI_VERSION = process.env.NEXT_PUBLIC_CLI_VERSION;

const footerLinkClass =
  "hover:text-ink underline-offset-4 transition-colors duration-150 hover:underline whitespace-nowrap";

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

/**
 * The hero component carries the title + tagline, so drop the markdown's
 * leading `# …` heading and the italic `_…_` tagline line right after it.
 * If the content no longer starts that way, render it unchanged.
 */
function stripHeroContent(source: string): string {
  return source.replace(/^# .+\n+_[^\n]+_\n+/, "");
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
  const compare = extractCompareSplit(source);
  const sections = getSections(source);
  const tocItems = getTocItems(source);
  const before = compare
    ? stripHeroContent(compare.before)
    : stripHeroContent(source);
  const after = compare?.after ?? "";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar sections={sections} tocItems={tocItems} />
      <Hero />
      <TableOfContents items={tocItems} />
      <main id="top" className="mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6">
        <article className="prose prose-code:before:content-none prose-code:after:content-none max-w-none">
          <MDXRemote
            source={before}
            components={{ pre: CodeBlock, a: MdxLink, img: ZoomableImage }}
            options={mdxOptions}
          />
          {compare ? (
            <CompareSplit without={compare.without} withCf={compare.withCf} />
          ) : null}
          {after ? (
            <MDXRemote
              source={after}
              components={{ pre: CodeBlock, a: MdxLink, img: ZoomableImage }}
              options={mdxOptions}
            />
          ) : null}
        </article>
      </main>
      <footer className="border-rule border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <p className="font-display text-ink max-w-[26ch] text-[clamp(1.8rem,2.2vw+1rem,2.6rem)] leading-[1.12] tracking-[0.012em] lowercase">
            plan. implement. review. ship. remember.
          </p>
          <div className="text-muted mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm lowercase">
            <span className="whitespace-nowrap">
              Made by{" "}
              <FooterLink href="https://dinhanhthi.com">
                Anh-Thi Dinh
              </FooterLink>
            </span>
            <span aria-hidden="true">·</span>
            <FooterLink href="https://github.com/dinhanhthi/coding-friend/releases">
              Changelog
            </FooterLink>
            {PLUGIN_VERSION ? (
              <>
                <span aria-hidden="true">·</span>
                <FooterLink href="https://github.com/dinhanhthi/coding-friend/releases">
                  plugin <span className="font-mono">v{PLUGIN_VERSION}</span>
                </FooterLink>
              </>
            ) : null}
            {CLI_VERSION ? (
              <>
                <span aria-hidden="true">·</span>
                <FooterLink href="https://www.npmjs.com/package/coding-friend-cli">
                  cli <span className="font-mono">v{CLI_VERSION}</span>
                </FooterLink>
              </>
            ) : null}
          </div>
        </div>
      </footer>
    </>
  );
}
