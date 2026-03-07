import {
  readdirSync,
  statSync,
  copyFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { join } from "path";
import { homedir, hostname as osHostname } from "os";
import { readJson, writeJson } from "./json.js";
import { encodeProjectPath, claudeSessionDir } from "./paths.js";

export interface SessionMeta {
  sessionId: string;
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
    if (meta) metas.push(meta);
  }

  return metas.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

/**
 * Remap an original project path to the current machine by replacing the home prefix.
 */
export function remapProjectPath(
  originalPath: string,
  currentHome: string,
): string {
  // Detect original home: leading /Users/<name> or /home/<name>
  const homePattern = /^(\/(?:Users|home)\/[^/]+)(\/.*)?$/;
  const match = originalPath.match(homePattern);
  if (!match) return originalPath;

  const origHomeDir = match[1];
  const rest = match[2] ?? "";

  if (origHomeDir === currentHome) return originalPath;

  return currentHome + rest;
}

/**
 * Save a session to the sync folder.
 * Creates <syncDir>/sessions/<sessionId>/session.jsonl and meta.json.
 */
export function saveSession(opts: SaveSessionOpts): void {
  const { jsonlPath, sessionId, label, projectPath, syncDir, previewText } =
    opts;
  const destDir = join(syncDir, "sessions", sessionId);
  const destJsonl = join(destDir, "session.jsonl");
  const destMeta = join(destDir, "meta.json");

  copyFileSync(jsonlPath, destJsonl);

  const meta: SessionMeta = {
    sessionId,
    label,
    projectPath,
    savedAt: new Date().toISOString(),
    machine: hostname(),
    previewText,
  };
  writeJson(destMeta, meta as unknown as Record<string, unknown>);
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
  const srcPath = join(syncDir, "sessions", meta.sessionId, "session.jsonl");

  copyFileSync(srcPath, destPath);
}

function hostname(): string {
  try {
    return osHostname();
  } catch {
    return "unknown";
  }
}
