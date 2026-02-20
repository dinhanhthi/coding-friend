import { getAllCategories, getDocsByCategory } from "@/lib/docs";
import DocCard from "@/components/DocCard";
import Breadcrumbs from "@/components/Breadcrumbs";

export async function generateStaticParams() {
  return getAllCategories().map((c) => ({ category: c.name }));
}

export const dynamicParams = false;

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const docs = getDocsByCategory(category);
  const displayName = category.replace(/[_-]/g, " ");

  return (
    <div>
      <Breadcrumbs crumbs={[{ label: displayName }]} />
      <h1 className="text-2xl font-bold capitalize mb-1">{displayName}</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        {docs.length} {docs.length === 1 ? "doc" : "docs"}
      </p>

      <div className="grid gap-3">
        {docs.map((doc) => (
          <DocCard key={doc.slug} doc={doc} />
        ))}
      </div>
    </div>
  );
}
