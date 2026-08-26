"use client";

import Image from "next/image";
import { useState } from "react";

type Section = { id: string; text: string };

const GITHUB_HREF = "https://github.com/dinhanhthi/coding-friend";

const linkClassName =
  "rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-heading";

function NavLinks({
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
          {text}
        </a>
      ))}
      <a
        href={GITHUB_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        onClick={onNavigate}
      >
        GitHub
      </a>
    </>
  );
}

export default function Navbar({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-border bg-nav relative sticky top-0 z-50 h-14 border-b">
      <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-4 sm:px-6">
        <a
          href="/"
          className="bg-surface-2 flex items-center gap-2 rounded-md px-3 py-1.5"
        >
          <Image src="/logo.svg" width={24} height={24} alt="" unoptimized />
          <span className="text-heading font-semibold">Coding Friend</span>
          <span className="text-text-muted font-mono text-xs">
            v{process.env.NEXT_PUBLIC_PLUGIN_VERSION}
          </span>
        </a>

        <nav className="hidden gap-1 md:flex" aria-label="Sections">
          <NavLinks sections={sections} />
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

      {open && (
        <nav
          id="nav-menu"
          className="border-border bg-nav absolute inset-x-0 top-14 border-b px-4 py-2 md:hidden"
        >
          <div className="flex flex-col gap-1">
            <NavLinks sections={sections} onNavigate={() => setOpen(false)} />
          </div>
        </nav>
      )}
    </header>
  );
}
