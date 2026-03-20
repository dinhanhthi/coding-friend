import { notFound, redirect } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { visit } from "unist-util-visit";
import { getDocBySlug, getAllDocSlugs, extractHeadings } from "@/lib/docs";
import { getPrevNext, flattenNavigation } from "@/lib/navigation";
import TableOfContents from "@/components/docs/TableOfContents";
import DocsBreadcrumbs from "@/components/docs/DocsBreadcrumbs";
import PrevNextNav from "@/components/docs/PrevNextNav";
import Callout from "@/components/docs/Callout";
import CodeBlock from "@/components/docs/CodeBlock";
import PackageManagerTabs from "@/components/docs/PackageManagerTabs";
import MdxLink from "@/components/docs/MdxLink";
import {
  BootstrapTokens,
  SlashCommandsTable,
  AutoSkillsTable,
  AgentsTable,
  OverviewSlashCommandsTable,
  OverviewAutoSkillsTable,
  AgentRefTable,
} from "@/components/docs/TokenTables";
import Badge from "@/components/ui/Badge";
import TokenBadge from "@/components/ui/TokenBadge";
import CopyForAiButton from "@/components/docs/CopyForAiButton";

/**
 * rehype plugin: ensure all <pre><code> elements have the "hljs" class
 * so highlight.js theme CSS applies uniformly.
 */
function rehypeCodeHljs() {
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
function rehypeHighlightCfKeywords() {
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

        while ((match = CF_KEYWORD_RE.exec(text)) !== null) {
          changed = true;
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

        if (lastIndex < text.length) {
          newChildren.push({
            type: "text",
            value: text.slice(lastIndex),
          });
        }
        if (!changed) {
          newChildren.push(child);
        }
      }

      if (changed) {
        node.children = newChildren;
      }
    });
  };
}

interface Props {
  params: Promise<{ slug?: string[] }>;
}

const mdxComponents = {
  Callout,
  PackageManagerTabs,
  pre: CodeBlock,
  a: MdxLink,
  BootstrapTokens,
  SlashCommandsTable,
  AutoSkillsTable,
  AgentsTable,
  OverviewSlashCommandsTable,
  OverviewAutoSkillsTable,
  AgentRefTable,
};

export async function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return slugs.map((slug) => ({
    slug: slug.split("/"),
  }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  if (!slug || slug.length === 0) return { title: "Documentation" };
  const slugStr = slug.join("/");
  const doc = getDocBySlug(slugStr);
  if (!doc) return {};
  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.description,
    keywords: doc.frontmatter.keywords,
    alternates: {
      canonical: `https://cf.dinhanhthi.com/docs/${slugStr}/`,
    },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;

  // Redirect /docs/ to /docs/getting-started/installation/
  if (!slug || slug.length === 0) {
    redirect("/docs/getting-started/installation/");
  }

  const slugStr = slug.join("/");
  const doc = getDocBySlug(slugStr);

  if (!doc) notFound();

  const headings = extractHeadings(doc.content);
  const { prev, next } = getPrevNext(slugStr);

  // Build breadcrumbs from slug
  const parts = slugStr.split("/");
  const navItems = flattenNavigation();
  const currentNav = navItems.find((item) => item.slug === slugStr);
  const breadcrumbs = [];
  if (currentNav) {
    breadcrumbs.push({ label: currentNav.section });
    breadcrumbs.push({ label: currentNav.title });
  } else {
    breadcrumbs.push({ label: parts[parts.length - 1] });
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://cf.dinhanhthi.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Docs",
        item: "https://cf.dinhanhthi.com/docs/",
      },
      ...breadcrumbs.map((bc, i) => ({
        "@type": "ListItem" as const,
        position: i + 3,
        name: bc.label,
        ...(i === breadcrumbs.length - 1
          ? { item: `https://cf.dinhanhthi.com/docs/${slugStr}/` }
          : {}),
      })),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <article
        className="min-w-0 flex-1 px-6 pt-6 pb-8 md:px-8"
        data-pagefind-body
      >
        <DocsBreadcrumbs items={breadcrumbs} />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-violet-400">
              {doc.frontmatter.title}
            </h1>
            {currentNav?.manualOnly && (
              <Badge className="border border-amber-500/50 bg-amber-900/30 text-amber-400">
                Manual only
              </Badge>
            )}
            {currentNav?.tier && (
              <TokenBadge tier={currentNav.tier} size="lg" />
            )}
          </div>
          <CopyForAiButton
            content={doc.content}
            title={doc.frontmatter.title}
          />
        </div>

        {doc.frontmatter.description && (
          <p className="mb-6 text-lg leading-relaxed text-slate-400">
            {doc.frontmatter.description}
          </p>
        )}

        {/* divider */}
        <div className="mb-8 h-px dark:bg-slate-600" />

        <div className="prose prose-invert prose-headings:font-semibold prose-a:text-sky-300 prose-a:no-underline prose-a:hover:text-violet-400 prose-code:before:content-none prose-code:after:content-none prose-code:bg-navy-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-base max-w-none">
          <MDXRemote
            source={doc.content}
            components={mdxComponents}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
                rehypePlugins: [
                  rehypeHighlight,
                  rehypeCodeHljs,
                  rehypeHighlightCfKeywords,
                  rehypeSlug,
                ],
              },
              blockJS: false,
            }}
          />
        </div>

        <PrevNextNav prev={prev} next={next} />
      </article>

      <TableOfContents headings={headings} />
    </>
  );
}
