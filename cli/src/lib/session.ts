import {
  readdirSync,
  lstatSync,
  chmodSync,
  copyFileSync,
  cpSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  type Stats,
} from "fs";
import { basename, dirname, join } from "path";
import { homedir, hostname as osHostname } from "os";
import { cloudRootOf, isCloudPlaceholder } from "./cloud-folders.js";
import { readJson } from "./json.js";
import { CliError } from "./output.js";
import { claudeLoadTargetDir, claudeProjectDirCandidates } from "./paths.js";
import { redactText } from "./redact.js";
import { readClaudeHeadCwd } from "./transcript-claude.js";

/** Only these parts of Claude's sibling `<sessionId>/` folder are saved and restored. */
const SESSION_SUBDIRS = ["subagents", "tool-results", "mcp-tasks"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Session ids from meta.json or flags must be UUIDs before use in a path or command. */
export function isSessionUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/** Convert a label to a filesystem-safe slug for use as folder name. */
export function slugifyLabel(label: string, maxLen = 100): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/, "");
  return slug || "session";
}

/**
 * Contents of a saved `meta.json`. It comes from a cloud folder or git, so it
 * is untrusted: `sessionId` is checked as a UUID before use, `folderName` is
 * never used (the folder name on disk is the identity), and `projectPath`,
 * `label` and `machine` are for display only.
 */
export interface SessionMeta {
  sessionId: string;
  provider?: "claude";
  folderName?: string;
  label: string;
  projectPath?: string;
  savedAt: string;
  machine?: string;
  previewText?: string;
  bytes?: number;
}

export interface SavedSession {
  /** Folder name on disk under the store root: the session's identity. */
  folder: string;
  source: "saved" | "legacy";
  status: "ok" | "placeholder";
  /** Null for placeholders, which are never opened. */
  meta: SessionMeta | null;
}

export interface SaveSessionOpts {
  jsonlPath: string;
  sessionId: string;
  label: string;
  storeRoot: string;
  /** Fallback for `projectPath` when the transcript head has no `cwd`. */
  projectDir?: string;
  previewText: string;
}

export interface SaveSessionResult {
  folder: string;
  dir: string;
  bytes: number;
  warning: string;
}

export interface LoadSessionOpts {
  storeRoot: string;
  /** Folder name under `storeRoot` (from the ref), never `meta.folderName`. */
  folder: string;
  /** Project path to load into; realpath'd by `claudeLoadTargetDir`. */
  target: string;
  force?: boolean;
}

