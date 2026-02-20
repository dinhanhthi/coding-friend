"use client";

import Link from "next/link";
import { useState } from "react";
import type { CategoryInfo } from "@/lib/types";
import SearchBar from "./SearchBar";
import ThemeToggle from "./ThemeToggle";

export default function MobileNav({ categories }: { categories: CategoryInfo[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <Link href="/" className="font-bold text-gray-900 dark:text-gray-100">
          Learning Notes
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setOpen(!open)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <SearchBar />
          <nav className="mt-4 space-y-1">
            {categories.map((cat) => (
              <Link
                key={cat.name}
                href={`/${cat.name}/`}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <span className="capitalize">{cat.name.replace(/[_-]/g, " ")}</span>
                <span className="text-xs text-gray-400">{cat.docCount}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
