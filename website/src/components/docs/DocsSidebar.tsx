"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { docsNavigation } from "@/lib/navigation";

const DEFAULT_COLLAPSED = new Set(["Skills", "Auto-Invoked", "CLI Commands"]);

export default function DocsSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      docsNavigation.map((s) => [s.title, DEFAULT_COLLAPSED.has(s.title)]),
    ),
  );

  const toggleSection = (title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  useEffect(() => {
    const activeSection = docsNavigation.find((s) =>
      s.items.some((item) => {
        const [slugPath] = item.slug.split("#");
        return pathname === `/docs/${slugPath}/`;
      }),
    );
    if (activeSection) {
      setCollapsed((prev) => ({ ...prev, [activeSection.title]: false }));
    }
  }, [pathname]);

  return (
    <aside
      className="bg-navy-950 fixed left-0 z-10 hidden h-[calc(100vh-4rem)] shrink-0 border-r border-[#a0a0a01c] md:flex md:w-64 md:flex-col lg:w-[300px]"
      data-pagefind-ignore
    >
      <nav
        className="scrollbar-none flex-1 space-y-6 overflow-y-auto p-6"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {docsNavigation.map((section) => {
          const isCollapsed = collapsed[section.title];

          return (
            <div key={section.title}>
              <button
                onClick={() => toggleSection(section.title)}
                className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold tracking-wider text-slate-400 uppercase transition-colors hover:text-white"
              >
                {section.title}
                <svg
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>

              {!isCollapsed && (
                <ul className="mt-2 space-y-0.5">
                  {section.items.map((item) => {
                    const [slugPath, hash] = item.slug.split("#");
                    const href = hash
                      ? `/docs/${slugPath}/#${hash}`
                      : `/docs/${item.slug}/`;
                    const isActive = pathname === `/docs/${slugPath}/`;
                    return (
                      <li key={item.slug}>
                        <Link
                          href={href}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors duration-200 ${
                            isActive
                              ? "font-medium text-violet-400"
                              : "hover:bg-navy-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {item.title}
                          {item.manualOnly && (
                            <svg
                              className="h-3 w-3 shrink-0 opacity-50"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-label="Manual only"
                            >
                              <title>Manual only — not auto-triggered</title>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[#a0a0a01c] px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <svg
            className="h-3.5 w-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <a
            href="/llms.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-slate-300"
          >
            llms.txt
          </a>
          <span className="text-slate-600">|</span>
          <a
            href="/llms-full.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-slate-300"
          >
            llms-full.txt
          </a>
        </div>
      </div>
    </aside>
  );
}
