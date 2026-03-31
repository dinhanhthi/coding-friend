import {
  readdirSync,
  statSync,
  copyFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { homedir, hostname as osHostname } from "os";
import { readJson, writeJson } from "./json.js";
import { encodeProjectPath, claudeSessionDir } from "./paths.js";

/**
 * Convert a label to a filesystem-safe slug for use as folder name.
 * Keep in sync with: plugin/skills/cf-session/scripts/save-session.sh
 */
export function slugifyLabel(label: string, maxLen = 100): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/, "");
  return slug || "session";
}

export interface SessionMeta {
  sessionId: string;
  folderName?: string;
  label: string;
  projectPath: string;
  savedAt: string;
  machine: string;
  previewText: string;
}

export interface SaveSessionOpts {
  jsonlPath: string;
  sessionId: string;
  label: string;
  projectPath: string;
  syncDir: string;
  previewText: string;
}

/**
 * Find the most recently modified non-agent JSONL session file for a project.
 * Returns the full path to the JSONL, or null if none found.
 */
export function findLatestSession(projectPath: string): string | null {
  const sessionDir = claudeSessionDir(encodeProjectPath(projectPath));
  if (!existsSync(sessionDir)) return null;

  const files = (readdirSync(sessionDir) as string[]).filter(
    (f) => f.endsWith(".jsonl") && !f.startsWith("agent-"),
  );
  if (files.length === 0) return null;

  const sorted = files.sort((a, b) => {
    const aMtime = (statSync(join(sessionDir, a)) as { mtimeMs: number })
      .mtimeMs;
    const bMtime = (statSync(join(sessionDir, b)) as { mtimeMs: number })
      .mtimeMs;
    return bMtime - aMtime;
  });

  return join(sessionDir, sorted[0]);
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

/**
 * List all saved sessions in a sync directory, sorted newest first.
 */
export function listSyncedSessions(syncDir: string): SessionMeta[] {
  const sessionsDir = join(syncDir, "sessions");
  if (!existsSync(sessionsDir)) return [];

  const entries = (readdirSync(sessionsDir) as string[]).filter((entry) => {
    const entryPath = join(sessionsDir, entry);
    return (
      statSync(entryPath) as { isDirectory: () => boolean }
    ).isDirectory();
  });

  const metas: SessionMeta[] = [];
  for (const entry of entries) {
    const metaPath = join(sessionsDir, entry, "meta.json");
    const meta = readJson<SessionMeta>(metaPath);
    if (meta) {
      if (!meta.folderName) meta.folderName = entry;
      metas.push(meta);
    }
  }

  return metas.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

/**
 * Remap an original project path to the current machine by replacing the home prefix.
 * Handles Unix paths (/Users/<name>, /home/<name>) and Windows paths (C:\Users\<name>).
 */
export function remapProjectPath(
  originalPath: string,
  currentHome: string,
): string {
  // Unix: /Users/<name> or /home/<name>
  const unixPattern = /^(\/(?:Users|home)\/[^/]+)(\/.*)?$/;
  const unixMatch = originalPath.match(unixPattern);
  if (unixMatch) {
    const origHomeDir = unixMatch[1];
    const rest = unixMatch[2] ?? "";
    if (origHomeDir === currentHome) return originalPath;
    return currentHome + rest;
  }

  // Windows: C:\Users\<name> (case-insensitive drive letter)
  const winPattern = /^([A-Za-z]:\\Users\\[^\\]+)(\\.*)?$/;
  const winMatch = originalPath.match(winPattern);
  if (winMatch) {
    const origHomeDir = winMatch[1];
    const rest = winMatch[2] ?? "";
    if (origHomeDir === currentHome) return originalPath;
    return currentHome + rest;
  }

  return originalPath;
}

/**
 * Save a session to the sync folder.
 * Creates <syncDir>/sessions/<label-slug>/session.jsonl and meta.json.
 * Returns the folder name used.
 */
export function saveSession(opts: SaveSessionOpts): string {
  const { jsonlPath, sessionId, label, projectPath, syncDir, previewText } =
    opts;
  const sessionsDir = join(syncDir, "sessions");
  const baseSlug = slugifyLabel(label);
  const folderName = uniqueFolderName(sessionsDir, baseSlug);
  const destDir = join(sessionsDir, folderName);
  const destJsonl = join(destDir, "session.jsonl");
  const destMeta = join(destDir, "meta.json");

  mkdirSync(destDir, { recursive: true });
  copyFileSync(jsonlPath, destJsonl);

  const meta: SessionMeta = {
    sessionId,
    folderName,
    label,
    projectPath,
    savedAt: new Date().toISOString(),
    machine: hostname(),
    previewText,
  };
  writeJson(destMeta, meta as unknown as Record<string, unknown>);
  return folderName;
}

function uniqueFolderName(sessionsDir: string, base: string): string {
  if (!existsSync(join(sessionsDir, base))) return base;
  let i = 2;
  while (existsSync(join(sessionsDir, `${base}-${i}`))) i++;
  return `${base}-${i}`;
}

/**
 * Load a session from the sync folder onto the current machine.
 * Copies the JSONL to ~/.claude/projects/<encodedLocalPath>/<sessionId>.jsonl
 */
export function loadSession(
  meta: SessionMeta,
  localProjectPath: string,
  syncDir: string,
): void {
  const encodedPath = encodeProjectPath(localProjectPath);
  const destDir = claudeSessionDir(encodedPath);
  const destPath = join(destDir, `${meta.sessionId}.jsonl`);
  const folder = meta.folderName ?? meta.sessionId;
  const srcPath = join(syncDir, "sessions", folder, "session.jsonl");

  mkdirSync(destDir, { recursive: true });
  copyFileSync(srcPath, destPath);
}

function hostname(): string {
  try {
    return osHostname();
  } catch {
    return "unknown";
  }
}
