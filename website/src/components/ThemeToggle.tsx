"use client";

import { THEME_KEY, nextTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const current: Theme = root.dataset.theme === "dark" ? "dark" : "light";
    const next = nextTheme(current);
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked (private mode): the theme still applies for this visit.
    }
  };

  // Both icons render; CSS shows the one for the theme you switch to.
  return (
    <button
      type="button"
      className="nav-link theme-toggle"
      aria-label="Toggle color theme"
      onClick={toggle}
    >
      <svg
        className="icon-sun"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      <svg
        className="icon-moon"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>
  );
}
