import { getAllDocs, getDocBySlug, extractHeadings } from "@/lib/docs";
import Breadcrumbs from "@/components/Breadcrumbs";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import TableOfContents from "@/components/TableOfContents";
import TagBadge from "@/components/TagBadge";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  return getAllDocs().map((d) => ({
    category: d.category,
    slug: d.slug,
  }));
}

export const dynamicParams = true;

export default async function DocPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const doc = getDocBySlug(category, slug);
  if (!doc) notFound();

  const categoryDisplay = category.replace(/[_-]/g, " ");
  const headings = extractHeadings(doc.content);

  return (
    <div className="flex w-full">
      <article className="min-w-0 flex-1" data-pagefind-body>
        <Breadcrumbs
          crumbs={[
            { label: categoryDisplay, href: `/${category}/` },
            { label: doc.frontmatter.title },
          ]}
        />

        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">{doc.frontmatter.title}</h1>
          {(doc.frontmatter.created || doc.frontmatter.updated) && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              {doc.frontmatter.created && (
                <span>Created: {doc.frontmatter.created}</span>
              )}
              {doc.frontmatter.updated && (
                <span>Updated: {doc.frontmatter.updated}</span>
              )}
            </div>
          )}
          {doc.frontmatter.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {doc.frontmatter.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          )}
        </header>

        <MarkdownRenderer content={doc.content} />
      </article>

      <TableOfContents headings={headings} />
    </div>
  );
}
