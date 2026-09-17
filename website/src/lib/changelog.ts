import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ChangelogSource = "plugin" | "cli";

export type ChangelogEntry = {
  source: ChangelogSource;
  version: string;
  date: string;
  href: string;
  bullets: string[];
};

const REPO_URL = "https://github.com/dinhanhthi/coding-friend";
const VERSION_HEADING = /^## v(\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)\s*$/;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2;

/** Release tags are `v1.2.3` for the plugin and `cli-v1.2.3` for the CLI. */
function releaseHref(source: ChangelogSource, version: string): string {
  const tag = source === "cli" ? `cli-v${version}` : `v${version}`;
  return `${REPO_URL}/releases/tag/${tag}`;
}

/** Pull `## vX.Y.Z (YYYY-MM-DD)` sections and their bullets. Other headings are ignored. */
export function parseChangelog(
  text: string,
  source: ChangelogSource,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;

  for (const line of text.split("\n")) {
    const heading = line.match(VERSION_HEADING);
    if (heading) {
      current = {
        source,
        version: heading[1],
        date: heading[2],
        href: releaseHref(source, heading[1]),
        bullets: [],
      };
      entries.push(current);
      continue;
    }
    if (line.startsWith("## ")) {
      current = null;
      continue;
    }
    if (current && line.startsWith("- ")) {
      current.bullets.push(line.slice(2).trim());
    }
  }

  return entries;
}

/** Newest first, dropping anything older than the window, capped at MAX_ENTRIES. */
export function pickRecent(
  entries: ChangelogEntry[],
  nowMs: number,
): ChangelogEntry[] {
  const cutoff = nowMs - WINDOW_MS;
  return entries
    .filter((entry) => Date.parse(entry.date) >= cutoff)
    .sort(
      (a, b) =>
        Date.parse(b.date) - Date.parse(a.date) ||
        b.source.localeCompare(a.source),
    )
    .slice(0, MAX_ENTRIES);
}

function readChangelog(source: ChangelogSource): ChangelogEntry[] {
  try {
    const file = resolve(process.cwd(), `../${source}/CHANGELOG.md`);
    return parseChangelog(readFileSync(file, "utf-8"), source);
  } catch {
    return [];
  }
}

// Module scope on purpose: evaluated once at build, never as a dynamic read during render.
const NOW = Date.now();

export function getRecentChanges(): ChangelogEntry[] {
  return pickRecent([...readChangelog("plugin"), ...readChangelog("cli")], NOW);
}
