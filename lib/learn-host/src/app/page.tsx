import { getAllCategories, getAllDocs, getAllTags } from "@/lib/docs";
import DocCard from "@/components/DocCard";
import TagBadge from "@/components/TagBadge";
import Link from "next/link";

export const revalidate = 10;

export default function HomePage() {
  const categories = getAllCategories();
  const docs = getAllDocs();
  const tags = getAllTags();
  const recentDocs = docs.slice(0, 10);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Learning Notes</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        {docs.length} docs across {categories.length} categories
      </p>

      {/* Categories */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Categories</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/${cat.name}/`}
              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              <div className="font-medium capitalize text-gray-900 dark:text-gray-100">
                {cat.name.replace(/[_-]/g, " ")}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {cat.docCount} {cat.docCount === 1 ? "doc" : "docs"}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Tags */}
      {tags.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 20).map(({ tag }) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Docs */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recently Updated</h2>
        <div className="grid gap-3">
          {recentDocs.map((doc) => (
            <DocCard key={`${doc.category}/${doc.slug}`} doc={doc} />
          ))}
        </div>
      </section>
    </div>
  );
}
