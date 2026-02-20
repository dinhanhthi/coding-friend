"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { SearchIndexEntry } from "@/lib/types";

// Search index embedded at build time
import searchIndexData from "./search-index.json";

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchIndexEntry[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const lower = query.toLowerCase();
    const filtered = (searchIndexData as SearchIndexEntry[]).filter(
      (entry) =>
        entry.title.toLowerCase().includes(lower) ||
        entry.tags.some((t) => t.toLowerCase().includes(lower)) ||
        entry.excerpt.toLowerCase().includes(lower) ||
        entry.category.toLowerCase().includes(lower),
    );
    setResults(filtered);
  }, [query]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

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

      {query.trim() && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
        </p>
      )}

      <div className="grid gap-3">
        {results.map((entry) => (
          <a
            key={`${entry.category}/${entry.slug}`}
            href={`/${entry.category}/${entry.slug}/`}
            className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all bg-white dark:bg-gray-800/50"
          >
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {entry.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
              {entry.excerpt}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded capitalize">
                {entry.category.replace(/[_-]/g, " ")}
              </span>
              {entry.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
