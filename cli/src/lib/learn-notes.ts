import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  type Stats,
} from "fs";
import { homedir, hostname } from "os";
import { join } from "path";
import { parse } from "yaml";

import { cloudRootOf, isCloudPlaceholder } from "./cloud-folders.js";
import { readNote, resolveNotePath } from "./note-io.js";
import { CliError } from "./output.js";

/**
 * Learn notes as /cf-learn writes them: `<outputDir>/<category>/<slug>.md`
 * (same layout and frontmatter as cli/lib/learn-mcp/src/lib/docs.ts, which the
 * CLI cannot import). README.md files are learn.readmeIndex indexes.
 */
export interface LearnNote {
  id: string;
  category: string;
  slug: string;
  title: string;
  tags: string[];
  created: string;
  updated: string;
  size: number;
  mtime: string;
  /** Set when this looks like a sync conflict copy of the note with this id. */
  possibleConflictOf?: string;
}

/** A cloud file that is not downloaded: listed, never opened. */
export interface LearnPlaceholder {
  id: string;
  file: string;
}

export interface LearnNotes {
  notes: LearnNote[];
  placeholders: LearnPlaceholder[];
}

export const MAX_QUERY_CHARS = 500;

/** Frontmatter is read from the first bytes only (a dataless file may be large). */
const HEAD_BYTES = 8 * 1024;
const LEGACY_ICLOUD = /^\.(.+)\.md\.icloud$/;

/** Same id-segment grammar as note-io's resolveNotePath, so every listed id is showable. */
function validSegment(s: string): boolean {
  return (
    s.trim() !== "" &&
    s !== "." &&
    s !== ".." &&
    !s.startsWith("-") &&
    !s.includes("/") &&
    !s.includes("\\") &&
    !/[\x00-\x1f\x7f]/.test(s)
  );
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function inCloud(outputDir: string) {
  return cloudRootOf(outputDir, homedir(), process.platform);
}

/** Frontmatter from the head of the file; `{}` when absent or not closed within the head. */
function readHead(file: string): Record<string, unknown> {
  let text: string;
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    text = buf.toString("utf8", 0, readSync(fd, buf, 0, HEAD_BYTES, 0));
  } finally {
    closeSync(fd);
  }
  const m = /^﻿?---\r?\n([\s\S]*?)^---[ \t]*\r?$/m.exec(text);
  if (!m || m.index !== 0) return {};
  try {
    const data: unknown = parse(m[1], { logLevel: "error" });
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

/**
 * The slug this one is a sync conflict copy of, when that sibling exists:
 * ` 2` (iCloud), ` (1)`, ` (… conflicted copy …)` (Dropbox), and `-<host>`
 * (OneDrive) only inside a OneDrive root with the short hostname.
 */
function conflictBase(
  slug: string,
  siblings: Set<string>,
  oneDrive: boolean,
): string | null {
  const bases = [/ \d+$/, / \(\d+\)$/, / \([^)]*conflicted copy[^)]*\)$/i].map(
    (re) => (re.test(slug) ? slug.replace(re, "") : null),
  );
  if (oneDrive) {
    const host = hostname().split(".")[0].toLowerCase();
    const suffix = `-${host}`;
    if (host && slug.toLowerCase().endsWith(suffix)) {
      bases.push(slug.slice(0, -suffix.length));
    }
  }
  return bases.find((b) => b && siblings.has(b)) ?? null;
}

/** List notes and cloud placeholders. Placeholders are never opened. */
export function listNotes(outputDir: string): LearnNotes {
  const notes: LearnNote[] = [];
  const placeholders: LearnPlaceholder[] = [];
  let categories: string[];
  try {
    categories = readdirSync(outputDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .filter(validSegment)
      .sort();
  } catch {
    return { notes, placeholders };
  }
  const cloud = inCloud(outputDir);

  for (const category of categories) {
    const dir = join(outputDir, category);
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      continue;
    }
    const found: { slug: string; file: string; st: Stats }[] = [];
    for (const name of names) {
      const file = join(dir, name);
      const legacy = LEGACY_ICLOUD.exec(name);
      if (legacy) {
        if (validSegment(legacy[1]))
          placeholders.push({ id: `${category}/${legacy[1]}`, file });
        continue;
      }
      if (name.startsWith(".") || !name.endsWith(".md") || name === "README.md")
        continue;
      const slug = name.slice(0, -3);
      const st = lstatOrNull(file);
      if (!st || !st.isFile() || !validSegment(slug)) continue;
      if (cloud && isCloudPlaceholder(name, st, process.platform)) {
        placeholders.push({ id: `${category}/${slug}`, file });
        continue;
      }
      found.push({ slug, file, st });
    }

    const siblings = new Set([
      ...found.map((f) => f.slug),
      ...placeholders
        .filter((p) => p.id.startsWith(`${category}/`))
        .map((p) => p.id.slice(category.length + 1)),
    ]);
    for (const { slug, file, st } of found) {
      let fm: Record<string, unknown>;
      try {
        fm = readHead(file);
      } catch {
        continue;
      }
      const base = conflictBase(slug, siblings, cloud?.provider === "onedrive");
      notes.push({
        id: `${category}/${slug}`,
        category,
        slug,
        title: str(fm.title) || slug,
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
        created: str(fm.created),
        updated: str(fm.updated),
        size: st.size,
        mtime: st.mtime.toISOString(),
        ...(base !== null && { possibleConflictOf: `${category}/${base}` }),
      });
    }
  }

  // Newest first, like learn-mcp's getAllDocs; ties by id.
  notes.sort(
    (a, b) =>
      (b.updated || b.created).localeCompare(a.updated || a.created) ||
      a.id.localeCompare(b.id),
  );
  return { notes, placeholders };
}

/** Case-insensitive search over title, tags and body. Placeholders are listed, not searched. */
export function searchNotes(outputDir: string, query: string): LearnNotes {
  if (query.length > MAX_QUERY_CHARS) {
    throw new CliError(
      "INVALID_VALUE",
      `Query is longer than ${MAX_QUERY_CHARS} characters`,
    );
  }
  const q = query.toLowerCase();
  const { notes, placeholders } = listNotes(outputDir);
  const hits = notes.filter((n) => {
    if (n.title.toLowerCase().includes(q)) return true;
    if (n.tags.some((t) => t.toLowerCase().includes(q))) return true;
    try {
      return readNote(join(outputDir, n.category, `${n.slug}.md`))
        .content.toLowerCase()
        .includes(q);
    } catch {
      return false;
    }
  });
  return { notes: hits, placeholders };
}

/**
 * Real path of a learn note for show/edit/delete. A cloud placeholder is
 * refused with NOT_FOUND "not downloaded" before anything opens it.
 */
export function resolveLearnNote(outputDir: string, id: string): string {
  const notDownloaded = () =>
    new CliError("NOT_FOUND", `Note not downloaded (cloud placeholder): ${id}`);
  let path: string;
  try {
    path = resolveNotePath(outputDir, id);
  } catch (err) {
    if (err instanceof CliError && err.code === "NOT_FOUND") {
      const [category, slug] = id.split("/");
      if (existsSync(join(outputDir, category, `.${slug}.md.icloud`))) {
        throw notDownloaded();
      }
    }
    throw err;
  }
  const st = lstatOrNull(path);
  if (
    inCloud(outputDir) &&
    isCloudPlaceholder(`${id.split("/")[1]}.md`, st, process.platform)
  ) {
    throw notDownloaded();
  }
  return path;
}
