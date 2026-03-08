import { input, select } from "@inquirer/prompts";
import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { log } from "../lib/log.js";
import { encodeProjectPath, claudeSessionDir, resolvePath } from "../lib/paths.js";
import {
  buildPreviewText,
  saveSession,
  listSyncedSessions,
  remapProjectPath,
  loadSession,
  type SessionMeta,
} from "../lib/session.js";
import { loadConfig } from "../lib/config.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveDocsDir(): string {
  const config = loadConfig();
  const docsDir = config.docsDir ?? "docs";
  return join(process.cwd(), docsDir);
}

function formatSessionChoice(meta: SessionMeta): string {
  const date = new Date(meta.savedAt).toLocaleString();
  const preview = meta.previewText.slice(0, 60).replace(/\n/g, " ");
  return `[${meta.label}]  ${date}  @${meta.machine}  — ${preview}`;
}

// ─── cf session save ─────────────────────────────────────────────────────────

export async function sessionSaveCommand(
  opts: {
    sessionId?: string;
    label?: string;
  } = {},
): Promise<void> {
  const docsDir = resolveDocsDir();
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
    syncDir: docsDir,
    previewText,
  });

  log.success(`Session saved: "${label}"`);
  log.dim(`  → ${join(docsDir, "sessions", sessionId)}`);
}

// ─── cf session load ─────────────────────────────────────────────────────────

export async function sessionLoadCommand(): Promise<void> {
  const docsDir = resolveDocsDir();
  const sessions = listSyncedSessions(docsDir);

  if (sessions.length === 0) {
    log.warn("No saved sessions found.");
    log.dim(`  Sessions dir: ${join(docsDir, "sessions")}`);
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

  localProjectPath = resolvePath(localProjectPath);
  loadSession(chosen, localProjectPath, docsDir);

  log.success(`Session "${chosen.label}" loaded.`);
  log.info(`To resume, run:`);
  console.log(`\n  claude --resume ${chosen.sessionId}\n`);
}
