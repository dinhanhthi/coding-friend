import { createHash } from "crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "fs";
import { extname, isAbsolute, join, relative, sep } from "path";
import { loadConfig } from "./config.js";
import { CliError } from "./output.js";
import { resolvePath } from "./paths.js";

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

/** Project docs dir: config `docsDir` (default `docs`), relative to cwd (the project root). */
export function resolveProjectDocsDir(): string {
  return resolvePath(loadConfig().docsDir ?? "docs");
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
    for (const name of names) {
      if (truncated) return;
      if (name.startsWith(".") || name === "node_modules") continue;
      const abs = join(dir, name);
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
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

  const st = statSync(real);
  if (!st.isFile()) {
    throw new CliError("INVALID_VALUE", `Not a file: ${relpath}`);
  }
  if (st.size > MAX_DOC_BYTES) {
    throw new CliError("INVALID_VALUE", `Doc is larger than 1 MiB: ${relpath}`);
  }
  const buf = readFileSync(real);
  return {
    path: segments.filter((s) => s && s !== ".").join("/"),
    content: buf.toString("utf8"),
    size: buf.length,
    mtime: st.mtime.toISOString(),
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}
