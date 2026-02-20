"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface PagefindResult {
  id: string;
  data: () => Promise<{
    url: string;
    meta: { title?: string };
    excerpt: string;
    sub_results?: { url: string; title: string; excerpt: string }[];
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

export default function PagefindSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const pagefindRef = useRef<Pagefind | null>(null);

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
        // Pagefind not available (dev mode or first run)
      }
    }
    load();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const pf = pagefindRef.current;
    if (!pf || !q.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await pf.debouncedSearch(q, {}, 200);
      if (!response) return; // debounced away

      const items: SearchResult[] = [];
      for (const result of response.results.slice(0, 20)) {
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
    if (ready) doSearch(query);
  }, [query, ready, doSearch]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Search</h1>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search docs..."
        className="w-full px-4 py-2 mb-6 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />

      {!ready && query.trim() && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Search index not available. Run a build first.
        </p>
      )}

      {ready && query.trim() && !loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
        </p>
      )}

      <div className="grid gap-3">
        {results.map((entry) => {
          // Pagefind excerpts contain only <mark> tags for highlighting — safe to render
          return (
            <a
              key={entry.id}
              href={entry.url}
              className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all bg-white dark:bg-gray-800/50"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {entry.title}
              </h3>
              <p
                className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2 [&_mark]:bg-yellow-200 dark:[&_mark]:bg-yellow-800 [&_mark]:rounded [&_mark]:px-0.5"
                dangerouslySetInnerHTML={{ __html: entry.excerpt }}
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}
