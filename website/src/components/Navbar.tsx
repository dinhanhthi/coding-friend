"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type Section = { id: string; text: string };

const GITHUB_HREF = "https://github.com/dinhanhthi/coding-friend";

const NAV_LABELS: Record<string, string> = {
  "supported-ai-coding-tools": "Supported Tools",
};

const linkClassName =
  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-heading";

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

function SectionLinks({
  sections,
  onNavigate,
}: {
  sections: Section[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {sections.map(({ id, text }) => (
        <a
          key={id}
          href={`#${id}`}
          className={linkClassName}
          onClick={onNavigate}
        >
          {navLabel(id, text)}
        </a>
      ))}
    </>
  );
}

export default function Navbar({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-border bg-nav sticky top-0 z-50 h-14 border-b">
      <div className="flex h-full items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Coding Friend home" className="shrink-0 flex items-center gap-2">
          <Image src="/logo.svg" width={24} height={24} alt="" unoptimized />
          <span className="text-heading font-semibold">Coding Friend</span>
        </Link>

        <div className="flex items-center">
          <nav
            className="hidden items-center gap-1 overflow-x-auto md:flex"
            aria-label="Sections"
          >
            <SectionLinks sections={sections} />
            <a
              href={GITHUB_HREF}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="text-text-muted hover:bg-surface-2 hover:text-heading rounded-md p-1.5"
            >
              <GitHubIcon className="h-5 w-5" />
            </a>
          </nav>

          <button
            type="button"
            className="text-text-muted hover:bg-surface-2 hover:text-heading rounded-md p-2 md:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="nav-menu"
          className="border-border bg-nav absolute inset-x-0 top-14 border-b px-4 py-2 md:hidden"
        >
          <div className="flex flex-col gap-1">
            <SectionLinks
              sections={sections}
              onNavigate={() => setOpen(false)}
            />
            <a
              href={GITHUB_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
              onClick={() => setOpen(false)}
            >
              GitHub
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
