"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import type { ChangelogEntry as ChangelogEntryType } from "@/lib/types";

const tagLabels = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
  removed: "Removed",
  security: "Security",
};

interface Props {
  entry: ChangelogEntryType;
  isLatest?: boolean;
  defaultExpanded?: boolean;
}

function renderInline(text: string) {
  // Match backtick code spans and markdown links
  const tokenRegex = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // Backtick code span
      result.push(
        <code
          key={match.index}
          className="rounded bg-slate-800 px-1 py-0.5 font-mono text-sm text-violet-300"
        >
          {match[1]}
        </code>,
      );
    } else {
      // Markdown link [text](url)
      result.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/40 hover:text-sky-500"
        >
          {match[2]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining plain text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

export default function ChangelogEntryCard({
  entry,
  isLatest,
  defaultExpanded = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Group changes by tag
  const grouped = entry.changes.reduce(
    (acc, change) => {
      if (!acc[change.tag]) acc[change.tag] = [];
      acc[change.tag].push(change);
      return acc;
    },
    {} as Record<string, typeof entry.changes>,
  );

  const tagOrder: Array<keyof typeof tagLabels> = [
    "new",
    "improved",
    "fixed",
    "security",
    "removed",
  ];

  return (
    <div className={`relative pl-7 last:pb-0 ${expanded ? "pb-10" : "pb-4"}`}>
      {/* Toggle dot — vertically centered with the version title */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="ring-navy-900 absolute top-[5px] left-0 mt-1 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full bg-violet-400 ring-[3px] transition-colors hover:bg-violet-300"
        aria-label={expanded ? "Collapse" : "Expand"}
      >
        <span className="text-xs leading-none font-bold text-slate-900">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {/* Timeline line */}
      <div className="absolute top-5 bottom-0 left-[5px] w-0.5 bg-[#a0a0a01c] last:hidden" />

      {/* Version header */}
      <div
        className={`flex cursor-pointer items-center gap-3 ${expanded ? "mb-4" : "mb-0"}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <h3 className="text-xl font-bold text-white">{entry.version}</h3>
        {isLatest && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            Latest
          </span>
        )}
        {entry.unpublished && (
          <span className="rounded-full border border-dashed border-slate-300/30 bg-slate-500/10 px-2.5 py-0.5 text-xs tracking-wide text-slate-300">
            Unpublished
          </span>
        )}
      </div>

      {/* Changes grouped by tag */}
      {expanded && (
        <div className="space-y-4">
          {tagOrder.map((tag) => {
            const changes = grouped[tag];
            if (!changes?.length) return null;

            return (
              <div key={tag}>
                <div className="mb-2">
                  <Badge variant={tag}>{tagLabels[tag]}</Badge>
                </div>
                <ul className="space-y-1.5">
                  {changes.map((change, i) => (
                    <li
                      key={i}
                      className="relative pl-4 leading-relaxed text-slate-200 before:absolute before:top-2 before:left-0 before:h-1.5 before:w-1.5 before:rounded-full before:bg-slate-600 before:content-['']"
                    >
                      {renderInline(change.text)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
