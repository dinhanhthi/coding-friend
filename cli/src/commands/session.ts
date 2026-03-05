import { input, select } from "@inquirer/prompts";
import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { mergeJson } from "../lib/json.js";
import { log } from "../lib/log.js";
import {
  globalConfigPath,
  encodeProjectPath,
  claudeSessionDir,
} from "../lib/paths.js";
import {
  findLatestSession,
  buildPreviewText,
  saveSession,
  listSyncedSessions,
  remapProjectPath,
  loadSession,
  type SessionMeta,
} from "../lib/session.js";
import { loadConfig } from "../lib/config.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function resolveSyncDir(): Promise<string> {
  const config = loadConfig();
  if (config.sessionSyncDir) return config.sessionSyncDir;

  log.warn("No session sync folder configured.");
  const syncDir = await input({
    message:
      "Enter path to your sync folder (e.g. ~/Dropbox/cf-sessions or a git repo path):",
    validate: (v) => v.trim().length > 0 || "Path cannot be empty",
  });

  const resolved = syncDir.startsWith("~/")
    ? join(homedir(), syncDir.slice(2))
    : syncDir;

  mergeJson(globalConfigPath(), { sessionSyncDir: resolved });
  log.success(`Sync folder saved to global config: ${resolved}`);
  log.warn(
    "Session files contain your full conversation history. Make sure this folder is private.",
  );

  return resolved;
}

function formatSessionChoice(meta: SessionMeta): string {
  const date = new Date(meta.savedAt).toLocaleString();
  const preview = meta.previewText.slice(0, 60).replace(/\n/g, " ");
  return `[${meta.label}]  ${date}  @${meta.machine}  — ${preview}`;
}

// ─── cf session save ─────────────────────────────────────────────────────────

export async function sessionSaveCommand(opts: {
  sessionId?: string;
  label?: string;
} = {}): Promise<void> {
  const syncDir = await resolveSyncDir();
  const cwd = process.cwd();

  let jsonlPath: string | null = null;

  if (opts.sessionId) {
    const candidate = join(
      claudeSessionDir(encodeProjectPath(cwd)),
      `${opts.sessionId}.jsonl`,
    );
    if (!existsSync(candidate)) {
      log.error(`Session file not found: ${candidate}`);
      process.exit(1);
    }
    jsonlPath = candidate;
  } else {
    // Try to find the latest session; if multiple recent ones exist, let user pick
    const sessionDir = claudeSessionDir(encodeProjectPath(cwd));
    if (!existsSync(sessionDir)) {
      log.error(
        `No sessions found for current directory. Run this inside a project that has Claude Code sessions.`,
      );
      process.exit(1);
    }

    const files = (readdirSync(sessionDir) as string[])
      .filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"))
      .map((f) => ({ name: f, mtime: statSync(join(sessionDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      log.error("No session files found in current project directory.");
      process.exit(1);
    }

    // If multiple recent sessions (modified within 60s of each other), let user pick
    const recentThreshold = 60_000;
    const recentFiles = files.filter(
      (f) => files[0].mtime - f.mtime < recentThreshold,
    );

    if (recentFiles.length > 1) {
      const chosen = await select({
        message: "Multiple recent sessions found. Which one to save?",
        choices: recentFiles.map((f) => ({
          name: `${f.name}  (modified ${new Date(f.mtime).toLocaleString()})`,
          value: join(sessionDir, f.name),
        })),
      });
      jsonlPath = chosen;
    } else {
      jsonlPath = join(sessionDir, files[0].name);
    }
  }

  const sessionId = basename(jsonlPath, ".jsonl");
  const label =
    opts.label ??
    (await input({
      message: "Give this session a label:",
      default: `session-${new Date().toISOString().slice(0, 10)}`,
    }));

  const previewText = buildPreviewText(jsonlPath);

  saveSession({
    jsonlPath,
    sessionId,
    label,
    projectPath: cwd,
    syncDir,
    previewText,
  });

  log.success(`Session saved: "${label}"`);
  log.dim(`  → ${join(syncDir, "sessions", sessionId)}`);
}

// ─── cf session load ─────────────────────────────────────────────────────────

export async function sessionLoadCommand(): Promise<void> {
  const syncDir = await resolveSyncDir();
  const sessions = listSyncedSessions(syncDir);

  if (sessions.length === 0) {
    log.warn("No saved sessions found in sync folder.");
    log.dim(`  Sync folder: ${syncDir}`);
    log.dim("  Run /cf-session inside a Claude Code conversation to save one.");
    return;
  }

  const chosen = await select<SessionMeta>({
    message: "Choose a session to load:",
    choices: sessions.map((s) => ({
      name: formatSessionChoice(s),
      value: s,
    })),
  });

  // Remap project path for current machine
  const currentHome = homedir();
  const remapped = remapProjectPath(chosen.projectPath, currentHome);

  let localProjectPath = remapped;
  if (remapped !== chosen.projectPath) {
    log.step(
      `Original path: ${chosen.projectPath}\nRemapped to:   ${remapped}`,
    );
    const confirmed = await input({
      message: "Local project path (press Enter to accept or edit):",
      default: remapped,
    });
    localProjectPath = confirmed.trim() || remapped;
  }

  loadSession(chosen, localProjectPath, syncDir);

  log.success(`Session "${chosen.label}" loaded.`);
  log.info(`To resume, run:`);
  console.log(`\n  claude --resume ${chosen.sessionId}\n`);
}
