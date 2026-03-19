"use client";

import { useState } from "react";

interface CopyForAiButtonProps {
  content: string;
  title: string;
}

export default function CopyForAiButton({
  content,
  title,
}: CopyForAiButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = `# ${title}\n\n${content}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="group/ai relative cursor-pointer rounded-md p-1.5 opacity-60 transition-all duration-200 hover:opacity-100 hover:bg-slate-700/40"
      aria-label="Copy page content for AI"
    >
      {copied ? (
        <svg
          className="h-4 w-4 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4 text-slate-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
          />
        </svg>
      )}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded bg-slate-800 px-2 py-1 text-sm whitespace-nowrap text-slate-200 opacity-0 shadow-lg transition-opacity group-hover/ai:opacity-100">
        {copied ? "Copied!" : "Copy for AI"}
      </span>
    </button>
  );
}
