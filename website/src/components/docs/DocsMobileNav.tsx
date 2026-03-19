"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { docsNavigation } from "@/lib/navigation";
import PagefindSearch from "./PagefindSearch";

export default function DocsMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div
      className="bg-navy-950 border-b border-[#a0a0a01c] md:hidden"
      data-pagefind-ignore
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-base font-medium text-slate-300"
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
        <nav className="max-h-[60vh] space-y-4 overflow-y-auto px-4 pb-4">
          {docsNavigation.map((section) => (
            <div key={section.title}>
              <div className="mb-1 text-sm font-semibold tracking-wider text-slate-400 uppercase">
                {section.title}
              </div>
              <ul className="space-y-0.5">
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
                        onClick={() => setOpen(false)}
                        className={`block cursor-pointer rounded-md px-3 py-1.5 text-base ${
                          isActive
                            ? "bg-violet-900/20 font-medium text-violet-300"
                            : "text-slate-400"
                        }`}
                      >
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="mt-2 border-t border-[#a0a0a01c] pt-4">
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              <svg
                className="h-3.5 w-3.5"
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
              llms.txt
            </a>
          </div>
        </nav>
      )}
    </div>
  );
}
