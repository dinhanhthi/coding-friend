"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/types";

interface Props {
  headings: TocItem[];
}

export default function TableOfContents({ headings }: Props) {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 },
    );

    for (const heading of headings) {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto lg:block">
      <div className="p-4">
        <h4 className="mb-3 border-b border-slate-300 pb-2 text-xs font-medium tracking-wider text-slate-500 uppercase dark:border-slate-600">
          On this page
        </h4>
        <ul className="space-y-1.5">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={`block text-xs transition-colors duration-200 ${
                  h.level === 3 ? "pl-3" : ""
                } ${
                  activeId === h.id
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
