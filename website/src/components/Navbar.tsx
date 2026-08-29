"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import CommandPalette, { type PaletteItem } from "./CommandPalette";

type Section = { id: string; text: string };

const GITHUB_HREF = "https://github.com/dinhanhthi/coding-friend";
const PLUGIN_VERSION = process.env.NEXT_PUBLIC_PLUGIN_VERSION;

const NAV_LABELS: Record<string, string> = {
  "supported-ai-coding-tools": "Supported Tools",
};

function navLabel(id: string, text: string) {
  return NAV_LABELS[id] ?? text;
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

export default function Navbar({
  sections,
  tocItems,
}: {
  sections: Section[];
  tocItems: PaletteItem[];
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // N1b: brand left · a small centre link cluster · actions right.
  // "Install" is dropped from the link row because the CTA button covers it;
  // every section stays reachable through the ⌘K palette.
  const visibleSections = sections
    .filter(({ id }) => id !== "install")
    .slice(0, 3);

  return (
    <header className="border-rule bg-paper sticky top-0 z-50 h-16 border-b">
      <div className="mx-auto grid h-full w-full max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          aria-label="Coding Friend home"
          className="flex shrink-0 items-center gap-2 whitespace-nowrap lg:justify-self-start"
        >
          <Image src="/logo.svg" width={24} height={24} alt="" unoptimized />
          <span className="font-display text-ink text-lg tracking-[0.025em] lowercase">
            Coding Friend
          </span>
          {PLUGIN_VERSION ? (
            <span className="border-rule bg-paper-2 text-muted rounded border px-1.5 py-px font-mono text-[11px] leading-4">
              v{PLUGIN_VERSION}
            </span>
          ) : null}
        </Link>

        <nav
          className="hidden items-center justify-center gap-6 lg:flex"
          aria-label="Sections"
        >
          {visibleSections.map(({ id, text }) => (
            <a
              key={id}
              href={`#${id}`}
              className="u-grow text-ink-2 hover:text-ink pb-0.5 text-sm whitespace-nowrap lowercase"
            >
              {navLabel(id, text)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 justify-self-end sm:gap-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search sections (⌘K)"
            className="border-rule bg-paper-2 text-muted hover:border-rule-2 hover:text-ink hidden h-8 items-center rounded border px-2 font-mono text-[11px] tracking-[0.1em] whitespace-nowrap uppercase transition-colors duration-[220ms] [transition-timing-function:var(--ease-out)] md:inline-flex"
          >
            ⌘K
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search sections"
            className="text-muted hover:bg-paper-2 hover:text-ink rounded-[6px] p-2 md:hidden"
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          <a
            href={GITHUB_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-muted hover:bg-paper-2 hover:text-ink rounded-[6px] p-2"
          >
            <GitHubIcon className="h-5 w-5" />
          </a>

          <a
            href="#install"
            className="bg-accent text-accent-ink hidden h-9 items-center rounded-[6px] px-3.5 text-sm font-medium whitespace-nowrap lowercase transition-[transform,opacity] duration-[220ms] [transition-timing-function:var(--ease-out)] hover:-translate-y-[1px] hover:opacity-95 active:translate-y-0 sm:inline-flex"
          >
            Install
          </a>
        </div>
      </div>

      <CommandPalette
        items={tocItems}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </header>
  );
}
