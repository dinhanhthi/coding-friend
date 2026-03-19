"use client";

import { useState, useRef } from "react";

const MANAGERS = [
  { id: "npm", label: "npm", install: "npm i -g" },
  { id: "yarn", label: "yarn", install: "yarn global add" },
  { id: "pnpm", label: "pnpm", install: "pnpm add -g" },
] as const;

type ManagerId = (typeof MANAGERS)[number]["id"];

function CopyIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
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
  );
}

/**
 * Tabbed code block for package managers in MDX docs.
 * Usage: <PackageManagerTabs package="coding-friend-cli" />
 */
export default function PackageManagerTabs({
  package: pkg,
}: {
  package: string;
}) {
  const [active, setActive] = useState<ManagerId>("npm");
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const manager = MANAGERS.find((m) => m.id === active)!;
  const command = `${manager.install} ${pkg}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="not-prose my-4 overflow-hidden rounded-lg border border-[var(--color-border)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-navy-950)]">
        <div className="flex">
          {MANAGERS.map((m) => (
            <button
              key={m.id}
              onClick={() => setActive(m.id)}
              className={`px-4 py-2 text-base font-medium transition-colors ${
                active === m.id
                  ? "border-b-2 border-violet-400 text-violet-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="mr-3 text-slate-400 transition-colors hover:text-white"
          aria-label="Copy to clipboard"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto bg-[var(--color-navy-950)] p-4 text-base leading-relaxed text-slate-300">
        <code ref={codeRef} className="hljs">
          {command}
        </code>
      </pre>
    </div>
  );
}
