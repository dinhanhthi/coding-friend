import { input, select } from "@inquirer/prompts";
import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { log } from "../lib/log.js";
import {
  encodeProjectPath,
  claudeSessionDir,
  resolvePath,
} from "../lib/paths.js";
import {
  buildPreviewText,
  saveSession,
  listSyncedSessions,
  remapProjectPath,
  loadSession,
  type SessionMeta,
} from "../lib/session.js";
import { loadConfig } from "../lib/config.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { useProjectDir } from "../lib/project-option.js";
import { redactText } from "../lib/redact.js";
import {
  pageTurns,
  parseRef,
  renderMarkdown,
  renderTurnsForShow,
  truncateChars,
  type Redactions,
  type SessionSummary,
  type Transcript,
  type TranscriptProvider,
  type Turn,
} from "../lib/transcript.js";
import { claudeProvider } from "../lib/transcript-claude.js";
import { codexProvider } from "../lib/transcript-codex.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveDocsDir(): string {
  const config = loadConfig();
  const docsDir = config.docsDir ?? "docs";
  return join(process.cwd(), docsDir);
}

function formatSessionChoice(meta: SessionMeta): string {
  const date = new Date(meta.savedAt).toLocaleString();
  const preview = (meta.previewText ?? "").slice(0, 60).replace(/\n/g, " ");
  return `[${meta.label}]  ${date}  @${meta.machine ?? "unknown"}  — ${preview}`;
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

  const folderName = saveSession({
    jsonlPath,
    sessionId,
    label,
    projectPath: cwd,
    syncDir: docsDir,
    previewText,
  });

  log.success(`Session saved: "${label}"`);
  log.dim(`  → ${join(docsDir, "sessions", folderName)}`);
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
  const remapped = chosen.projectPath
    ? remapProjectPath(chosen.projectPath, currentHome)
    : process.cwd();

  let localProjectPath = remapped;
  if (remapped !== chosen.projectPath) {
    log.step(
      `Original path: ${chosen.projectPath ?? "(not saved)"}\nRemapped to:   ${remapped}`,
    );
    const confirmed = await input({
      message: "Local project path (press Enter to accept or edit):",
      default: remapped,
    });
    localProjectPath = confirmed.trim() || remapped;
  }

  localProjectPath = resolvePath(localProjectPath);
  try {
    loadSession(chosen, localProjectPath, docsDir);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }

  log.success(`Session "${chosen.label}" loaded.`);
  log.info(`To resume, run:`);
  console.log(`\n  claude --resume ${chosen.sessionId}\n`);
}

// ─── cf session list | show | export ─────────────────────────────────────────

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 500;
const SHOW_DEFAULT_LIMIT = 200;
const SHOW_MAX_LIMIT = 1000;
const TITLE_MAX_CHARS = 200;
/** No extra filter is registered in B2; the timeout only bounds a future one. */
const FILTER_TIMEOUT_MS = 10_000;

const PROVIDERS: Record<"claude" | "codex", TranscriptProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
};

