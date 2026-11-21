"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import GitHubIcon from "./GitHubIcon";
import ThemeToggle from "./ThemeToggle";

const GITHUB_HREF = "https://github.com/Coprimal/coding-friend";
const PLUGIN_VERSION = process.env.NEXT_PUBLIC_PLUGIN_VERSION;

const NAV = [
  { label: "Features", href: "/#what-it-does", match: null },
  { label: "Docs", href: "/docs/", match: "/docs" },
  { label: "Privacy", href: "/privacy/", match: "/privacy" },
];

/** One header for every page, same width everywhere, so moving between pages never shifts it. */
export default function SiteHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand">
          <Image src="/icon.svg" width={28} height={28} alt="" unoptimized />
          <span>Coding Friend</span>
          {PLUGIN_VERSION ? (
            <span className="brand-version">v{PLUGIN_VERSION}</span>
          ) : null}
        </Link>

        <nav className="site-nav" aria-label="Primary navigation">
          {NAV.map(({ label, href, match }) => (
            <Link
              key={href}
              href={href}
              className="nav-link"
              aria-current={
                match && pathname.startsWith(match) ? "page" : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="site-header__tools">
          <ThemeToggle />
          <a
            href={GITHUB_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="icon-button"
          >
            <GitHubIcon size={18} />
          </a>
          <Link href="/#get-started" className="header-cta">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
