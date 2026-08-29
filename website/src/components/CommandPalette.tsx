"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PaletteItem = { id: string; text: string; level: 2 | 3 };

type Row = {
  key: string;
  label: string;
  group: string;
  href: string;
  external: boolean;
};

const EXTERNAL_ROWS: Row[] = [
  {
    key: "github",
    label: "GitHub repository",
    group: "Links",
    href: "https://github.com/dinhanhthi/coding-friend",
    external: true,
  },
  {
    key: "changelog",
    label: "Changelog",
    group: "Links",
    href: "https://github.com/dinhanhthi/coding-friend/releases",
    external: true,
  },
  {
    key: "npm",
    label: "coding-friend-cli on npm",
    group: "Links",
    href: "https://www.npmjs.com/package/coding-friend-cli",
    external: true,
  },
];

function buildRows(items: PaletteItem[]): Row[] {
  const rows: Row[] = [];
  let parent = "";
  for (const item of items) {
    if (item.level === 2) parent = item.text;
    rows.push({
      key: item.id,
      label:
        item.level === 3 && parent ? `${parent} › ${item.text}` : item.text,
      group: "Sections",
      href: `#${item.id}`,
      external: false,
    });
  }
  return [...rows, ...EXTERNAL_ROWS];
}

export default function CommandPalette({
  items,
  open,
  onClose,
}: {
  items: PaletteItem[];
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rows = useMemo(() => buildRows(items), [items]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? rows.filter((row) => row.label.toLowerCase().includes(q))
      : rows;
    return matches.map((row, index) => ({
      ...row,
      showGroup: index === 0 || matches[index - 1].group !== row.group,
    }));
  }, [rows, query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active, filtered]);

  const handleClose = () => {
    setQuery("");
    setActive(0);
    onClose();
  };

  const select = (row: Row) => {
    handleClose();
    if (row.external) {
      window.open(row.href, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(row.href);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = filtered[active];
      if (row) select(row);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search sections"
      onCancel={handleClose}
      onClose={handleClose}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === dialogRef.current) handleClose();
      }}
      className="bg-paper border-rule-2 text-ink-2 backdrop:bg-scrim m-0 mx-auto mt-[12vh] w-[min(560px,calc(100vw-2rem))] rounded-[10px] border p-0 shadow-[var(--shadow-chrome)]"
    >
      <div className="border-rule flex items-center gap-3 border-b px-4">
        <svg
          className="text-muted h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
          />
        </svg>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          placeholder="Search sections…"
          className="text-ink placeholder:text-muted h-12 w-full bg-transparent text-[15px] outline-none"
        />
        <kbd className="border-rule text-muted rounded border px-1.5 py-0.5 font-mono text-[11px]">
          esc
        </kbd>
      </div>

      <ul
        ref={listRef}
        role="listbox"
        aria-label="Results"
        className="max-h-[min(50vh,22rem)] overflow-y-auto p-2"
      >
        {filtered.length === 0 && (
          <li className="text-muted px-3 py-6 text-center text-sm">
            No section matches “{query}”. Clear the search to see all sections.
          </li>
        )}
        {filtered.map((row, index) => {
          return (
            <li key={row.key}>
              {row.showGroup && (
                <p className="text-muted px-3 pt-3 pb-1 font-mono text-[11px] tracking-[0.08em] uppercase">
                  {row.group}
                </p>
              )}
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(row)}
                className={`flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-sm ${
                  index === active
                    ? "bg-paper-2 text-ink"
                    : "text-ink-2 hover:bg-paper-2"
                }`}
              >
                <span className="truncate">{row.label}</span>
                {row.external && (
                  <span className="text-muted ml-3 shrink-0" aria-hidden="true">
                    ↗
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-rule text-muted flex items-center gap-4 border-t px-4 py-2 font-mono text-[11px]">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> navigate
        </span>
        <span>
          <kbd>↵</kbd> open
        </span>
        <span>
          <kbd>esc</kbd> close
        </span>
      </div>
    </dialog>
  );
}