/** Human mode: log a CliError's message, then exit 1 (via runHuman). */
async function runHumanLogged(fn: () => void | Promise<void>): Promise<void> {
  await runHuman(async () => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

function intOption(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new CliError(
      "INVALID_ARGS",
      `--${name} must be an integer from ${min} to ${max}`,
    );
  }
  return n;
}

/** Redact, then cut: never the other way round. */
function redactTitle(
  title: string,
  home: string,
): { text: string; counts: Record<string, number> } {
  const r = redactText(title, { home });
  return {
    text: truncateChars(r.text.replace(/\s+/g, " ").trim(), TITLE_MAX_CHARS),
    counts: r.counts,
  };
}

/** Live providers in this phase; `saved:`/`legacy:` refs come in phase 2. */
async function readTranscript(
  ref: string,
  projectDir: string | undefined,
): Promise<Transcript> {
  const parsed = parseRef(ref);
  if (parsed.kind === "legacy" && !projectDir) {
    throw new CliError("INVALID_ARGS", "legacy: refs need --project-dir");
  }
  if (parsed.kind === "saved" || parsed.kind === "legacy") {
    throw new CliError(
      "NOT_FOUND",
      `Saved sessions are not readable yet: ${parsed.kind}:${parsed.id}`,
    );
  }
  return PROVIDERS[parsed.kind].read(parsed, { projectDir });
}

interface ListOpts {
  json?: boolean;
  provider?: string;
  projectDir?: string;
  limit?: string;
}

interface SessionList {
  project: string | null;
  sessions: SessionSummary[];
  truncated: boolean;
}

async function listSessions(opts: ListOpts): Promise<SessionList> {
  const root = useProjectDir(opts.projectDir);
  const limit = intOption(
    "limit",
    opts.limit,
    LIST_DEFAULT_LIMIT,
    1,
    LIST_MAX_LIMIT,
  );
  const { provider } = opts;
  if (provider !== undefined && provider !== "claude" && provider !== "codex") {
    throw new CliError("INVALID_ARGS", "--provider must be claude or codex");
  }
  const ids: (keyof typeof PROVIDERS)[] = provider
    ? [provider]
    : ["claude", "codex"];
  const home = homedir();
  const results = await Promise.all(
    ids.map((id) => PROVIDERS[id].list({ projectDir: root, limit })),
  );
  const merged = results
    .flatMap((r) => r.sessions)
    .map((s) => ({ ...s, title: redactTitle(s.title, home).text }))
    .sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
  return {
    project: root ?? null,
    sessions: merged.slice(0, limit),
    truncated: results.some((r) => r.truncated),
  };
}

export async function sessionListCommand(opts: ListOpts = {}): Promise<void> {
  if (opts.json) {
    await runJson(() => listSessions(opts));
    return;
  }
  await runHumanLogged(async () => {
    const { sessions, truncated } = await listSessions(opts);
    if (sessions.length === 0) {
      log.dim("No sessions found.");
      return;
    }
    for (const s of sessions) {
      const when = s.updatedAt.slice(0, 16).replace("T", " ");
      const status = s.status === "ok" ? "" : ` [${s.status}]`;
      console.log(
        `${when}  ${s.ref.padEnd(44)}  ${truncateChars(s.title, 60)}${status}`,
      );
    }
    if (truncated) log.dim("More sessions exist; not all files were scanned.");
  });
}

interface ShowOpts {
  json?: boolean;
  includeToolOutput?: boolean;
  offset?: string;
  limit?: string;
  projectDir?: string;
}

interface SessionShow {
  ref: string;
  provider: string;
  summary: SessionSummary;
  turns: Turn[];
  offset: number;
  limit: number;
  nextOffset: number | null;
  total: number;
  skipped: number;
  truncated: boolean;
  redactions: Redactions;
}

async function showSession(ref: string, opts: ShowOpts): Promise<SessionShow> {
  const root = useProjectDir(opts.projectDir);
  const offset = intOption(
    "offset",
    opts.offset,
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const limit = intOption(
    "limit",
    opts.limit,
    SHOW_DEFAULT_LIMIT,
    1,
    SHOW_MAX_LIMIT,
  );
  const t = await readTranscript(ref, root);
  const home = homedir();
  const total = t.turns.length;
  const rendered = renderTurnsForShow(t.turns.slice(offset, offset + limit), {
    includeToolOutput: !!opts.includeToolOutput,
    home,
  });
  const page = pageTurns(rendered.turns, { offset, total });
  // The summary is shown too, so its title and cwd are redacted and counted.
  const byKind = { ...rendered.redactions.byKind };
  const redactField = (s: string, title: boolean): string => {
    const r = title ? redactTitle(s, home) : redactText(s, { home });
    for (const [kind, n] of Object.entries(r.counts)) {
      byKind[kind] = (byKind[kind] ?? 0) + n;
    }
    return r.text;
  };
  const summary = {
    ...t.summary,
    title: redactField(t.summary.title, true),
    cwd: redactField(t.summary.cwd, false),
  };
  return {
    ref: t.ref,
    provider: t.provider,
    summary,
    turns: page.turns,
    offset,
    limit,
    nextOffset: page.nextOffset,
    total,
    skipped: t.skipped,
    truncated: page.truncated,
    redactions: {
      total: Object.values(byKind).reduce((a, b) => a + b, 0),
      byKind,
    },
  };
}

function printTurn(turn: Turn): void {
  if (turn.kind !== "tool") {
    console.log(`## ${turn.kind === "user" ? "User" : "Assistant"}\n`);
    console.log(`${turn.text}\n`);
    return;
  }
  console.log(`- tool: ${turn.name} ${turn.args}`.trimEnd());
  if (turn.output !== undefined) console.log(`\n${turn.output}\n`);
}

export async function sessionShowCommand(
  ref: string,
  opts: ShowOpts = {},
): Promise<void> {
  if (opts.json) {
    await runJson(() => showSession(ref, opts));
    return;
  }
  await runHumanLogged(async () => {
    const s = await showSession(ref, opts);
    console.log(`# ${s.summary.title || s.ref}\n`);
    if (s.summary.status !== "ok") {
      log.warn(
        `Session is ${s.summary.status}${s.summary.reason ? `: ${s.summary.reason}` : ""}`,
      );
    }
    for (const turn of s.turns) printTurn(turn);
    log.dim(
      `Turns ${s.offset}-${s.offset + s.turns.length} of ${s.total}, ${s.redactions.total} redaction(s).`,
    );
    if (s.nextOffset !== null) {
      log.dim(`More: cf session show --offset ${s.nextOffset} -- ${s.ref}`);
    }
  });
}

interface ExportOpts {
  json?: boolean;
  includeToolOutput?: boolean;
  projectDir?: string;
}

async function exportSession(ref: string, opts: ExportOpts) {
  const root = useProjectDir(opts.projectDir);
  const t = await readTranscript(ref, root);
  const r = await renderMarkdown(t, {
    includeToolOutput: !!opts.includeToolOutput,
    home: homedir(),
    timeoutMs: FILTER_TIMEOUT_MS,
  });
  return { ref: t.ref, ...r };
}

export async function sessionExportCommand(
  ref: string,
  opts: ExportOpts = {},
): Promise<void> {
  if (opts.json) {
    await runJson(async () => {
      const r = await exportSession(ref, opts);
      return {
        ref: r.ref,
        markdown: r.markdown,
        bytes: r.bytes,
        truncated: r.truncated,
        redactions: r.redactions,
        filter: r.filter,
      };
    });
    return;
  }
  await runHumanLogged(async () => {
    const r = await exportSession(ref, opts);
    // stdout carries only the Markdown, so it can be redirected to a file.
    process.stdout.write(r.fullMarkdown);
    console.error(
      `${r.redactions.total} redaction(s). Redaction is best effort: read the export before sharing it.`,
    );
  });
}
