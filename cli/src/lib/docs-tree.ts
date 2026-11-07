import { createHash } from "crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
} from "fs";
import { extname, isAbsolute, join, relative, sep } from "path";
import { loadConfig } from "./config.js";
import { readJson } from "./json.js";
import { CliError } from "./output.js";
import { localConfigPath, resolvePath } from "./paths.js";

const MAX_DEPTH = 10;
const MAX_FILES = 5000;
const MAX_DOC_BYTES = 1024 * 1024;
const MD_EXTS = new Set([".md", ".markdown"]);

export interface DocEntry {
  path: string;
  size: number;
  mtime: string;
}

export interface DocsList {
  docsDir: string;
  exists: boolean;
  files: DocEntry[];
  truncated: boolean;
}

export interface DocContent {
  path: string;
  content: string;
  size: number;
  mtime: string;
  sha256: string;
}

function realOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Project docs dir: config `docsDir` (default `docs`), relative to cwd (the project root).
 * A `docsDir` from the repo-local config must resolve inside the project root;
 * one from the global config may point anywhere.
 */
export function resolveProjectDocsDir(): string {
  const docsDir = resolvePath(loadConfig().docsDir ?? "docs");
  const local = readJson<{ docsDir?: unknown }>(localConfigPath());
  if (local?.docsDir === undefined) return docsDir;

  const real = realOrSelf(docsDir);
  const rel = relative(realOrSelf(process.cwd()), real);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
    throw new CliError(
      "INVALID_VALUE",
      `docsDir in .coding-friend/config.json is outside the project: ${docsDir}`,
    );
  }
  return real;
}

function isMarkdown(name: string): boolean {
  return MD_EXTS.has(extname(name).toLowerCase());
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Markdown files under docsDir (no symlinks, dotfiles or node_modules), sorted by path. */
export function listDocs(docsDir: string): DocsList {
  const files: DocEntry[] = [];
  if (!isDir(docsDir)) {
    return { docsDir, exists: false, files, truncated: false };
  }
  let truncated = false;

  const walk = (dir: string, depth: number): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    // Visit entries in full-path order (a dir sorts as "name/"), so a truncated
    // listing keeps exactly the first MAX_FILES paths of the sorted list.
    const entries = [];
    for (const name of names) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const abs = join(dir, name);
      try {
        const st = lstatSync(abs);
        entries.push({
          name,
          abs,
          st,
          key: st.isDirectory() ? name + "/" : name,
        });
      } catch {
        continue;
      }
    }
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const { name, abs, st } of entries) {
      if (truncated) return;
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (depth < MAX_DEPTH) walk(abs, depth + 1);
      } else if (st.isFile() && isMarkdown(name)) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        files.push({
          path: relative(docsDir, abs).split(sep).join("/"),
          size: st.size,
          mtime: st.mtime.toISOString(),
        });
      }
    }
  };

  walk(docsDir, 0);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { docsDir, exists: true, files, truncated };
}

/** Read one markdown file under docsDir; refuses anything resolving outside it. */
export function readDoc(docsDir: string, relpath: string): DocContent {
  const segments = relpath.split(/[\\/]/);
  if (
    !relpath ||
    isAbsolute(relpath) ||
    relpath.includes("\0") ||
    segments.includes("..")
  ) {
    throw new CliError("INVALID_ARGS", `Invalid doc path: ${relpath}`);
  }
  if (!isMarkdown(relpath)) {
    throw new CliError("INVALID_ARGS", `Not a markdown file: ${relpath}`);
  }

  let realDocs: string;
  let real: string;
  try {
    realDocs = realpathSync(docsDir);
    real = realpathSync(join(docsDir, relpath));
  } catch {
    throw new CliError("NOT_FOUND", `Doc not found: ${relpath}`);
  }
  if (!real.startsWith(realDocs + sep)) {
    throw new CliError(
      "INVALID_VALUE",
      `Doc is outside the docs dir: ${relpath}`,
    );
  }

  // Open once and check/read through the fd: no swap between check and read.
  let fd: number;
  try {
    fd = openSync(
      real,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("NOT_FOUND", `Doc not found: ${relpath}`);
    }
    throw new CliError("INVALID_VALUE", `Cannot open doc: ${relpath}`);
  }
  let st;
  let buf: Buffer;
  try {
    st = fstatSync(fd);
    if (!st.isFile()) {
      throw new CliError("INVALID_VALUE", `Not a file: ${relpath}`);
    }
    if (st.size > MAX_DOC_BYTES) {
      throw new CliError(
        "INVALID_VALUE",
        `Doc is larger than 1 MiB: ${relpath}`,
      );
    }
    // Read at most MAX + 1 bytes: a file growing after fstat is never slurped.
    const max = Buffer.alloc(MAX_DOC_BYTES + 1);
    let total = 0;
    while (total < max.length) {
      const n = readSync(fd, max, total, max.length - total, null);
      if (n === 0) break;
      total += n;
    }
    buf = max.subarray(0, total);
  } finally {
    closeSync(fd);
  }
  if (buf.length > MAX_DOC_BYTES) {
    throw new CliError("INVALID_VALUE", `Doc is larger than 1 MiB: ${relpath}`);
  }
  return {
    path: segments.filter((s) => s && s !== ".").join("/"),
    content: buf.toString("utf8"),
    size: buf.length,
    mtime: st.mtime.toISOString(),
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}
