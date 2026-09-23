"use client";

import { useEffect, useState } from "react";

type TocItem = { id: string; text: string; level: 2 | 3 };
type TocNode = {
  id: string;
  text: string;
  children: { id: string; text: string }[];
};

const SPY_OFFSET_PX = 120;

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

export default function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const tree = groupToc(items);

  useEffect(() => {
    if (items.length === 0) return;

    let ticking = false;

    const updateActive = () => {
      let current = items[0]?.id ?? "";
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        current = items[items.length - 1].id;
      } else {
        for (const item of items) {
          const el = document.getElementById(item.id);
          if (el && el.getBoundingClientRect().top <= SPY_OFFSET_PX) {
            current = item.id;
          }
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
    <nav className="toc" aria-label="On this page">
      <ul>
        {tree.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={activeId === section.id ? "true" : undefined}
            >
              {section.text}
            </a>
            {section.children.length > 0 && (
              <ul>
                {section.children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={`#${child.id}`}
                      aria-current={activeId === child.id ? "true" : undefined}
                    >
                      {child.text}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
