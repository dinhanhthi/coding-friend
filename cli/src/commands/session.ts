import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { randomBytes } from "crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  linkSync,
  lstatSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "fs";
import { homedir } from "os";
import { join, basename, dirname, resolve, sep } from "path";
import { log } from "../lib/log.js";
import { readJson } from "../lib/json.js";
import { inGitWorkTree, isDir } from "../lib/learn-storage.js";
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
import {
  loadConfig,
  resolveDecisionConfig,
  resolveSessionDir,
  type DecisionConfig,
} from "../lib/config.js";
import {
  CLOUDFLARE_MODELS,
  checkGate,
  type GateResult,
} from "../lib/decide.js";
import {
  composeFilters,
  redactModelFilter,
  summaryFilter,
  type FilterStats,
} from "../lib/decide-filters.js";
import { appendDecisionLog } from "../lib/decide-log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { useProjectDir } from "../lib/project-option.js";
import {
  redactText,
  type ExtraFilter,
  type FilterStatus,
} from "../lib/redact.js";
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

/**
 * Legacy store `<P>/<docsDir>/sessions` of a `--project-dir` root (cwd is
 * already there), or null when docsDir leaves the project (absolute or `..`).
 */
function legacyStoreRoot(root: string): string | null {
  const docs = resolve(root, loadConfig().docsDir ?? "docs");
  return inRoot(docs, root) ? join(docs, "sessions") : null;
}

/** Legacy store of a `legacy:` ref; a docsDir outside the project is refused. */
function requireLegacyStore(root: string): string {
  const store = legacyStoreRoot(root);
  if (!store) {
    throw new CliError(
      "INVALID_VALUE",
      "docsDir points outside the project: legacy sessions are not read",
    );
  }
  return store;
}

/**
 * Strip terminal escapes (OSC, CSI, 2-byte ESC), C0/C1 control chars (keeping
 * \n and \t) and Unicode bidi overrides, so transcript text can't drive the
 * terminal (OSC 52 clipboard writes, screen clears, titles) or reorder it.
 */
function stripControl(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "");
}

/**
 * Human mode: transcript-derived text bound for a terminal is stripped, then
 * redacted again, so a secret split by a control char can't rejoin on screen.
 */
