import Link from "next/link";
import TagBadge from "./TagBadge";
import type { DocMeta } from "@/lib/types";

export default function DocCard({ doc }: { doc: DocMeta }) {
  return (
    <Link
      href={`/${doc.category}/${doc.slug}/`}
      className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all bg-white dark:bg-gray-800/50"
    >
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
        {doc.frontmatter.title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
        {doc.excerpt}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {doc.frontmatter.tags.slice(0, 3).map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          {doc.frontmatter.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{doc.frontmatter.tags.length - 3}</span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {doc.frontmatter.updated || doc.frontmatter.created}
        </span>
      </div>
    </Link>
  );
}
