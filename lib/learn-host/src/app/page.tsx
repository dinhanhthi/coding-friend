import { getAllCategories, getAllDocs, getAllTags } from "@/lib/docs";
import DocCard from "@/components/DocCard";
import TagBadge from "@/components/TagBadge";
import Link from "next/link";

export default function HomePage() {
  const categories = getAllCategories();
  const docs = getAllDocs();
  const tags = getAllTags();
  const recentDocs = docs.slice(0, 10);

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">Learning Notes</h1>
      <p className="mb-8 text-slate-500 dark:text-slate-400">
        {docs.length} docs across {categories.length} categories
      </p>

      {/* Categories */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/${cat.name}/`}
              className="rounded-lg border border-slate-200 p-3 transition-colors hover:border-violet-400/50 dark:border-[#a0a0a01c] dark:hover:border-violet-400/50"
            >
              <div className="font-medium text-slate-900 capitalize dark:text-slate-100">
                {cat.name.replace(/[_-]/g, " ")}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {cat.docCount} {cat.docCount === 1 ? "doc" : "docs"}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Tags */}
      {tags.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 20).map(({ tag }) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Docs */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recently Updated</h2>
        <div className="grid gap-3">
          {recentDocs.map((doc) => (
            <DocCard key={`${doc.category}/${doc.slug}`} doc={doc} />
          ))}
        </div>
      </section>
    </div>
  );
}
