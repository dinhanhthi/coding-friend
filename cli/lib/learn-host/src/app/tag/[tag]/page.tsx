import { getAllTags, getDocsByTag } from "@/lib/docs";
import DocCard from "@/components/DocCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  return getAllTags().map((t) => ({ tag: t.tag }));
}

export const dynamicParams = true;

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const docs = getDocsByTag(tag);
  if (docs.length === 0) notFound();

  return (
    <div>
      <Breadcrumbs crumbs={[{ label: `# ${tag}` }]} />
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <span className="text-slate-400 dark:text-slate-500">#</span>
        {tag}
      </h1>
      <p className="mb-6 pl-0.5 text-slate-500 dark:text-slate-400">
        {docs.length} {docs.length === 1 ? "doc" : "docs"}
      </p>

      <div className="grid gap-3">
        {docs.map((doc) => (
          <DocCard key={`${doc.category}/${doc.slug}`} doc={doc} />
        ))}
      </div>
    </div>
  );
}
