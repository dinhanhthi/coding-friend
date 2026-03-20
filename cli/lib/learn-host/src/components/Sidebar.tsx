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
    <aside className="dark:bg-navy-900/80 fixed top-14 left-0 z-10 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:flex md:flex-col lg:w-[300px] dark:border-[#a0a0a01c]">
      <nav
        className="scrollbar-none flex-1 space-y-1 overflow-y-auto px-2 py-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {categories.map((cat) => {
          const isActive = pathname === `/${cat.name}/`;
          return (
            <Link
              key={cat.name}
              href={`/${cat.name}/`}
              className={`flex items-center justify-between rounded-full py-1.5 pr-2 pl-4 text-[0.938rem] capitalize transition-colors duration-200 ${
                isActive
                  ? "font-medium text-amber-700 dark:text-amber-400"
                  : "dark:hover:bg-navy-800/70 text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <span>{cat.name.replace(/[_-]/g, " ")}</span>
              <span className="flex h-7 w-7 scale-85 items-center justify-center rounded-full border border-slate-200 bg-slate-200/60 text-xs font-semibold text-slate-400 dark:border-slate-600/50 dark:bg-slate-600/40 dark:text-slate-400/80">
                {cat.docCount}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
