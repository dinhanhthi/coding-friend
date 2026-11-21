/**
 * Pure helpers for the landing page. No `@/content/index.md` import here, so
 * the tests can load this module with plain tsx.
 */

/**
 * The shipped CLI and plugin print links like `cf.coprimal.dev/#memory` from
 * when the docs lived on the home page. When the landing has no element for
 * the hash, send the visitor to the same anchor on /docs.
 */
export function legacyDocsHref(
  hash: string,
  existsOnPage: boolean,
): string | null {
  if (hash.length <= 1 || existsOnPage) return null;
  return `/docs/${hash}`;
}

export type Host = {
  name: string;
  href: string;
  support: number;
  command: string;
  notes: string;
};

const HOST_ROW =
  /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(\d+)%\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/;

/** Rows of the table under the "Supported Tools" heading, in order. */
export function parseHosts(source: string): Host[] {
  const start = source.search(/^## .*Supported Tools/m);
  if (start < 0) return [];
  const rest = source.slice(start);
  const next = rest.slice(3).search(/^## /m);
  const section = next < 0 ? rest : rest.slice(0, next + 3);

  return section.split("\n").flatMap((line) => {
    const row = line.match(HOST_ROW);
    if (!row) return [];
    return [
      {
        name: row[1],
        href: row[2],
        support: Number(row[3]),
        command: row[4].replace(/`/g, ""),
        notes: row[5],
      },
    ];
  });
}

/** The copy-paste prompt (`> **Install Coding Friend …**`) as plain text. */
export function extractInstallPrompt(source: string): string {
  const line = source
    .split("\n")
    .find((l) => /^>\s*\*\*Install Coding Friend/.test(l));
  if (!line) return "";
  return line
    .replace(/^>\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

/** Drop the markdown's leading `# …` title and the italic `_…_` tagline under it. */
export function stripHeroContent(source: string): string {
  return source.replace(/^# .+\n+_[^\n]+_\n+/, "");
}
