import { MDXRemote } from "next-mdx-remote/rsc";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import TableOfContents from "@/components/TableOfContents";
import CodeBlock from "@/components/CodeBlock";
import MdxLink from "@/components/MdxLink";
import ZoomableImage from "@/components/ZoomableImage";
import CompareSplit from "@/components/CompareSplit";
import LatestChanges from "@/components/LatestChanges";
import {
  readIndexMd,
  extractCompareSplit,
  getSections,
  getTocItems,
  mdxOptions,
} from "@/lib/mdx";
import { getRecentChanges } from "@/lib/changelog";
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

/**
 * Split the leading `> 💡 …` tip blockquote off so the latest-changes box can
 * sit between it and the rest of the document. Falls back to rendering the
 * source whole if the content no longer opens with a blockquote.
 */
function splitLeadingTip(source: string): { tip: string; rest: string } {
  if (!source.startsWith("> ")) return { tip: "", rest: source };
  const end = source.indexOf("\n\n");
  if (end < 0) return { tip: "", rest: source };
  return { tip: source.slice(0, end), rest: source.slice(end + 2) };
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
  const { tip, rest } = splitLeadingTip(before);
  const recentChanges = getRecentChanges();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="page">
        <Navbar sections={sections} />
        <main id="top">
          <div className="docs-layout">
            <TableOfContents items={tocItems} />
            <div className="docs-content">
              <Hero />
              <article className="prose prose-code:before:content-none prose-code:after:content-none max-w-none">
                {tip ? (
                  <MDXRemote
                    source={tip}
                    components={{
                      pre: CodeBlock,
                      a: MdxLink,
                      img: ZoomableImage,
                    }}
                    options={mdxOptions}
                  />
                ) : null}
                <LatestChanges entries={recentChanges} />
                <MDXRemote
                  source={rest}
                  components={{
                    pre: CodeBlock,
                    a: MdxLink,
                    img: ZoomableImage,
                  }}
                  options={mdxOptions}
                />
                {compare ? (
                  <CompareSplit
                    without={compare.without}
                    withCf={compare.withCf}
                  />
                ) : null}
                {after ? (
                  <MDXRemote
                    source={after}
                    components={{
                      pre: CodeBlock,
                      a: MdxLink,
                      img: ZoomableImage,
                    }}
                    options={mdxOptions}
                  />
                ) : null}
              </article>
            </div>
          </div>
        </main>
        <footer className="site-footer">
          <FooterLink href="https://github.com/dinhanhthi/coding-friend/blob/main/LICENSE">
            MIT
          </FooterLink>
          {" · "}
          Made by{" "}
          <FooterLink href="https://dinhanhthi.com">Anh-Thi Dinh</FooterLink>
          {" · "}
          <FooterLink href="https://github.com/dinhanhthi/coding-friend/releases">
            Changelog
          </FooterLink>
          {" · "}
          <FooterLink href="/llms.txt">
            llms.txt
          </FooterLink>
          {PLUGIN_VERSION ? (
            <>
              {" · "}
              <FooterLink href="https://github.com/dinhanhthi/coding-friend/releases">
                plugin v{PLUGIN_VERSION}
              </FooterLink>
            </>
          ) : null}
          {CLI_VERSION ? (
            <>
              {" · "}
              <FooterLink href="https://www.npmjs.com/package/coding-friend-cli">
                cli v{CLI_VERSION}
              </FooterLink>
            </>
          ) : null}
        </footer>
      </div>
    </>
  );
}
