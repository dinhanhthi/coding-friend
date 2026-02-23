"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import TagBadge from "./TagBadge";
import type { DocMeta } from "@/lib/types";

export default function DocCard({ doc }: { doc: DocMeta }) {
  const router = useRouter();
  const href = `/${doc.category}/${doc.slug}/`;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      className="dark:bg-navy-800/50 block cursor-pointer rounded-lg border border-slate-200 bg-white p-4 transition-all hover:border-violet-400/50 hover:shadow-sm dark:border-[#a0a0a01c] dark:hover:border-violet-400/50"
    >
      <h3 className="mb-1 font-semibold text-slate-900 dark:text-slate-100">
        <Link href={href} className="hover:underline">
          {doc.frontmatter.title}
        </Link>
      </h3>
      <p className="mb-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
        {doc.excerpt}
      </p>
      <div className="flex items-center justify-between">
        <div
          className="flex flex-wrap gap-2 items-center"
          onClick={(e) => e.stopPropagation()}
        >
          {doc.frontmatter.tags.slice(0, 3).map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          {doc.frontmatter.tags.length > 3 && (
            <span className="text-xs text-slate-400">
              +{doc.frontmatter.tags.length - 3}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {doc.frontmatter.updated || doc.frontmatter.created}
        </span>
      </div>
    </div>
  );
}
