import { getAllDocs, getDocBySlug } from "@/lib/docs";
import Breadcrumbs from "@/components/Breadcrumbs";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import TagBadge from "@/components/TagBadge";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  return getAllDocs().map((d) => ({
    category: d.category,
    slug: d.slug,
  }));
}

export const dynamicParams = true;
export const revalidate = 10;

export default async function DocPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const doc = getDocBySlug(category, slug);
  if (!doc) notFound();

  const categoryDisplay = category.replace(/[_-]/g, " ");

  return (
    <article data-pagefind-body>
      <Breadcrumbs
        crumbs={[
          { label: categoryDisplay, href: `/${category}/` },
          { label: doc.frontmatter.title },
        ]}
      />

      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{doc.frontmatter.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="capitalize px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
            {categoryDisplay}
          </span>
          {doc.frontmatter.created && (
            <span>Created: {doc.frontmatter.created}</span>
          )}
          {doc.frontmatter.updated && (
            <span>Updated: {doc.frontmatter.updated}</span>
          )}
        </div>
        {doc.frontmatter.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {doc.frontmatter.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
      </header>

      <MarkdownRenderer content={doc.content} />
    </article>
  );
}
