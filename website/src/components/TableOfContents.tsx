"use client";

import { useEffect, useState } from "react";

type TocItem = { id: string; text: string; level: 2 | 3 };
type TocNode = {
  id: string;
  text: string;
  children: { id: string; text: string }[];
};

const HEADER_OFFSET_PX = 88;

function groupToc(items: TocItem[]): TocNode[] {
  const roots: TocNode[] = [];
  for (const item of items) {
    if (item.level === 2) {
      roots.push({ id: item.id, text: item.text, children: [] });
    } else if (roots.length > 0) {
      roots[roots.length - 1].children.push({
        id: item.id,
        text: item.text,
      });
    }
  }
  return roots;
}

function tocLinkClass(active: boolean, nested: boolean) {
  return [
    "block border-l-2 py-1 leading-snug transition-colors duration-150",
    nested ? "pl-3 text-xs" : "pl-2 text-sm",
    active
      ? "border-accent text-heading"
      : "text-text-muted hover:text-heading border-transparent",
  ].join(" ");
}

export default function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const tree = groupToc(items);

  useEffect(() => {
    if (items.length === 0) return;

    let ticking = false;

    const updateActive = () => {
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= HEADER_OFFSET_PX) {
          current = item.id;
        }
      }
      setActiveId((prev) => (prev === current ? prev : current));
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateActive);
    };

    updateActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", updateActive);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", updateActive);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="fixed top-20 right-4 z-40 hidden max-h-[calc(100dvh-9.5rem)] w-52 overflow-x-hidden overflow-y-auto overscroll-contain lg:block"
    >
      <p className="text-heading mb-2 text-xs font-semibold tracking-wide uppercase">
        Contents
      </p>
      <ul>
        {tree.map((section) => {
          const sectionActive = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={sectionActive ? "location" : undefined}
                onClick={() => setActiveId(section.id)}
                className={tocLinkClass(sectionActive, false)}
              >
                {section.text}
              </a>
              {section.children.length > 0 && (
                <ul className="ml-3">
                  {section.children.map((child) => {
                    const childActive = child.id === activeId;
                    return (
                      <li key={child.id}>
                        <a
                          href={`#${child.id}`}
                          aria-current={childActive ? "location" : undefined}
                          onClick={() => setActiveId(child.id)}
                          className={tocLinkClass(childActive, true)}
                        >
                          {child.text}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