export interface LoadSessionResult {
  sessionId: string;
  dir: string;
  path: string;
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function isRealDir(p: string): boolean {
  return lstatOrNull(p)?.isDirectory() ?? false;
}

/**
 * A project's live Claude transcripts across `claudeProjectDirCandidates`,
 * newest first. Skips `agent-*` files, names that are not `<uuid>.jsonl` and
 * symlinks.
 */
export function listProjectTranscripts(
  projectPath: string,
): { path: string; mtime: number }[] {
  const out: { path: string; mtime: number }[] = [];
  for (const dir of claudeProjectDirCandidates(projectPath)) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl") || name.startsWith("agent-")) continue;
      if (!isSessionUuid(basename(name, ".jsonl"))) continue;
      const path = join(dir, name);
      const st = lstatOrNull(path);
      if (st?.isFile()) out.push({ path, mtime: st.mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Extract a preview text from the first user message in a JSONL session file.
 * Returns "(preview unavailable)" on any failure.
 */
export function buildPreviewText(jsonlPath: string, maxChars = 200): string {
  try {
    const content = readFileSync(jsonlPath, "utf-8") as string;
    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.type === "user") {
          const msg = entry.message as Record<string, unknown> | undefined;
          const msgContent = msg?.content;
          if (typeof msgContent === "string" && msgContent.trim()) {
            return msgContent.trim().slice(0, maxChars);
          }
        }
      } catch {
        // skip malformed lines
      }
    }
    return "(preview unavailable)";
  } catch {
    return "(preview unavailable)";
  }
}

/** Saved-session files that a cloud folder may leave as placeholders. */
const SAVED_FILES = ["meta.json", "session.jsonl"];

const VERBATIM_WARNING =
  "The transcript is saved verbatim, not redacted: it may contain secrets. Check it before sharing the folder.";

/**
 * The darwin dataless heuristic only applies inside a cloud root (as in
 * transcript-claude and learn-notes); the `.name.icloud` rule always applies.
 */
function inCloud(root: string): boolean {
  return cloudRootOf(root, homedir(), process.platform) !== null;
}

/**
 * True when meta.json or session.jsonl is not downloaded. Never opens a file.
 * `cloud`: `dir` is inside a cloud root (enables the dataless heuristic).
 */
export function isPlaceholderFolder(dir: string, cloud: boolean): boolean {
  return SAVED_FILES.some((name) => {
    if (lstatOrNull(join(dir, `.${name}.icloud`))?.isFile()) return true;
    const st = lstatOrNull(join(dir, name));
    return (
      cloud && st !== null && isCloudPlaceholder(name, st, process.platform)
    );
  });
}

/** Parsed `<dir>/meta.json` (regular file only, never a symlink), or null. */
function readMeta(dir: string): SessionMeta | null {
  const path = join(dir, "meta.json");
  if (!lstatOrNull(path)?.isFile()) return null;
  const meta = readJson<SessionMeta>(path);
  return meta !== null && typeof meta === "object" && !Array.isArray(meta)
    ? meta
    : null;
}

/**
 * Saved sessions directly under `root` (`<root>/<folder>/meta.json`), newest
 * first. Symlinks are skipped; placeholders are listed without being opened.
 */
export function listSavedSessions(
  root: string,
  source: "saved" | "legacy",
): SavedSession[] {
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  const cloud = inCloud(root);
  const rows: { session: SavedSession; at: number }[] = [];
  for (const folder of names) {
    if (!isSafePathSegment(folder) || folder.startsWith(".")) continue;
    const dir = join(root, folder);
    const st = lstatOrNull(dir);
    if (!st?.isDirectory()) continue;
    if (isPlaceholderFolder(dir, cloud)) {
      rows.push({
        session: { folder, source, status: "placeholder", meta: null },
        at: st.mtimeMs,
      });
      continue;
    }
    const meta = readMeta(dir);
    if (!meta) continue;
    const savedAt = Date.parse(meta.savedAt);
    rows.push({
      session: { folder, source, status: "ok", meta },
      at: Number.isNaN(savedAt) ? st.mtimeMs : savedAt,
    });
  }
  return rows.sort((a, b) => b.at - a.at).map((r) => r.session);
}

/**
 * Save a live Claude transcript to `<storeRoot>/<label-slug>/`: session.jsonl
 * (verbatim), meta.json, and `session/{subagents,tool-results,mcp-tasks}/`
 * from Claude's sibling `<sessionId>/` folder when present. The folder is
 * 0700 and both files 0600: the transcript may hold secrets.
 */
export function saveSession(opts: SaveSessionOpts): SaveSessionResult {
  const { jsonlPath, sessionId, label, storeRoot, projectDir, previewText } =
    opts;
  if (!isSessionUuid(sessionId)) {
    throw new CliError(
      "INVALID_ARGS",
      `Session id must be a UUID: ${sessionId}`,
    );
  }
  if (!lstatOrNull(jsonlPath)?.isFile()) {
    throw new CliError(
      "NOT_FOUND",
      `Session transcript not found: ${jsonlPath}`,
    );
  }
  // `cf` may run with cwd = $HOME (the app), so the transcript's cwd wins.
  const projectPath =
    readClaudeHeadCwd(jsonlPath) || projectDir || process.cwd();

  mkdirSync(storeRoot, { recursive: true });
  const folder = uniqueFolderName(storeRoot, slugifyLabel(label));
  const dir = join(storeRoot, folder);
  mkdirSync(dir, { mode: 0o700 });
  chmodSync(dir, 0o700); // umask may strip bits
  const destJsonl = join(dir, "session.jsonl");
  copyFileSync(jsonlPath, destJsonl);
  chmodSync(destJsonl, 0o600); // copyFileSync keeps the source's mode
  copySessionSubdirs(join(dirname(jsonlPath), sessionId), join(dir, "session"));
  const bytes = lstatSync(destJsonl).size;

  const meta: SessionMeta = {
    sessionId,
    provider: "claude",
    folderName: folder,
    label,
    projectPath,
    savedAt: new Date().toISOString(),
    machine: hostname(),
    // meta.json may sit in a synced folder: the preview is redacted there too.
    previewText: redactText(previewText, { home: homedir() }).text,
    bytes,
  };
  const metaPath = join(dir, "meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(metaPath, 0o600);
  return { folder, dir, bytes, warning: VERBATIM_WARNING };
}

/** Copy the allow-listed subdirs of `from` (real dirs only) into `to`. */
function copySessionSubdirs(from: string, to: string): void {
  if (!isRealDir(from)) return;
  for (const sub of SESSION_SUBDIRS) {
    const src = join(from, sub);
    if (!isRealDir(src)) continue;
    cpSync(src, join(to, sub), { recursive: true, filter: filesAndDirsOnly });
  }
}

/**
 * cpSync filter: only regular files and folders. A tampered sync folder could
 * hold symlinks to secrets, or FIFOs and devices that hang or fail the copy.
 */
function filesAndDirsOnly(src: string): boolean {
  const st = lstatSync(src);
  return st.isFile() || st.isDirectory();
}

/** True for a single path segment that cannot escape its parent directory. */
function isSafePathSegment(s: string): boolean {
  return (
    typeof s === "string" &&
    /^[A-Za-z0-9._-]+$/.test(s) &&
    s !== "." &&
    s !== ".."
  );
}

function uniqueFolderName(root: string, base: string): string {
  if (!lstatOrNull(join(root, base))) return base;
  let i = 2;
  while (lstatOrNull(join(root, `${base}-${i}`))) i++;
  return `${base}-${i}`;
}

/**
 * Load `<storeRoot>/<folder>/` into the Claude project dir of `target`:
 * session.jsonl becomes `<dir>/<sessionId>.jsonl`, and the allow-listed parts
 * of session/ go to `<dir>/<sessionId>/`. Every check runs before any write.
 */
export function loadSession(opts: LoadSessionOpts): LoadSessionResult {
  const { storeRoot, folder, target, force } = opts;
  if (!isSafePathSegment(folder)) {
    throw new CliError("INVALID_ARGS", `Invalid session folder: "${folder}"`);
  }
  const src = join(storeRoot, folder);
  if (!isRealDir(src)) {
    throw new CliError("NOT_FOUND", `Saved session not found: ${folder}`);
  }
  if (isPlaceholderFolder(src, inCloud(storeRoot))) {
    throw new CliError("NOT_FOUND", `Saved session not downloaded: ${folder}`);
  }
  const meta = readMeta(src);
  if (!meta) {
    throw new CliError("NOT_FOUND", `No readable meta.json in ${folder}`);
  }
  // Untrusted: checked before it names a file or reaches `claude --resume`.
  if (!isSessionUuid(meta.sessionId)) {
    throw new CliError(
      "INVALID_VALUE",
      `Invalid sessionId in meta.json of ${folder}: not a UUID`,
    );
  }
  const srcJsonl = join(src, "session.jsonl");
  const st = lstatOrNull(srcJsonl);
  if (st?.isSymbolicLink()) {
    throw new CliError(
      "INVALID_VALUE",
      `Refusing to load a symlinked session file: ${srcJsonl}`,
    );
  }
  if (!st?.isFile()) {
    throw new CliError("NOT_FOUND", `No session.jsonl in ${folder}`);
  }

  const sessionId = meta.sessionId;
  const dir = claudeLoadTargetDir(target);
  const path = join(dir, `${sessionId}.jsonl`);
  const existing = lstatOrNull(path);
  if (existing && (!force || !existing.isFile())) {
    throw new CliError(
      "CONFLICT",
      `Session transcript already exists: ${path}`,
    );
  }

  mkdirSync(dir, { recursive: true });
  copyFileSync(srcJsonl, path);
  copySessionSubdirs(join(src, "session"), join(dir, sessionId));
  return { sessionId, dir, path };
}

function hostname(): string {
  try {
    return osHostname();
  } catch {
    return "unknown";
  }
}
