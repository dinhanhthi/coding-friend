"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CategoryInfo } from "@/lib/types";

export default function MobileNav({
  categories,
}: {
  categories: CategoryInfo[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="dark:bg-navy-950 border-b border-slate-200 bg-slate-50 dark:border-[#a0a0a01c]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        <span>Navigation</span>
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <nav className="max-h-[60vh] space-y-0.5 overflow-y-auto px-4 pb-4">
          {categories.map((cat) => {
            const isActive = pathname === `/${cat.name}/`;
            return (
              <Link
                key={cat.name}
                href={`/${cat.name}/`}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm capitalize ${
                  isActive
                    ? "font-medium text-violet-600 dark:text-violet-400"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <span>{cat.name.replace(/[_-]/g, " ")}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {cat.docCount}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
