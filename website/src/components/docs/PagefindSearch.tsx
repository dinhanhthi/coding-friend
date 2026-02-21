"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle, DialogDescription } from "@radix-ui/react-dialog";

interface PagefindResult {
  id: string;
  data: () => Promise<{
    url: string;
    meta: { title?: string };
    excerpt: string;
  }>;
}

interface SearchResult {
  id: string;
  url: string;
  title: string;
  excerpt: string;
}

interface Pagefind {
  init: () => Promise<void>;
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
  debouncedSearch: (
    query: string,
    options?: Record<string, unknown>,
    ms?: number,
  ) => Promise<{ results: PagefindResult[] } | null>;
}

function normalizePagefindUrl(url: string): string {
  return url.replace(/\.html$/, "/");
}

// Pagefind excerpts only contain <mark> tags for highlighting — safe to render
function ExcerptMarkup({ html }: { html: string }) {
  return (
    <p
      className="mt-0.5 line-clamp-2 text-sm text-slate-400 [&_mark]:bg-transparent [&_mark]:!text-yellow-200 [&_mark]:text-slate-400"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function PagefindSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const pagefindRef = useRef<Pagefind | null>(null);
  const router = useRouter();

  // Load pagefind
  useEffect(() => {
    async function load() {
      try {
        const pf = await import(
          // @ts-expect-error pagefind.js generated after build
          /* webpackIgnore: true */ "/_pagefind/pagefind.js"
        );
        await pf.init();
        pagefindRef.current = pf;
        setReady(true);
      } catch {
        // Pagefind not available (dev mode)
      }
    }
    load();
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    const pf = pagefindRef.current;
    if (!pf || !q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    // debouncedSearch returns null when debounced (not yet ready)
    const response = await pf.debouncedSearch(q, {}, 200);
    if (!response) return;

    // Only show loading + clear results once debounce fires
    setLoading(true);
    setResults([]);
    try {
      const items: SearchResult[] = [];
      for (const result of response.results.slice(0, 10)) {
        const data = await result.data();
        items.push({
          id: result.id,
          url: data.url,
          title: data.meta?.title ?? "Untitled",
          excerpt: data.excerpt,
        });
      }
      setResults(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && open) doSearch(query);
  }, [query, ready, open, doSearch]);

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:text-white"
        aria-label="Search docs"
      >
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
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <kbd className="bg-navy-800/80 hidden items-center gap-0.5 rounded border border-[#a0a0a01c] px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:inline-flex">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      {/* cmdk dialog — handles Escape, click outside, focus management */}
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        shouldFilter={false}
        loop
        label="Search documentation"
        overlayClassName="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        contentClassName="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] pointer-events-none"
        className="bg-navy-900/80 pointer-events-auto mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-[#a0a0a01c] shadow-2xl"
      >
        <VisuallyHidden>
          <DialogTitle>Search documentation</DialogTitle>
          <DialogDescription>
            Search through the documentation pages
          </DialogDescription>
        </VisuallyHidden>
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[#a0a0a01c] px-4">
          <svg
            className="h-6 w-6 shrink-0 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search documentation..."
            className="flex-1 bg-transparent py-3 text-sm text-white placeholder-slate-500 outline-none"
          />
          <kbd className="rounded border border-[#a0a0a01c] px-1.5 py-0.5 text-xs text-slate-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <Command.List className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <Command.Loading className="px-4 py-6 text-center text-sm text-slate-400">
              Searching...
            </Command.Loading>
          )}

          {!ready && query.trim() && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Search index not available. Run a production build first.
            </p>
          )}

          <Command.Empty className="px-4 py-6 text-center text-sm text-slate-400">
            {query.trim() ? (
              <>No results found for &ldquo;{query}&rdquo;</>
            ) : (
              "Start typing to search..."
            )}
          </Command.Empty>

          {!loading &&
            results.map((entry) => (
              <Command.Item
                key={entry.id}
                value={entry.id}
                onSelect={() => {
                  setOpen(false);
                  router.push(normalizePagefindUrl(entry.url));
                }}
                className="data-[selected=true]:bg-navy-800 cursor-pointer px-4 py-3 transition-colors"
              >
                <div className="text-base font-medium text-white">
                  {entry.title}
                </div>
                <ExcerptMarkup html={entry.excerpt} />
              </Command.Item>
            ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
