"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryInfo } from "@/lib/types";

export default function Sidebar({
  categories,
}: {
  categories: CategoryInfo[];
}) {
  const pathname = usePathname();

  return (
    <aside className="dark:bg-navy-950 fixed top-14 left-0 z-10 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:flex md:flex-col lg:w-[300px] dark:border-[#a0a0a01c]">
      <nav
        className="scrollbar-none flex-1 space-y-1 overflow-y-auto p-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {categories.map((cat) => {
          const isActive = pathname === `/${cat.name}/`;
          return (
            <Link
              key={cat.name}
              href={`/${cat.name}/`}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm capitalize transition-colors duration-200 ${
                isActive
                  ? "font-medium text-violet-600 dark:text-violet-400"
                  : "dark:hover:bg-navy-800 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <span>{cat.name.replace(/[_-]/g, " ")}</span>
              <span className="dark:bg-navy-800 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                {cat.docCount}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
