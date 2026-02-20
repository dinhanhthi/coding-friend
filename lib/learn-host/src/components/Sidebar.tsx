import Link from "next/link";
import type { CategoryInfo } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";
import SearchBar from "./SearchBar";

export default function Sidebar({ categories }: { categories: CategoryInfo[] }) {
  const totalDocs = categories.reduce((sum, c) => sum + c.docCount, 0);

  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 dark:border-gray-700 h-screen sticky top-0 overflow-y-auto bg-gray-50 dark:bg-gray-900 hidden md:block">
      <div className="p-4">
        <Link href="/" className="block mb-4">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Learning Notes
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {totalDocs} docs &middot; {categories.length} categories
          </p>
        </Link>

        <SearchBar />

        <nav className="mt-6 space-y-1">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/${cat.name}/`}
              className="flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <span className="capitalize">{cat.name.replace(/[_-]/g, " ")}</span>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                {cat.docCount}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700">
        <ThemeToggle />
      </div>
    </aside>
  );
}