function tty(s: string): string {
  return process.stdout.isTTY ? redactText(stripControl(s), {}).text : s;
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
    redactText(stripControl(str(v)), { home }).text.replace(/\s+/g, " ");
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
  // Claude keys transcripts by the dir it ran in: a worktree's own path, not
  // the main repo root that useProjectDir returns.
  const lookup = root ? realpathSync(resolve(cwd, opts.projectDir!)) : cwd;
  const json = !!opts.json;
  const jsonlPath = opts.sessionId
    ? findTranscript(opts.sessionId, root && lookup)
    : await pickTranscript(lookup, json);
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
    projectDir: lookup,
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

interface LoadOpts {
  json?: boolean;
  yes?: boolean;
  target?: string;
  force?: boolean;
  projectDir?: string;
}

interface LoadData {
  ref: string;
  sessionId: string;
  target: string;
  path: string;
  resumeCommand: string;
}

/** POSIX single-quote `s` for a shell command line. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** JSON mode: load `ref` into `--target` without any prompt. */
function loadRef(ref: string | undefined, opts: LoadOpts): LoadData {
  // Relative --target resolves against the cwd the user ran `cf` from.
  const cwd = process.cwd();
  const root = useProjectDir(opts.projectDir);
  if (!opts.yes) {
    throw new CliError("INTERACTIVE_REQUIRED", "load --json needs --yes");
  }
  if (!opts.target) {
    throw new CliError("INVALID_ARGS", "load --json needs --target <path>");
  }
  if (!ref) {
    throw new CliError(
      "INVALID_ARGS",
      "load --json needs a ref: saved:<folder> or legacy:<folder>",
    );
  }
  const parsed = parseRef(ref);
  if (parsed.kind !== "saved" && parsed.kind !== "legacy") {
    throw new CliError(
      "INVALID_ARGS",
      "Only saved:<folder> and legacy:<folder> sessions can be loaded",
    );
  }
  if (parsed.kind === "legacy" && !root) {
    throw new CliError("INVALID_ARGS", "legacy: refs need --project-dir");
  }
  // Not realpath'd here: claudeLoadTargetDir does it (NOT_FOUND if missing).
  const target = resolvePath(opts.target, cwd);
  const loaded = loadSession({
    storeRoot:
      parsed.kind === "saved" ? sessionStoreRoot() : requireLegacyStore(root!),
    folder: parsed.id,
    target,
    force: !!opts.force,
  });
  return {
    ref: `${parsed.kind}:${parsed.id}`,
    sessionId: loaded.sessionId,
    target,
    path: loaded.path,
    resumeCommand: `cd ${shellQuote(target)} && claude --resume ${loaded.sessionId}`,
  };
}

export async function sessionLoadCommand(
  ref?: string,
  opts: LoadOpts = {},
): Promise<void> {
  if (opts.json) {
    await runJson(() => loadRef(ref, opts));
    return;
  }
  await runHumanLogged(async () => {
    if (ref !== undefined || opts.target !== undefined || opts.yes) {
      log.warn("[ref], --target and --yes only apply with --json: ignored.");
    }
    // Relative answers resolve against the cwd the user ran `cf` from.
    const cwd = process.cwd();
    const root = useProjectDir(opts.projectDir);
    const home = homedir();
    const savedRoot = sessionStoreRoot();
    const stores: { root: string; source: StoreSource }[] = [
      { root: savedRoot, source: "saved" },
    ];
    // Legacy is never inferred from cwd: only with --project-dir.
    const legacy = root ? legacyStoreRoot(root) : null;
    if (legacy) stores.push({ root: legacy, source: "legacy" });
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
      ? ` (saved from ${redactText(stripControl(savedPath), { home }).text})`
      : "";
    const answer = await input({
      message: `Project directory to load into${hint}:`,
      default: cwd,
    });
    const loaded = loadSession({
      storeRoot: chosen.storeRoot,
      folder: session.folder,
      target: resolvePath(answer.trim() || cwd, cwd),
      force: !!opts.force,
    });

    const label = str(session.meta?.label) || session.folder;
    log.success(
      `Session "${redactText(stripControl(label), { home }).text}" loaded.`,
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
/** Without --redact-model/--summary no filter runs; this only bounds the call. */
const FILTER_TIMEOUT_MS = 10_000;
/** Whole budget for --redact-model/--summary; past it the export is regex-only. */
const MODEL_FILTER_TIMEOUT_MS = 60_000;

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
    return readStored(requireLegacyStore(projectDir!), "legacy", parsed.id);
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
    const legacy = root ? legacyStoreRoot(root) : null;
    if (legacy) stored.push(...storedRows(legacy, "legacy", home));
  }
  // Saved rows are redacted already; a second pass changes nothing.
  const merged = [...results.flatMap((r) => r.sessions), ...stored]
    .map((s) => ({
      ...s,
      title: redactTitle(s.title, home).text,
      cwd: redactText(s.cwd, { home }).text,
    }))
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
  out?: string;
  force?: boolean;
  redactModel?: boolean;
  summary?: boolean;
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

/** Refuse a `--out` that can't be written without `--force` or at all. */
function checkExportTarget(out: string, force: boolean): void {
  let parent: Stats;
  try {
    parent = statSync(dirname(out));
  } catch {
    throw new CliError("NOT_FOUND", `Folder not found: ${dirname(out)}`);
  }
  if (!parent.isDirectory()) {
    throw new CliError("INVALID_ARGS", `Not a folder: ${dirname(out)}`);
  }
  const st = lstatOrNull(out);
  if (!st) return;
  if (st.isSymbolicLink()) {
    throw new CliError(
      "INVALID_ARGS",
      `Refusing to write to a symlink: ${out}`,
    );
  }
  if (st.isDirectory()) {
    throw new CliError("CONFLICT", `A folder exists at ${out}`);
  }
  if (!st.isFile()) {
    throw new CliError("INVALID_ARGS", `Not a regular file: ${out}`);
  }
  if (!force) {
    throw new CliError(
      "CONFLICT",
      `File already exists: ${out} (pass --force to overwrite)`,
    );
  }
}

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException).code;
}

/**
 * Put `tmp` at `out` only if nothing is there: a hard link, or an exclusive
 * copy where the filesystem has no hard links (exFAT, some network mounts).
 */
function placeExclusive(tmp: string, out: string): void {
  const conflict = () =>
    new CliError(
      "CONFLICT",
      `File already exists: ${out} (pass --force to overwrite)`,
    );
  try {
    linkSync(tmp, out);
    return;
  } catch (err) {
    if (errCode(err) === "EEXIST") throw conflict();
  }
  try {
    copyFileSync(tmp, out, constants.COPYFILE_EXCL);
  } catch (err) {
    throw errCode(err) === "EEXIST" ? conflict() : err;
  }
}

/**
 * Temp file in the same folder, mode 0600, then moved to `out`: renamed over
 * it with `force`, else placed only if no file appeared since the check.
 */
function writeExportFile(out: string, text: string, force: boolean): void {
  const tmp = join(
    dirname(out),
    `.cf-export.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(tmp, text, { flag: "wx", mode: 0o600 });
    chmodSync(tmp, 0o600);
    if (force) {
      renameSync(tmp, out);
    } else {
      placeExclusive(tmp, out);
      unlinkSync(tmp);
    }
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // tmp may not exist
    }
    throw err;
  }
}

interface ModelFilter {
  cfg: DecisionConfig;
  filter: ExtraFilter;
  stats: FilterStats[];
}

/** Names the fix only (env var names, never values). */
function gateMessage(
  cfg: DecisionConfig,
  reason: Exclude<GateResult, { ok: true }>["reason"],
): string {
  if (reason === "off") {
    return "--redact-model and --summary need a decision model, but decision.provider is off; set it with cf config set --global decision.provider local";
  }
  if (reason === "gate" && cfg.provider === "local") {
    return "decision.baseUrl is not a loopback address (127.0.0.1, ::1, localhost), so decision.provider local would send data off this machine; point decision.baseUrl at a local server, or only if a remote server is intended set cf config set --global decision.allowRemote true";
  }
  if (reason === "gate") {
    return `decision.provider "${cfg.provider}" sends data off this machine and decision.allowRemote is false in the global config; set it with cf config set --global decision.allowRemote true`;
  }
  return cfg.provider === "cloudflare"
    ? "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set for decision.provider cloudflare"
    : "TYPESAFE_API_KEY is not set (needed for decision.provider typesafe)";
}

/** Config the gate does not check but every request would fail on (never values). */
function configProblem(cfg: DecisionConfig): string | null {
  if (cfg.provider === "cloudflare" && !CLOUDFLARE_MODELS.has(cfg.model)) {
    return `decision.model must be one of ${[...CLOUDFLARE_MODELS].join(", ")} for decision.provider cloudflare`;
  }
  if (cfg.provider === "local") {
    try {
      new URL(cfg.baseUrl);
    } catch {
      return "decision.baseUrl is not a valid URL (needed for decision.provider local)";
    }
  }
  return null;
}

/**
 * The --redact-model/--summary filter, or null. A config problem (provider off,
 * gate closed, missing key, bad model or baseUrl) throws here, before the
 * transcript is read.
 */
function modelFilter(opts: ExportOpts): ModelFilter | null {
  if (!opts.redactModel && !opts.summary) return null;
  const cfg = resolveDecisionConfig();
  const gate = checkGate(cfg, { allowSynthetic: false });
  if (!gate.ok) {
    throw new CliError("INVALID_ARGS", gateMessage(cfg, gate.reason));
  }
  const problem = configProblem(cfg);
  if (problem) throw new CliError("INVALID_ARGS", problem);
  const stats: FilterStats[] = [];
  const onStats = (s: FilterStats): void => {
    stats.push(s);
  };
  const redact = opts.redactModel ? redactModelFilter(cfg, { onStats }) : null;
  const summary = opts.summary ? summaryFilter(cfg, { onStats }) : null;
  const filter =
    redact && summary ? composeFilters(redact, summary) : (redact ?? summary)!;
  return { cfg, filter, stats };
}

/** Why a filtered export fell back, as a reason token; undefined when applied. */
function exportFallbackReason(
  m: ModelFilter,
  status: FilterStatus,
): string | undefined {
  if (status === "applied") return undefined;
  // runFilter's own verdict wins for rejected/timeout: on timeout the filter's
  // "aborted" stats may or may not have arrived yet.
  if (status === "rejected" || status === "timeout") return status;
  return m.stats.find((s) => s.fallbackReason)?.fallbackReason ?? status;
}

/** One aggregated log line per filtered export: counts and tokens only. */
function logExportDecision(
  m: ModelFilter,
  status: FilterStatus,
  fallbackReason: string | undefined,
  wallMs: number,
): void {
  const ok = status === "applied";
  const sum = (key: "asked" | "dropped" | "latencyMs"): number =>
    m.stats.reduce((n, s) => n + s[key], 0);
  appendDecisionLog({
    v: 1,
    ts: new Date().toISOString(),
    point: "export",
    provider: m.cfg.provider,
    model: m.cfg.model,
    ok,
    fallbackReason,
    latencyMs: m.stats.length ? sum("latencyMs") : wallMs,
    answers: { asked: sum("asked"), dropped: ok ? sum("dropped") : 0 },
  });
}

async function exportSession(ref: string, opts: ExportOpts) {
  // Relative --out resolves against the cwd the user ran `cf` from.
  const cwd = process.cwd();
  const root = useProjectDir(opts.projectDir);
  if (opts.force && opts.out === undefined) {
    throw new CliError("INVALID_ARGS", "--force needs --out <file>");
  }
  const model = modelFilter(opts);
  const out = opts.out === undefined ? null : resolvePath(opts.out, cwd);
  if (out) checkExportTarget(out, !!opts.force);
  const t = await readTranscript(ref, root);
  const started = performance.now();
  const r = await renderMarkdown(t, {
    includeToolOutput: !!opts.includeToolOutput,
    home: homedir(),
    filter: model?.filter,
    timeoutMs: model ? MODEL_FILTER_TIMEOUT_MS : FILTER_TIMEOUT_MS,
  });
  const fallbackReason = model
    ? exportFallbackReason(model, r.filter.status)
    : undefined;
  if (model) {
    logExportDecision(
      model,
      r.filter.status,
      fallbackReason,
      Math.round(performance.now() - started),
    );
  }
  if (out) {
    checkExportTarget(out, !!opts.force);
    writeExportFile(out, r.fullMarkdown, !!opts.force);
  }
  return { ref: t.ref, out, fallbackReason, ...r };
}

const SHARE_NOTE =
  "Redaction is best effort: read the export before sharing it.";

export async function sessionExportCommand(
  ref: string,
  opts: ExportOpts = {},
): Promise<void> {
  if (opts.json) {
    await runJson(async () => {
      const r = await exportSession(ref, opts);
      if (r.out) {
        return {
          ref: r.ref,
          out: r.out,
          bytes: r.bytes,
          redactions: r.redactions,
          filter: r.filter,
        };
      }
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
    // stderr, so a redirected stdout stays pure Markdown.
    if (r.filter.name) {
      console.error(`filter: ${r.filter.name} ${r.filter.status}`);
      if (r.filter.status !== "applied") {
        console.error(
          chalk.yellow("⚠"),
          `model filter failed (${r.fallbackReason ?? r.filter.status}), export uses regex redaction only`,
        );
      }
    }
    if (r.out) {
      log.success(`Exported ${tty(r.ref)} to ${tty(r.out)}`);
      log.info(`${r.bytes} bytes, ${r.redactions.total} redaction(s).`);
      log.warn(SHARE_NOTE);
      return;
    }
    // stdout carries only the Markdown, so it can be redirected to a file.
    process.stdout.write(tty(r.fullMarkdown));
    console.error(`${r.redactions.total} redaction(s). ${SHARE_NOTE}`);
  });
}
