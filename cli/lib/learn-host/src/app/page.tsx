import { getAllCategories, getAllDocs, getAllTags } from "@/lib/docs";
import DocCard from "@/components/DocCard";
import TagBadge from "@/components/TagBadge";
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  const categories = getAllCategories();
  const docs = getAllDocs();
  const tags = getAllTags();
  const recentDocs = docs.slice(0, 10);

  return (
    <div className="mx-auto">
      {/* Hero */}
      <section className="mb-12 flex flex-col items-center pt-8 text-center md:pt-14">
        <Image
          src="/logo.svg"
          alt="Learning Notes"
          width={64}
          height={64}
          className="mb-5"
        />
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl dark:text-white">
          Learning Notes
        </h1>
        <p className="max-w-lg text-lg text-slate-500 dark:text-slate-400">
          A personal knowledge base with{" "}
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {docs.length}
          </span>{" "}
          docs across{" "}
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {categories.length}
          </span>{" "}
          categories
        </p>
      </section>

      {/* Categories */}
      <section className="mb-12">
        <h2 className="mb-5 text-xl font-semibold text-slate-900 dark:text-white">
          Categories
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/${cat.name}/`}
              className="group dark:bg-navy-800/50 relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md hover:shadow-amber-100/50 dark:border-[#a0a0a01c] dark:hover:border-amber-500/40 dark:hover:shadow-amber-900/20"
            >
              <div className="mb-1 font-medium text-slate-900 capitalize dark:text-slate-100">
                {cat.name.replace(/[_-]/g, " ")}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {cat.docCount} {cat.docCount === 1 ? "doc" : "docs"}
              </div>
              <div className="dark:bg-navy-950 absolute right-3 bottom-3 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {cat.docCount}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Tags */}
      {tags.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-5 text-xl font-semibold text-slate-900 dark:text-white">
            Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 24).map(({ tag }) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Docs */}
      <section>
        <h2 className="mb-5 text-xl font-semibold text-slate-900 dark:text-white">
          Recently Updated
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {recentDocs.map((doc) => (
            <DocCard key={`${doc.category}/${doc.slug}`} doc={doc} />
          ))}
        </div>
      </section>
    </div>
  );
}
