import { input, select } from "@inquirer/prompts";
import { execFileSync } from "child_process";
import { lstatSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename, sep } from "path";
import { log } from "../lib/log.js";
import { run } from "../lib/exec.js";
import { readJson } from "../lib/json.js";
import { globalConfigPath, resolvePath } from "../lib/paths.js";
import {
  cloudRootOf,
  detectCloudFolders,
  SESSION_SUBFOLDER,
  type CloudProvider,
  type CloudRoot,
} from "../lib/cloud-folders.js";
import {
  buildPreviewText,
  isSessionUuid,
  saveSession,
  listProjectTranscripts,
  listSavedSessions,
  loadSession,
  type SavedSession,
  type SessionMeta,
} from "../lib/session.js";
import { loadConfig, resolveSessionDir } from "../lib/config.js";
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
import {
  claudeProvider,
  locateClaudeTranscript,
  readTranscriptFile,
} from "../lib/transcript-claude.js";
import { codexProvider } from "../lib/transcript-codex.js";
import type { CodingFriendConfig } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

type StoreSource = SavedSession["source"];

/** The saved-session store, from the global config only (a local session.dir never applies). */
function sessionStoreRoot(): string {
  return resolveSessionDir(readJson<CodingFriendConfig>(globalConfigPath()));
}

/** Legacy store `<P>/<docsDir>/sessions` of a `--project-dir` root (cwd is already there). */
function legacyStoreRoot(root: string): string {
  return join(root, loadConfig().docsDir ?? "docs", "sessions");
}

/**
 * Strip terminal escapes (OSC, CSI, 2-byte ESC) and C0/C1 control chars,
 * keeping \n and \t, so transcript text can't drive the terminal (OSC 52
 * clipboard writes, screen clears, titles).
 */
