"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { CategoryInfo } from "@/lib/types";
import PagefindSearch from "@/components/PagefindSearch";
import ThemeToggle from "@/components/ThemeToggle";

export default function Header({ categories }: { categories: CategoryInfo[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="dark:bg-navy-900/80 sticky top-0 z-50 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-lg md:px-6 dark:border-[#a0a0a01c]">
      <div className="flex h-14 items-center justify-between">
        {/* Left: Logo + Title */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/logo.svg"
            alt="Coding Friend"
            width={32}
            height={32}
          />
          <span className="text-lg font-semibold text-slate-900 dark:text-white">
            Learning Notes
          </span>
        </Link>

        {/* Right */}
        <div className="flex items-center gap-1 md:gap-3">
          {/* Search */}
          <PagefindSearch />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* GitHub */}
          <a
            href="https://github.com/dinhanhthi/coding-friend"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:text-slate-900 md:flex dark:text-slate-400 dark:hover:text-white"
            aria-label="GitHub"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="dark:hover:bg-navy-800 cursor-pointer rounded-lg p-2 transition-colors hover:bg-slate-100 md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <nav className="space-y-1 border-t border-slate-200 py-4 md:hidden dark:border-[#a0a0a01c]">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={`/${cat.name}/`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-600 capitalize hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
            >
              <span>{cat.name.replace(/[_-]/g, " ")}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {cat.docCount}
              </span>
            </Link>
          ))}
          <div className="flex items-center gap-3 px-3 pt-2">
            <a
              href="https://github.com/dinhanhthi/coding-friend"
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
