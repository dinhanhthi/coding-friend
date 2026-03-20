"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
      className="hover:border-navy-400 dark:bg-navy-900/80 dark:hover:bg-navy-800/60 block cursor-pointer rounded-xl border border-slate-300 p-4 transition-all duration-200 hover:-translate-y-0.5 dark:border-[#a0a0a01c]"
    >
      <h3 className="mb-2 font-medium text-slate-900 dark:text-slate-100">
        <Link href={href}>{doc.frontmatter.title}</Link>
      </h3>
      <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {doc.excerpt}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {doc.frontmatter.tags.slice(0, 3).map((tag) => (
            <Link
              key={tag}
              href={`/tag/${encodeURIComponent(tag)}/`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-600/50 dark:text-slate-300"
            >
              {tag}
            </Link>
          ))}
          {doc.frontmatter.tags.length > 3 && (
            <span className="text-xs text-slate-400">
              +{doc.frontmatter.tags.length - 3}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {doc.frontmatter.updated &&
          doc.frontmatter.updated !== doc.frontmatter.created
            ? doc.frontmatter.updated
            : doc.frontmatter.created}
        </span>
      </div>
    </div>
  );
}
