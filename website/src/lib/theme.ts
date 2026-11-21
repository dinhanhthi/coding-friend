export const THEME_KEY = "theme";

export type Theme = "light" | "dark";

/** A valid saved choice wins; otherwise the site is dark (its main look), whatever the system prefers. */
export function resolveInitialTheme(saved: string | null): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export function nextTheme(t: Theme): Theme {
  return t === "dark" ? "light" : "dark";
}

/** `/diagrams/foo.svg` → `/diagrams/foo-dark.svg`; null when there is no dark twin. */
export function diagramDarkSrc(src: string): string | null {
  if (!src.startsWith("/diagrams/") || !src.endsWith(".svg")) return null;
  if (src.endsWith("-dark.svg")) return null;
  return src.replace(/\.svg$/, "-dark.svg");
}

/** Inline `<head>` script that sets `<html data-theme>` before first paint (no flash). */
export const themeInitScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});document.documentElement.dataset.theme=s==="light"?"light":"dark"}catch(e){}})()`;