function stripControl(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

/** Human mode: transcript-derived text bound for a terminal is stripped. */
function tty(s: string): string {
  return process.stdout.isTTY ? stripControl(s) : s;
}

/** meta.json is untrusted: a field is used only when it is a string. */
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isoOrNull(v: unknown): string | null {
  const at = Date.parse(str(v));
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

function formatSessionChoice(s: SavedSession, home: string): string {
  const tag = s.source === "legacy" ? "(legacy) " : "";
  if (!s.meta) return `${tag}[${s.folder}]  (not downloaded)`;
  const clean = (v: unknown): string =>
    stripControl(redactText(str(v), { home }).text).replace(/\s+/g, " ");
  const at = isoOrNull(s.meta.savedAt);
  const date = at ? new Date(at).toLocaleString() : "?";
  const preview = truncateChars(clean(s.meta.previewText).trim(), 60);
  return `${tag}[${clean(s.meta.label)}]  ${date}  @${clean(s.meta.machine) || "unknown"}  — ${preview}`;
}

// ─── cf session save ─────────────────────────────────────────────────────────

interface SaveOpts {
  json?: boolean;
  sessionId?: string;
  projectDir?: string;
  label?: string;
}

interface SaveData {
  ref: string;
  folder: string;
  dir: string;
  sessionId: string;
  label: string;
  bytes: number;
  verbatim: true;
  warning: string;
}

/** Transcripts changed this close to the newest one are ambiguous. */
const RECENT_MS = 60_000;

function defaultLabel(): string {
  return `session-${new Date().toISOString().slice(0, 10)}`;
}

/** File of `--session-id` in any Claude project dir, `--project-dir` candidates first. */
function findTranscript(sessionId: string, root: string | undefined): string {
  const found = locateClaudeTranscript(sessionId, { projectDir: root });
  if (!found) {
    throw new CliError("NOT_FOUND", `Claude session not found: ${sessionId}`);
  }
  if (found.placeholder) {
    throw new CliError(
      "NOT_FOUND",
      `Claude session not downloaded: ${sessionId}`,
    );
  }
  return found.path;
}

/** Newest transcript of `base`; several recent ones need a choice (human only). */
async function pickTranscript(base: string, json: boolean): Promise<string> {
  const files = listProjectTranscripts(base);
  if (files.length === 0) {
    throw new CliError(
      "NOT_FOUND",
      `No Claude Code sessions found for ${base}. Run this inside a project that has Claude Code sessions.`,
    );
  }
  const recent = files.filter((f) => files[0].mtime - f.mtime < RECENT_MS);
  if (recent.length === 1) return files[0].path;
  if (json) {
    throw new CliError(
      "INTERACTIVE_REQUIRED",
      `${recent.length} sessions changed within 60 s: pass --session-id <uuid>`,
    );
  }
  return select({
    message: "Multiple recent sessions found. Which one to save?",
    choices: recent.map((f) => ({
      name: stripControl(
        `${basename(f.path)}  (modified ${new Date(f.mtime).toLocaleString()})`,
      ),
      value: f.path,
    })),
  });
}

async function saveCurrentSession(
  labelArg: string | undefined,
  opts: SaveOpts,
): Promise<SaveData> {
  // Checked before the id reaches any path.
  if (opts.sessionId !== undefined && !isSessionUuid(opts.sessionId)) {
    throw new CliError("INVALID_ARGS", "--session-id must be a session UUID");
  }
  const cwd = process.cwd();
  const root = useProjectDir(opts.projectDir);
  const json = !!opts.json;
  const jsonlPath = opts.sessionId
    ? findTranscript(opts.sessionId, root)
    : await pickTranscript(root ?? cwd, json);
  const label =
    opts.label ??
    labelArg ??
    (json
      ? defaultLabel()
      : await input({
          message: "Give this session a label:",
          default: defaultLabel(),
        }));
  const sessionId = basename(jsonlPath, ".jsonl");
  const saved = saveSession({
    jsonlPath,
    sessionId,
    label,
    storeRoot: sessionStoreRoot(),
    projectDir: root ?? cwd,
    previewText: buildPreviewText(jsonlPath),
  });
  return {
    ref: `saved:${saved.folder}`,
    folder: saved.folder,
    dir: saved.dir,
    sessionId,
    label,
    bytes: saved.bytes,
    verbatim: true,
    warning: saved.warning,
  };
}

export async function sessionSaveCommand(
  labelArg?: string,
  opts: SaveOpts = {},
): Promise<void> {
  if (opts.json) {
    await runJson(() => saveCurrentSession(labelArg, opts));
    return;
  }
  await runHumanLogged(async () => {
    const saved = await saveCurrentSession(labelArg, opts);
    log.success(`Session saved: "${tty(saved.label)}" (${saved.ref})`);
    log.dim(`  → ${tty(saved.dir)}`);
    log.warn(saved.warning);
  });
}

// ─── cf session status ───────────────────────────────────────────────────────

interface StatusData {
  dir: string;
  exists: boolean;
  cloud: CloudRoot | null;
  suggestions: {
    provider: CloudProvider;
    label: string;
    path: string;
    exists: boolean;
  }[];
  gitRepo: boolean;
}

const GIT_TIMEOUT_MS = 5_000;

/** True when `dir` is inside a git work tree; false when git is missing or fails. */
function inGitWorkTree(dir: string): boolean {
  // macOS /usr/bin/git is a shim that opens the Command Line Tools dialog
  // when no developer dir is set (same guard as learn-storage).
  if (process.platform === "darwin") {
    const git = run("which", ["git"]);
    if (git === null) return false;
    if (
      git.split("\n")[0] === "/usr/bin/git" &&
      run("xcode-select", ["-p"]) === null
    ) {
      return false;
    }
  }
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  try {
    const out = execFileSync(
      "git",
      ["-C", dir, "rev-parse", "--is-inside-work-tree"],
      {
        encoding: "utf-8",
        timeout: GIT_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "ignore"],
        env,
      },
    );
    return out.trim() === "true";
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function sessionStatus(): StatusData {
  const dir = sessionStoreRoot();
  const exists = isDir(dir);
  const home = homedir();
  return {
    dir,
    exists,
    cloud: cloudRootOf(dir, home, process.platform),
    suggestions: detectCloudFolders(
      home,
      process.platform,
      SESSION_SUBFOLDER,
    ).map(({ provider, label, path, exists }) => ({
      provider,
      label,
      path,
      exists,
    })),
    gitRepo: exists && inGitWorkTree(dir),
  };
}

export async function sessionStatusCommand(
  opts: { json?: boolean } = {},
): Promise<void> {
  if (opts.json) {
    await runJson(() => sessionStatus());
    return;
  }
  await runHumanLogged(() => {
    const s = sessionStatus();
    log.info(`Session folder: ${s.dir}${s.exists ? "" : " (missing)"}`);
    log.info(
      `Cloud folder: ${s.cloud ? `${s.cloud.provider} (${s.cloud.root})` : "no"}`,
    );
    if (s.gitRepo) {
      log.warn(
        "The session folder is inside a git work tree: saved transcripts are verbatim, not redacted.",
      );
    }
    for (const f of s.suggestions) {
      log.dim(`  ${f.label}: ${f.path}${f.exists ? "" : " (missing)"}`);
    }
  });
}

// ─── cf session load ─────────────────────────────────────────────────────────

interface Loadable {
  storeRoot: string;
  session: SavedSession;
}

export async function sessionLoadCommand(
  opts: { projectDir?: string } = {},
): Promise<void> {
  await runHumanLogged(async () => {
    // Relative answers resolve against the cwd the user ran `cf` from.
    const cwd = process.cwd();
    const root = useProjectDir(opts.projectDir);
    const home = homedir();
    const savedRoot = sessionStoreRoot();
    const stores: { root: string; source: StoreSource }[] = [
      { root: savedRoot, source: "saved" },
    ];
    // Legacy is never inferred from cwd: only with --project-dir.
    if (root) stores.push({ root: legacyStoreRoot(root), source: "legacy" });
    const choices = stores.flatMap(({ root: storeRoot, source }) =>
      listSavedSessions(storeRoot, source).map((session) => ({
        name: formatSessionChoice(session, home),
        value: { storeRoot, session } as Loadable,
      })),
    );

    if (choices.length === 0) {
      log.warn("No saved sessions found.");
      log.dim(`  Sessions dir: ${savedRoot}`);
      if (!root) {
        log.dim(
          "  Sessions saved in <project>/docs/sessions need --project-dir <project>.",
        );
      }
      return;
    }

    const chosen = await select<Loadable>({
      message: "Choose a session to load:",
      choices,
    });
    const { session } = chosen;
    if (session.status === "placeholder") {
      throw new CliError(
        "NOT_FOUND",
        `Saved session not downloaded: ${session.folder}`,
      );
    }

    // meta.projectPath is untrusted: a hint only, never the default.
    const savedPath = str(session.meta?.projectPath);
    const hint = savedPath
      ? ` (saved from ${stripControl(redactText(savedPath, { home }).text)})`
      : "";
    const answer = await input({
      message: `Project directory to load into${hint}:`,
      default: cwd,
    });
    const loaded = loadSession({
      storeRoot: chosen.storeRoot,
      folder: session.folder,
      target: resolvePath(answer.trim() || cwd, cwd),
    });

    const label = str(session.meta?.label) || session.folder;
    log.success(
      `Session "${stripControl(redactText(label, { home }).text)}" loaded.`,
    );
    log.info(`To resume, run:`);
    console.log(`\n  claude --resume ${loaded.sessionId}\n`);
  });
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

async function readTranscript(
  ref: string,
  projectDir: string | undefined,
): Promise<Transcript> {
  const parsed = parseRef(ref);
  if (parsed.kind === "legacy" && !projectDir) {
    throw new CliError("INVALID_ARGS", "legacy: refs need --project-dir");
  }
  if (parsed.kind === "saved") {
    return readStored(sessionStoreRoot(), "saved", parsed.id);
  }
  if (parsed.kind === "legacy") {
    return readStored(legacyStoreRoot(projectDir!), "legacy", parsed.id);
  }
  return PROVIDERS[parsed.kind].read(parsed, { projectDir });
}

/** Raw saved-session fields of a summary; the caller redacts them. */
function savedInfo(
  meta: SessionMeta,
  at: string,
): NonNullable<SessionSummary["saved"]> {
  return {
    label: str(meta.label),
    savedAt: at,
    machine: str(meta.machine) || "unknown",
  };
}

/**
 * `<root>/<folder>/session.jsonl`. The folder from the ref is the identity,
 * never `meta.folderName`; placeholders are never opened.
 */
async function readStored(
  root: string,
  source: StoreSource,
  folder: string,
): Promise<Transcript> {
  const ref = `${source}:${folder}`;
  const s = listSavedSessions(root, source).find((x) => x.folder === folder);
  if (!s) throw new CliError("NOT_FOUND", `Saved session not found: ${ref}`);
  if (s.status === "placeholder" || !s.meta) {
    throw new CliError("NOT_FOUND", `Saved session not downloaded: ${ref}`);
  }
  const t = await readTranscriptFile(join(root, folder, "session.jsonl"), ref);
  const at = isoOrNull(s.meta.savedAt) ?? t.summary.updatedAt;
  return {
    ...t,
    summary: { ...t.summary, source, saved: savedInfo(s.meta, at) },
  };
}

function mtimeIso(p: string): string {
  try {
    return lstatSync(p).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/** List row of a saved session from its meta.json, without opening session.jsonl. */
function storedSummary(
  root: string,
  s: SavedSession,
  home: string,
): SessionSummary {
  const dir = join(root, s.folder);
  const at = isoOrNull(s.meta?.savedAt) ?? mtimeIso(dir);
  let bytes = 0;
  try {
    const st = lstatSync(join(dir, "session.jsonl"));
    if (st.isFile()) bytes = st.size;
  } catch {
    // .icloud placeholder or missing: size unknown
  }
  const row: SessionSummary = {
    ref: `${s.source}:${s.folder}`,
    provider: "claude",
    source: s.source,
    title: str(s.meta?.previewText) || str(s.meta?.label),
    cwd: redactText(str(s.meta?.projectPath), { home }).text,
    startedAt: at,
    updatedAt: at,
    bytes,
    status: s.status,
  };
  if (s.meta) {
    const info = savedInfo(s.meta, at);
    row.saved = {
      label: redactTitle(info.label, home).text,
      savedAt: at,
      machine: redactText(info.machine, { home }).text,
    };
  }
  return row;
}

/** Path `p` is `root` or inside it (string test only, never used as a path). */
function inRoot(p: string, root: string): boolean {
  return p === root || p.startsWith(root + sep);
}

/** Rows of a store; with `project`, only those whose raw meta.projectPath is in it. */
function storedRows(
  root: string,
  source: StoreSource,
  home: string,
  project?: string,
): SessionSummary[] {
  return listSavedSessions(root, source)
    .filter((s) => !project || inRoot(str(s.meta?.projectPath), project))
    .map((s) => storedSummary(root, s, home));
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
  if (
    provider !== undefined &&
    provider !== "claude" &&
    provider !== "codex" &&
    provider !== "saved"
  ) {
    throw new CliError(
      "INVALID_ARGS",
      "--provider must be claude, codex or saved",
    );
  }
  const ids: (keyof typeof PROVIDERS)[] =
    provider === "saved" ? [] : provider ? [provider] : ["claude", "codex"];
  const home = homedir();
  const results = await Promise.all(
    ids.map((id) => PROVIDERS[id].list({ projectDir: root, limit })),
  );
  const stored: SessionSummary[] = [];
  if (provider === undefined || provider === "saved") {
    stored.push(...storedRows(sessionStoreRoot(), "saved", home, root));
    // Legacy is never inferred from cwd: only with --project-dir.
    if (root) stored.push(...storedRows(legacyStoreRoot(root), "legacy", home));
  }
  const merged = [...results.flatMap((r) => r.sessions), ...stored]
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
        tty(
          `${when}  ${s.ref.padEnd(44)}  ${truncateChars(s.title, 60)}${status}`,
        ),
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
  const summary: SessionSummary = {
    ...t.summary,
    title: redactField(t.summary.title, true),
    cwd: redactField(t.summary.cwd, false),
  };
  if (t.summary.saved) {
    summary.saved = {
      ...t.summary.saved,
      label: redactField(t.summary.saved.label, true),
      machine: redactField(t.summary.saved.machine, false),
    };
  }
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
    console.log(`${tty(turn.text)}\n`);
    return;
  }
  console.log(tty(`- tool: ${turn.name} ${turn.args}`).trimEnd());
  if (turn.output !== undefined) console.log(`\n${tty(turn.output)}\n`);
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
    console.log(`# ${tty(s.summary.title || s.ref)}\n`);
    if (s.summary.status !== "ok") {
      log.warn(
        tty(
          `Session is ${s.summary.status}${s.summary.reason ? `: ${s.summary.reason}` : ""}`,
        ),
      );
    }
    for (const turn of s.turns) printTurn(turn);
    log.dim(
      `Turns ${s.offset}-${s.offset + s.turns.length} of ${s.total}, ${s.redactions.total} redaction(s).`,
    );
    if (s.nextOffset !== null) {
      log.dim(
        tty(`More: cf session show --offset ${s.nextOffset} -- ${s.ref}`),
      );
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
    process.stdout.write(tty(r.fullMarkdown));
    console.error(
      `${r.redactions.total} redaction(s). Redaction is best effort: read the export before sharing it.`,
    );
  });
}
