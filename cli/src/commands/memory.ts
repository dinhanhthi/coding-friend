import { execFile } from "child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "fs";
import { isAbsolute, join, resolve, sep } from "path";
import { homedir } from "os";

import { confirm } from "@inquirer/prompts";
import { resolveMemoryDir, loadConfig } from "../lib/config.js";
import { run, runWithStderr } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
import { memoryConfigMenu } from "../lib/memory-prompts.js";
import {
  registerMemoryMcp,
  isMemoryMcpRegistered,
} from "../lib/memory-mcp-register.js";
import { readJson, mergeJson } from "../lib/json.js";
import { warnStaleMcpJson } from "../lib/mcp-state.js";
import { checkMemoryMcpHealth, printHealthSection } from "../lib/mcp-health.js";
import { globalConfigPath, localConfigPath } from "../lib/paths.js";
import { showConfigHint } from "../lib/prompt-utils.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { useProjectDir } from "../lib/project-option.js";
import { formatUptime } from "../lib/uptime.js";
import {
  atomicWrite,
  deleteNote,
  readBodyFromStdin,
  readNote,
  replaceBody,
  resolveNotePath,
} from "../lib/note-io.js";
import {
  collectMemoryCore,
  collectMemoryDetails,
  countMdFiles,
  dirSize,
  getProjectInfo,
  getProjectsBaseDir,
  listMemories,
  searchMemories,
  type ProjectInfo,
} from "../lib/memory-data.js";
import type { CodingFriendConfig } from "../types.js";
import chalk from "chalk";

function getMemoryDir(path?: string): string {
  return resolveMemoryDir(path);
}

const MAX_ERROR_LINES = 30;

function truncateError(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= MAX_ERROR_LINES) return text;
  const head = lines.slice(0, 20);
  const tail = lines.slice(-8);
  const skipped = lines.length - 28;
  return [...head, `  ... (${skipped} lines omitted) ...`, ...tail].join("\n");
}

export function ensureMemoryBuilt(
  mcpDir: string,
  opts?: { exitOnError?: boolean },
): boolean {
  const exitOnError = opts?.exitOnError ?? true;
  const fail = (msg: string, stderr?: string): boolean => {
    log.error(msg);
    if (stderr) log.error(truncateError(stderr));
    if (exitOnError) process.exit(1);
    return false;
  };

  if (!existsSync(join(mcpDir, "node_modules"))) {
    log.step("Installing memory server dependencies (one-time setup)...");
    const result = runWithStderr("npm", ["install"], { cwd: mcpDir });
    if (result.exitCode !== 0) {
      return fail("Failed to install dependencies", result.stderr);
    }
    log.success("Done.");
  }

  if (!existsSync(join(mcpDir, "dist"))) {
    log.step("Building memory server...");
    const result = runWithStderr("npm", ["run", "build"], { cwd: mcpDir });
    if (result.exitCode !== 0) {
      return fail("Failed to build memory server", result.stderr);
    }
    log.success("Done.");
  }

  return true;
}

/**
 * Rebuild the memory server after a CLI update.
 *
 * cf-memory ships as source only — its `dist/` and `node_modules/` are
 * gitignored and excluded from the npm tarball — so `npm install -g
 * coding-friend-cli@latest` leaves them missing. The memory MCP server
 * (`mcp-serve` → `node dist/index.js`) then fails to start until the next
 * `cf memory status` triggers a build. Building here makes memory ready
 * before the next Claude Code session, so users no longer have to run
 * `cf memory status` twice after `cf update`.
 *
 * No-op for users who never set up memory. Never aborts the update on failure.
 */
export async function refreshMemoryAfterUpdate(): Promise<void> {
  try {
    if (!isMemoryInitialized()) return;

    const mcpDir = getLibPath("cf-memory");
    log.step("Ensuring memory server is built...");
    const built = ensureMemoryBuilt(mcpDir, { exitOnError: false });
    if (built) {
      log.success("Memory server ready.");
    } else {
      log.warn('Memory server build failed — run "cf memory status" to retry.');
    }
  } catch {
    // Never let a memory-refresh failure abort the rest of `cf update`.
    log.warn(
      'Could not refresh memory server — run "cf memory status" to retry.',
    );
  }
}

export function printMemoryMcpConfig(memoryDir: string): void {
  console.log(
    chalk.dim(
      "For non-Claude-Code MCP clients only (Claude Code is already set up via the user-scope registration above) — add this to that client's config:",
    ),
  );
  console.log();

  console.log(`{
  "mcpServers": {
    "coding-friend-memory": {
      "command": "npx",
      "args": [
        "-y",
        "coding-friend-cli",
        "mcp-serve",
        "${memoryDir}"
      ]
    }
  }
}`);
  console.log();

  log.dim("Available tools & resources: https://cf.dinhanhthi.com/#memory");
  console.log();
  log.dim(
    "Note: this explicit path is needed only for clients that can't set CLAUDE_PROJECT_DIR. Claude Code resolves the project automatically and needs no manual config.",
  );
  console.log();
}

/** JSON mode never exits: a failed build becomes MEMORY_BUILD_FAILED. */
function requireMemoryBuilt(mcpDir: string): void {
  if (!ensureMemoryBuilt(mcpDir, { exitOnError: false })) {
    throw new CliError("MEMORY_BUILD_FAILED", "Failed to build memory server");
  }
}

interface JsonFlag {
  json?: boolean;
}

interface ProjectFlags extends JsonFlag {
  projectDir?: string;
}

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

const MAX_QUERY_CHARS = 500;

function checkQuery(query: string): void {
  if (query.length > MAX_QUERY_CHARS) {
    throw new CliError(
      "INVALID_VALUE",
      `Query is longer than ${MAX_QUERY_CHARS} characters`,
    );
  }
}

export async function memoryStatusCommand(opts: JsonFlag = {}): Promise<void> {
  if (opts.json) {
    await runJson(async () => {
      const memoryDir = getMemoryDir();
      const mcpDir = getLibPath("cf-memory");
      requireMemoryBuilt(mcpDir);
      const core = await collectMemoryCore(memoryDir, mcpDir);
      return { ...core, ...collectMemoryDetails(memoryDir) };
    });
    return;
  }

  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  const core = await collectMemoryCore(memoryDir, mcpDir);
  const sqliteAvailable = core.sqliteDeps;
  const { daemon } = core;

  let tierLabel: string;
  if (core.tier === 1) {
    tierLabel = chalk.cyan("Tier 1 (SQLite + Hybrid)");
  } else if (core.tier === 2) {
    tierLabel = chalk.cyan("Tier 2 (MiniSearch + Daemon)");
  } else {
    tierLabel = chalk.cyan("Tier 3 (Markdown)");
  }

  printBanner("🧠 Coding Friend Memory");
  console.log();
  log.info(`Tier: ${tierLabel}`);
  log.info(`Memory dir: ${chalk.cyan(memoryDir)}`);
  log.info(`Memories in this dir: ${chalk.green(String(core.documents))}`);

  if (daemon.running && daemon.startedAt !== null) {
    const uptime = (Date.now() - daemon.startedAt) / 1000;
    log.info(
      `Daemon: ${chalk.green("running")} (PID ${daemon.pid}, uptime ${formatUptime(uptime)}) ${chalk.dim('Turn it off by "cf memory stop-daemon"')}`,
    );
  } else if (sqliteAvailable) {
    log.info(
      `Daemon: ${chalk.dim("stopped")} ${chalk.dim("(not needed — Tier 1 uses SQLite directly)")}`,
    );
  } else {
    log.info(
      `Daemon: ${chalk.dim("stopped")} ${chalk.dim('(run "cf memory start-daemon" for Tier 2 search)')}`,
    );
  }

  if (sqliteAvailable) {
    log.info(`SQLite deps: ${chalk.green("installed")}`);
  } else {
    log.info(
      `SQLite deps: ${chalk.dim("not installed")} (run "cf memory init" to enable Tier 1)`,
    );
  }

  const details = collectMemoryDetails(memoryDir);
  if (details.embedding) {
    const { provider, model } = details.embedding;
    log.info(`Embedding: ${chalk.cyan(model)} ${chalk.dim(`(${provider})`)}`);
  }

  // MCP status
  const mcpStatus = details.mcp;
  if (mcpStatus.userScope && mcpStatus.scope === "local") {
    log.info(
      `MCP: ${chalk.green("registered")} ${chalk.dim("(user scope)")} ${chalk.yellow('⚠ project .mcp.json shadows user-scope server — run "cf update" to clean up')}`,
    );
  } else if (mcpStatus.userScope) {
    log.info(`MCP: ${chalk.green("registered")} ${chalk.dim("(user scope)")}`);
  } else if (mcpStatus.configured && mcpStatus.scope === "local") {
    log.info(
      `MCP: ${chalk.yellow("configured")} ${chalk.dim('(local .mcp.json — run "cf mcp" to migrate to user scope)')}`,
    );
  } else if (mcpStatus.configured && mcpStatus.scope === "global") {
    log.info(
      `MCP: ${chalk.yellow("configured")} ${chalk.dim('(global ~/.claude/.mcp.json — run "cf mcp" to migrate to user scope)')} ${chalk.yellow("⚠ global config uses a fixed path — only works for one project")}`,
    );
  } else {
    log.info(
      `MCP: ${chalk.dim("not registered")} ${chalk.dim('(run "cf mcp" to register at user scope)')}`,
    );
  }

  log.info(
    `Auto-capture: ${details.autoCapture ? chalk.green("on") : chalk.dim("off")}`,
  );

  if (details.categories.length > 0) {
    const categories = details.categories.map((c) => `${c.name} (${c.count})`);
    log.info(`Categories: ${chalk.dim(categories.join(", "))}`);
  }
  console.log();
  log.dim(`Docs: https://cf.dinhanhthi.com/#memory`);
  console.log();
}

export async function memorySearchCommand(
  query: string,
  opts: ProjectFlags = {},
): Promise<void> {
  if (opts.json) {
    await runJson(() => {
      useProjectDir(opts.projectDir);
      checkQuery(query);
      const memoryDir = getMemoryDir();
      if (!existsSync(memoryDir)) {
        throw new CliError("NOT_FOUND", `Memory dir not found: ${memoryDir}`);
      }
      const mcpDir = getLibPath("cf-memory");
      requireMemoryBuilt(mcpDir);
      return { query, results: searchMemories(memoryDir, mcpDir, query) };
    });
    return;
  }

  await runHumanLogged(() => {
    useProjectDir(opts.projectDir);
    checkQuery(query);
    memorySearchHuman(query);
  });
}

function memorySearchHuman(query: string): void {
  const memoryDir = getMemoryDir();

  if (!existsSync(memoryDir)) {
    log.error(`Memory dir not found: ${memoryDir}`);
    log.dim("Run `cf init` to create project folders.");
    process.exit(1);
  }

  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  // Use the MarkdownBackend directly for CLI search
  // Pass query via env var to prevent command injection
  const result = run(
    "node",
    [
      "-e",
      `
      import { MarkdownBackend } from ${JSON.stringify(join(mcpDir, "dist/backends/markdown.js"))};
      const backend = new MarkdownBackend(${JSON.stringify(memoryDir)});
      const results = await backend.search({ query: process.env.CF_SEARCH_QUERY, limit: 10 });
      for (const r of results) {
        console.log(\`[\${r.score}] \${r.memory.frontmatter.title}\`);
        console.log(\`    \${r.memory.frontmatter.description}\`);
        console.log(\`    id: \${r.memory.id} | type: \${r.memory.frontmatter.type} | matched: \${r.matchedOn.join(", ")}\`);
        console.log();
      }
      if (results.length === 0) console.log("No results found.");
      `,
    ],
    { cwd: memoryDir, env: { ...process.env, CF_SEARCH_QUERY: query } },
  );

  if (result !== null) {
    console.log(result);
  }
}

export async function memoryListCommand(
  opts: ProjectFlags & { projects?: boolean },
): Promise<void> {
  if (opts.json) {
    await runJson<unknown[]>(() => {
      useProjectDir(opts.projectDir);
      return opts.projects ? listMemoryProjects() : listMemoriesJson();
    });
    return;
  }

  await runHumanLogged(() => {
    useProjectDir(opts.projectDir);
    return opts.projects ? memoryListProjectsCommand() : memoryListHuman();
  });
}

function memoryListHuman(): void {
  const memoryDir = getMemoryDir();

  if (!existsSync(memoryDir)) {
    log.info(`No memory directory found at: ${memoryDir}`);
    log.dim(
      "This folder has no memories yet. Use --projects to list all project databases.",
    );
    log.dim(
      'Or run "cf init" to set up this project, then "/cf-scan" in Claude Code.',
    );
    return;
  }

  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  const result = run(
    "node",
    [
      "-e",
      `
      import { MarkdownBackend } from ${JSON.stringify(join(mcpDir, "dist/backends/markdown.js"))};
      const backend = new MarkdownBackend(${JSON.stringify(memoryDir)});
      const metas = await backend.list({});
      if (metas.length === 0) { console.log("No memories found."); process.exit(0); }

      // Compute column widths
      const idxW = String(metas.length).length;
      const typeW = Math.max(4, ...metas.map(m => m.frontmatter.type.length));
      const idW = Math.max(2, ...metas.map(m => m.id.length));

      // Header
      const hdr = "#".padStart(idxW) + "  " + "TYPE".padEnd(typeW) + "  " + "ID".padEnd(idW) + "  " + "TITLE";
      console.log(hdr);
      console.log("-".repeat(hdr.length + 10));

      metas.forEach((m, i) => {
        const idx = String(i + 1).padStart(idxW);
        const type = m.frontmatter.type.padEnd(typeW);
        const id = m.id.padEnd(idW);
        console.log(idx + "  " + type + "  " + id + "  " + m.frontmatter.title);
      });

      console.log();
      console.log("Total: " + metas.length + " memories");
      `,
    ],
    { cwd: memoryDir },
  );

  if (result !== null) {
    console.log(result);
  }
}

function listMemoriesJson() {
  const memoryDir = getMemoryDir();
  if (!existsSync(memoryDir)) return [];
  const mcpDir = getLibPath("cf-memory");
  requireMemoryBuilt(mcpDir);
  return listMemories(memoryDir, mcpDir);
}

// ─── show / edit / delete one memory ──────────────────────────────────────────

type IndexState = "watched" | "stale" | "none";

/** Same file cf-memory's daemon writes (daemon/process.ts), read without its mkdir. */
function daemonPidFile(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  return join(home, ".coding-friend", "memory", "daemon.pid");
}

function processCommand(pid: number): Promise<string | null> {
  return new Promise((done) => {
    try {
      execFile(
        "ps",
        ["-ww", "-o", "command=", "-p", String(pid)],
        { timeout: 2000 },
        (err, stdout) => done(err ? null : String(stdout)),
      );
    } catch {
      done(null);
    }
  });
}

/**
 * The docsDir argument of a daemon command line
 * (`node …/daemon/entry.js <docsDir> [idleTimeoutMs] [--flag=…]`): the words
 * after `entry.js` up to the idle timeout or the first flag.
 */
function daemonDocsDir(command: string): string | null {
  const m = /[\\/]entry\.js +(.+)$/.exec(command.split("\n")[0].trim());
  if (!m) return null;
  const words = m[1].split(" ");
  const end = words.findIndex(
    (w, i) => i > 0 && (/^\d+$/.test(w) || w.startsWith("--")),
  );
  return words.slice(0, end === -1 ? undefined : end).join(" ");
}

/** True only when the shared daemon provably watches exactly `memoryDir`. */
async function daemonWatches(memoryDir: string): Promise<boolean> {
  if (process.platform === "win32") return false;
  try {
    const first = readFileSync(daemonPidFile(), "utf-8").trim().split("\n")[0];
    const pid = parseInt(first, 10);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EPERM") return false;
    }
    const command = await processCommand(pid);
    const dir = command ? daemonDocsDir(command) : null;
    if (!dir || !isAbsolute(dir)) return false;
    return realpathSync(dir) === realpathSync(memoryDir);
  } catch {
    return false;
  }
}

/**
 * Search index state after a memory file changed. Never builds cf-memory
 * (edit/delete must stay fast); anything unknown is "stale".
 */
async function memoryIndexState(memoryDir: string): Promise<IndexState> {
  if (await daemonWatches(memoryDir)) return "watched";
  try {
    const mcpDir = getLibPath("cf-memory");
    if (!existsSync(join(mcpDir, "dist"))) return "stale";
    const { tier } = await collectMemoryCore(memoryDir, mcpDir);
    return tier === 3 ? "none" : "stale";
  } catch {
    return "stale";
  }
}

function printIndexHint(index: IndexState, root: string): void {
  if (index !== "stale") return;
  log.dim(
    `Search index may be stale. Rebuild it: cd "${root}" && cf memory rebuild`,
  );
}

// Port of cf-memory src/lib/claude-md.ts (parse/build/remove), so the CLI
// does not load the cf-memory package to drop a synced convention entry.
const RULES_HEADER = "## CF Memory: Project Rules";
const LEGACY_RULES_HEADER = "## CF Memory: Conventions";
const RULE_ENTRY_RE = /^- .+ <!-- cf:(.+?) -->$/;

interface RulesSection {
  before: string;
  entries: string[];
  after: string;
  untrackedLines: string[];
}

function parseRules(content: string): RulesSection {
  let headerIdx = content.indexOf(RULES_HEADER);
  let headerLen = RULES_HEADER.length;
  if (headerIdx === -1) {
    headerIdx = content.indexOf(LEGACY_RULES_HEADER);
    headerLen = LEGACY_RULES_HEADER.length;
  }
  if (headerIdx === -1) {
    return { before: content, entries: [], after: "", untrackedLines: [] };
  }

  const before = content.slice(0, headerIdx);
  const rest = content.slice(headerIdx + headerLen);
  const next = rest.match(/\n(## )/);
  const sectionBody =
    next?.index !== undefined ? rest.slice(0, next.index) : rest;
  const after = next?.index !== undefined ? rest.slice(next.index + 1) : "";

  const entries: string[] = [];
  const untrackedLines: string[] = [];
  for (const line of sectionBody.split("\n")) {
    if (RULE_ENTRY_RE.test(line)) entries.push(line);
    else if (line.trim()) untrackedLines.push(line);
  }
  return { before, entries, after, untrackedLines };
}

/** Rebuild the file; the section is dropped when nothing is left in it. */
function buildRules({
  before,
  entries,
  after,
  untrackedLines,
}: RulesSection): string {
  if (entries.length === 0 && untrackedLines.length === 0) {
    return before.trimEnd() + (after ? "\n\n" + after : "\n");
  }
  let result = before.trimEnd() + "\n\n" + RULES_HEADER + "\n\n";
  if (untrackedLines.length > 0) result += untrackedLines.join("\n") + "\n";
  if (entries.length > 0) result += entries.join("\n") + "\n";
  if (after) result += "\n" + after;
  return result;
}

/**
 * Best-effort: drop `<!-- cf:<id> -->` from CLAUDE.md / AGENTS.md at the
 * project root (cf-memory's root: memoryDir minus `/docs/memory` or `/memory`).
 */
function removeRuleEntry(
  memoryDir: string,
  id: string,
): { files: string[]; warnings: string[] } {
  const root = resolve(memoryDir)
    .replace(/\/docs\/memory$/, "")
    .replace(/\/memory$/, "");
  const files: string[] = [];
  const warnings: string[] = [];
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const file = join(root, name);
    try {
      if (!existsSync(file)) continue;
      const section = parseRules(readFileSync(file, "utf-8"));
      const entries = section.entries.filter(
        (e) => e.match(RULE_ENTRY_RE)?.[1] !== id,
      );
      if (entries.length === section.entries.length) continue;
      // Write the real file (AGENTS.md is often a symlink to CLAUDE.md) atomically,
      // so a crash mid-write never leaves a truncated rules file.
      const target = realpathSync(file);
      atomicWrite(
        target,
        Buffer.from(buildRules({ ...section, entries }), "utf-8"),
        statSync(target).mode & 0o777,
      );
      files.push(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not update ${file}: ${msg}`);
    }
  }
  return { files, warnings };
}

export async function memoryShowCommand(
  id: string,
  opts: ProjectFlags = {},
): Promise<void> {
  const show = () => {
    useProjectDir(opts.projectDir);
    const path = resolveNotePath(getMemoryDir(), id);
    const note = readNote(path);
    return {
      raw: note.frontmatterRaw + note.content,
      data: {
        id,
        category: id.split("/")[0],
        path,
        frontmatter: note.frontmatter,
        content: note.content,
        sha256: note.sha256,
        mtime: note.mtime,
      },
    };
  };
  if (opts.json) {
    await runJson(() => show().data);
    return;
  }
  await runHumanLogged(() => {
    const raw = show().raw;
    // On a terminal, drop control characters (ESC, C1…), a lone CR and bidi
    // overrides so a note cannot drive or disguise the terminal; keep tab and
    // newlines. Pipes still get the exact bytes.
    process.stdout.write(
      process.stdout.isTTY
        ? raw.replace(
            /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]|\r(?!\n)/g,
            "",
          )
        : raw,
    );
  });
}

export async function memoryEditCommand(
  id: string,
  opts: ProjectFlags & { stdin?: boolean; ifMatch?: string } = {},
): Promise<void> {
  const edit = async () => {
    const root = useProjectDir(opts.projectDir) ?? process.cwd();
    if (!opts.stdin) {
      throw new CliError(
        "INVALID_ARGS",
        "--stdin is required: pipe the new body on stdin",
      );
    }
    if (!opts.ifMatch) {
      throw new CliError(
        "INVALID_ARGS",
        "--if-match <sha256> is required (from `cf memory show`)",
      );
    }
    const memoryDir = getMemoryDir();
    const path = resolveNotePath(memoryDir, id);
    const body = await readBodyFromStdin();
    // A broken pipe sends nothing: never let it wipe a note.
    if (body.trim() === "") throw new CliError("INVALID_VALUE", "empty body");
    const { sha256, updated } = replaceBody(path, body, opts.ifMatch);
    const index = await memoryIndexState(memoryDir);
    return { root, data: { id, path, sha256, updated, index } };
  };
  if (opts.json) {
    await runJson(async () => (await edit()).data);
    return;
  }
  await runHumanLogged(async () => {
    const { root, data } = await edit();
    log.success(`Updated ${data.id} (${data.path})`);
    printIndexHint(data.index, root);
  });
}

export async function memoryDeleteCommand(
  id: string,
  opts: ProjectFlags & { yes?: boolean; ifMatch?: string } = {},
): Promise<void> {
  const del = async () => {
    const root = useProjectDir(opts.projectDir) ?? process.cwd();
    const memoryDir = getMemoryDir();
    const path = resolveNotePath(memoryDir, id);
    if (!opts.yes) {
      if (opts.json) {
        throw new CliError(
          "INTERACTIVE_REQUIRED",
          "Deleting a memory in JSON mode needs --yes",
        );
      }
      const ok = await confirm({
        message: `Delete memory ${id}?`,
        default: false,
      });
      if (!ok) return null;
    }
    deleteNote(path, opts.ifMatch);
    const { files, warnings } = removeRuleEntry(memoryDir, id);
    const index = await memoryIndexState(memoryDir);
    return {
      root,
      data: {
        id,
        path,
        deleted: true as const,
        index,
        instructionFiles: files,
        warnings,
      },
    };
  };
  if (opts.json) {
    await runJson(async () => (await del())?.data);
    return;
  }
  await runHumanLogged(async () => {
    const res = await del();
    if (!res) {
      log.info("Cancelled.");
      return;
    }
    const { root, data } = res;
    log.success(`Deleted ${data.id} (${data.path})`);
    for (const f of data.instructionFiles) {
      log.info(`Removed its entry from ${f}`);
    }
    for (const w of data.warnings) log.warn(w);
    printIndexHint(data.index, root);
  });
}

export async function memoryStartDaemonCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  const { isDaemonRunning, getDaemonInfo, spawnDaemon } = await import(
    join(mcpDir, "dist/daemon/process.js")
  );

  if (await isDaemonRunning()) {
    const info = getDaemonInfo();
    log.info(`Daemon already running (PID ${info?.pid})`);
    return;
  }

  log.step("Starting memory daemon...");

  const config = loadConfig();
  const embedding = config.memory?.embedding;
  const result = await spawnDaemon(memoryDir, embedding, {});

  if (result) {
    log.success(`Daemon started (PID ${result.pid})`);
    log.info(`Watching ${chalk.cyan(memoryDir)} for changes`);
  } else {
    log.error("Daemon did not start within 3 seconds");
    process.exit(1);
  }
}

export async function memoryStopDaemonCommand(): Promise<void> {
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  const { stopDaemon, isDaemonRunning } = await import(
    join(mcpDir, "dist/daemon/process.js")
  );

  if (!(await isDaemonRunning())) {
    log.info("Daemon is not running.");
    return;
  }

  log.step("Stopping memory daemon...");
  const stopped = await stopDaemon();

  if (stopped) {
    log.success("Daemon stopped.");
  } else {
    log.error("Failed to stop daemon.");
  }
}

export async function memoryRebuildCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  // Try direct rebuild for Tier 1 (SQLite)
  const { areSqliteDepsAvailable } = await import(
    join(mcpDir, "dist/lib/lazy-install.js")
  );

  if (areSqliteDepsAvailable()) {
    log.step("Rebuilding SQLite index + embeddings...");

    const { SqliteBackend } = await import(
      join(mcpDir, "dist/backends/sqlite/index.js")
    );

    // Pass embedding config from config.json
    const config = loadConfig();
    const embedding = config.memory?.embedding;
    const opts = embedding ? { embedding, skipVec: false } : { skipVec: false };

    const runRebuild = async () => {
      const backend = new SqliteBackend(memoryDir, opts);
      try {
        await backend.rebuild();
        const stats = await backend.stats();
        log.success(`Rebuilt: ${stats.total} memories indexed.`);

        if (backend.isVecEnabled()) {
          log.info(`Vector search: ${chalk.green("enabled")}`);
        }
        if (!backend.isRebuildNeeded()) {
          log.info("Embedding dimensions: up to date");
        }
      } finally {
        await backend.close();
      }
    };

    try {
      await runRebuild();
    } catch (err) {
      const isCorrupt =
        err instanceof Error &&
        (err.message.includes("database disk image is malformed") ||
          (err as NodeJS.ErrnoException & { code?: string }).code ===
            "SQLITE_CORRUPT" ||
          (err as NodeJS.ErrnoException & { code?: string }).code ===
            "SQLITE_IOERR_SHORT_READ");

      if (isCorrupt) {
        const dbPath = getDbPath(memoryDir);
        if (dbPath) {
          log.warn("SQLite database is corrupt. Deleting and recreating...");
          // Remove WAL-mode companion files to prevent I/O errors on reopen
          for (const suffix of ["", "-shm", "-wal"]) {
            rmSync(dbPath + suffix, { force: true });
          }
        }
        // DB already absent or deleted above — proceed with fresh rebuild
        await runRebuild();
      } else {
        throw err;
      }
    }
    return;
  }

  // Fall back to daemon rebuild
  const { isDaemonRunning, getDaemonPaths } = await import(
    join(mcpDir, "dist/daemon/process.js")
  );

  if (!(await isDaemonRunning())) {
    log.info("No SQLite deps and daemon not running. Nothing to rebuild.");
    log.dim("Install Tier 1 deps: cf memory init");
    log.dim("Or start the daemon: cf memory start-daemon");
    return;
  }

  const { DaemonClient } = await import(
    join(mcpDir, "dist/lib/daemon-client.js")
  );

  const paths = getDaemonPaths();
  const client = new DaemonClient(paths.socketPath);

  log.step("Rebuilding search index via daemon...");
  try {
    await client.rebuild();
    log.success("Index rebuilt.");
  } catch {
    log.error("Rebuild failed or not supported.");
  }
}

function getDbPath(memoryDir: string): string | null {
  try {
    // Compute the same path SqliteBackend would use
    const resolved = resolve(memoryDir).replace(/\/+$/, "");
    const stripped = resolved
      .replace(/\/docs\/memory$/, "")
      .replace(/\/memory$/, "");
    const id = stripped.replace(/\//g, "-");
    const home = homedir();
    const dbPath = join(
      home,
      ".coding-friend",
      "memory",
      "projects",
      id,
      "db.sqlite",
    );
    return existsSync(dbPath) ? dbPath : null;
  } catch {
    return null;
  }
}

/**
 * Check if SQLite deps are installed; if not, install them.
 * Returns true if deps are available after the check, false on failure.
 */
async function ensureSqliteDepsIfNeeded(mcpDir: string): Promise<boolean> {
  const config = loadConfig();
  const tier = config.memory?.tier ?? "auto";

  // Only Tier 1 (full/auto) needs SQLite deps
  if (tier === "markdown" || tier === "lite") return true;

  const { ensureDeps, areSqliteDepsAvailable } = await import(
    join(mcpDir, "dist/lib/lazy-install.js")
  );

  if (areSqliteDepsAvailable()) return true;

  log.step("Installing SQLite dependencies...");
  const installed = await ensureDeps({
    onProgress: (msg: string) => log.step(msg),
  });

  if (!installed) {
    log.error("Failed to install SQLite dependencies.");
    log.dim(
      "Ensure you have a C++ compiler installed (Xcode CLT on macOS, build-essential on Linux).",
    );
    log.dim(
      'Memory will fall back to a lower tier. You can retry later with "cf memory init".',
    );
    return false;
  }

  log.success("Dependencies installed.");
  return true;
}

/**
 * Check whether the memory system has been initialized.
 * Returns true when the user has gone through cf memory init (or the
 * equivalent wizard inside cf init) — i.e. tier is explicitly set in config
 * OR the SQLite DB already exists.
 */
export function isMemoryInitialized(): boolean {
  const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
  const localCfg = readJson<CodingFriendConfig>(localConfigPath());
  const globalTier = (globalCfg?.memory as Record<string, unknown> | undefined)
    ?.tier;
  const localTier = (localCfg?.memory as Record<string, unknown> | undefined)
    ?.tier;
  if (globalTier !== undefined || localTier !== undefined) return true;

  const memoryDir = getMemoryDir();
  return getDbPath(memoryDir) !== null;
}

/**
 * Core memory init wizard — applies smart defaults (inheriting from global
 * config where set), installs deps, imports existing memories, and sets up
 * MCP. Called by both `cf memory init` and the CF Memory step inside `cf init`.
 */
export async function memoryInitWizard(
  memoryDir: string,
  mcpDir: string,
): Promise<void> {
  const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
  const globalMem = (globalCfg?.memory ?? {}) as Record<string, unknown>;

  // Resolve each setting: inherit from global config, else use smart default
  const tier = (globalMem.tier as string | undefined) ?? "auto";
  const embedding =
    (globalMem.embedding as Record<string, unknown> | undefined) ??
    ({ provider: "transformers" } as Record<string, unknown>);
  const autoCapture = (globalMem.autoCapture as boolean | undefined) ?? true;
  const autoStart = (globalMem.autoStart as boolean | undefined) ?? true;

  // Field-level merge to preserve existing memory settings (e.g. daemonTimeout)
  const existingLocalCfg = readJson<CodingFriendConfig>(localConfigPath());
  const existingMem = (existingLocalCfg?.memory ?? {}) as Record<
    string,
    unknown
  >;
  mergeJson(localConfigPath(), {
    memory: { ...existingMem, tier, embedding, autoCapture, autoStart },
  });

  // Print what was set with explanation for each option
  const inherited = chalk.dim("← global config");
  const defaulted = chalk.dim("← default");
  const src = (field: unknown) => (field !== undefined ? inherited : defaulted);

  console.log();
  log.info(`Search tier: ${chalk.cyan(String(tier))}  ${src(globalMem.tier)}`);
  log.dim(
    "  Auto-detects best backend: SQLite (Tier 1) → MiniSearch daemon (Tier 2) → Grep (Tier 3).",
  );
  log.info(
    `Embedding: ${chalk.cyan(String(embedding.provider ?? "transformers"))}  ${src(globalMem.embedding)}`,
  );
  log.dim(
    "  Powers semantic search in Tier 1. Runs locally, no external service needed.",
  );
  log.info(
    `Auto-capture: ${autoCapture ? chalk.green("on") : chalk.dim("off")}  ${src(globalMem.autoCapture)}`,
  );
  log.dim(
    "  Saves session summaries to memory when Claude Code compacts context.",
  );
  log.info(
    `Auto-start daemon: ${autoStart ? chalk.green("on") : chalk.dim("off")}  ${src(globalMem.autoStart)}`,
  );
  log.dim(
    "  Background process watches docs/memory/ and auto-rebuilds the search index on file changes.",
  );
  console.log();

  // Install deps and import existing memories
  const config = loadConfig();
  const resolvedTier = config.memory?.tier ?? "auto";

  if (resolvedTier === "markdown") {
    await setupMemoryMcp();
    console.log('🎉 Memory initialized! Run "cf memory status" to verify.');
    printInitDone();
    return;
  }

  if (resolvedTier === "lite") {
    await setupMemoryMcp();
    console.log('🎉 Memory initialized! Run "cf memory status" to verify.');
    printInitDone();
    return;
  }

  // Tier 1 (full or auto): install SQLite deps
  const depsOk = await ensureSqliteDepsIfNeeded(mcpDir);
  if (!depsOk) return;

  // Import existing memories
  if (!existsSync(memoryDir)) {
    await setupMemoryMcp();
    console.log('🎉 Memory initialized! Run "cf memory status" to verify.');
    printInitDone();
    return;
  }

  const docCount = countMdFiles(memoryDir);
  if (docCount === 0) {
    log.info("No existing memories to import.");
    await setupMemoryMcp();
    console.log('🎉 Memory initialized! Run "cf memory status" to verify.');
    printInitDone();
    return;
  }

  log.step(`Importing ${docCount} existing memories into SQLite...`);

  const { SqliteBackend } = await import(
    join(mcpDir, "dist/backends/sqlite/index.js")
  );

  const configEmbedding = config.memory?.embedding;
  const backend = new SqliteBackend(memoryDir, {
    skipVec: false,
    ...(configEmbedding && { embedding: configEmbedding }),
  });

  try {
    await backend.rebuild();
    const stats = await backend.stats();
    log.success(`Imported ${stats.total} memories. DB: ${backend.getDbPath()}`);
    log.info(
      `Vector search: ${backend.isVecEnabled() ? chalk.green("enabled") : chalk.dim("disabled (sqlite-vec not available)")}`,
    );
  } finally {
    await backend.close();
  }

  await setupMemoryMcp();

  console.log();
  console.log('🎉 Memory initialized! Run "cf memory status" to verify.');
  log.info(
    `Tip: Run ${chalk.cyan("/cf-scan")} in Claude Code to populate memory with project knowledge.`,
  );
  log.dim(`  Change settings anytime: ${chalk.cyan("cf memory config")}`);
  log.dim(
    `  Documentation: ${chalk.cyan("https://cf.dinhanhthi.com/#memory")}`,
  );
}

function printInitDone(): void {
  log.dim(`  Change settings anytime: ${chalk.cyan("cf memory config")}`);
  log.dim(
    `  Documentation: ${chalk.cyan("https://cf.dinhanhthi.com/#memory")}`,
  );
}

async function setupMemoryMcp(): Promise<void> {
  if (isMemoryMcpRegistered()) {
    log.info("coding-friend-memory: already registered (user scope)");
    return;
  }
  registerMemoryMcp();
  log.success(
    "Registered coding-friend-memory (user scope). Restart Claude Code to activate.",
  );
}

export async function memoryInitCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  const dbExists = getDbPath(memoryDir) !== null;

  if (dbExists) {
    // Re-run: show config menu (like `cf init` returning users flow)
    console.log();
    log.info(
      "Memory already initialized. Opening config menu to adjust settings.",
    );
    log.dim('To re-import memories, run "cf memory rebuild".');
    console.log();
    await memoryConfigMenu({ exitLabel: "Done" });

    // Ensure SQLite deps are present even for returning users (they may have
    // been lost, e.g. after a reinstall or on a new machine syncing configs).
    await ensureSqliteDepsIfNeeded(mcpDir);
    return;
  }

  // First-time: step-by-step wizard
  console.log();
  printBanner("🧠 CF Memory Setup");
  console.log();

  await memoryInitWizard(memoryDir, mcpDir);
}

export async function memoryConfigCommand(): Promise<void> {
  console.log();
  printBanner("🧠 Memory Config");
  console.log();

  showConfigHint();

  await memoryConfigMenu({ exitLabel: "Done" });
}

// ─── Helpers for list --projects / rm ──────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(raw: string): string {
  // If already "YYYY-MM-DD HH:MM", return as-is
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) return raw;
  // If date-only "YYYY-MM-DD", return without fake time
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Otherwise try to parse and normalize
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** JSON twin of memoryListProjectsCommand — same source_dir backfill, sorted by size. */
async function listMemoryProjects(): Promise<ProjectInfo[]> {
  const baseDir = getProjectsBaseDir();
  const mcpDir = getLibPath("cf-memory");
  requireMemoryBuilt(mcpDir);
  if (!existsSync(baseDir)) return [];

  const dirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
  if (dirs.length === 0) return [];

  const currentMemoryDir = resolve(getMemoryDir());
  const { projectId } = await import(
    join(mcpDir, "dist/backends/sqlite/index.js")
  );
  const currentProjectId = projectId(currentMemoryDir);

  return dirs
    .map((id) =>
      getProjectInfo(
        join(baseDir, id),
        id,
        mcpDir,
        id === currentProjectId ? currentMemoryDir : undefined,
      ),
    )
    .sort((a, b) => b.size - a.size);
}

async function memoryListProjectsCommand(): Promise<void> {
  const baseDir = getProjectsBaseDir();
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  if (!existsSync(baseDir)) {
    log.info("No memory projects found.");
    log.dim('Run "cf memory init" in a project to create one.');
    return;
  }

  const dirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  if (dirs.length === 0) {
    log.info("No memory projects found.");
    return;
  }

  // Encode current project's memoryDir to match project directory name
  const currentMemoryDir = resolve(getMemoryDir());
  const { projectId } = await import(
    join(mcpDir, "dist/backends/sqlite/index.js")
  );
  const currentProjectId = projectId(currentMemoryDir);

  log.step(`Scanning ${dirs.length} project(s)...\n`);

  const projects: ProjectInfo[] = [];
  for (const id of dirs) {
    // If this project matches the current directory, pass the path for backfill
    const knownDir = id === currentProjectId ? currentMemoryDir : undefined;
    projects.push(getProjectInfo(join(baseDir, id), id, mcpDir, knownDir));
  }

  // Sort by size descending
  projects.sort((a, b) => b.size - a.size);

  const totalSize = projects.reduce((sum, p) => sum + p.size, 0);
  const idxW = String(projects.length).length;

  // Header
  const header = `${"#".padStart(idxW)}  ${"SIZE".padStart(10)}  ${"MEMS".padStart(4)}  ${"PROJECT ID".padEnd(12)}  ${"UPDATED".padEnd(16)}  PATH`;
  console.log(chalk.bold(header));
  console.log(chalk.dim("-".repeat(header.length + 10)));

  projects.forEach((p, i) => {
    const idx = chalk.dim(String(i + 1).padStart(idxW));
    const sizeStr = chalk.yellow(formatSize(p.size).padStart(10));
    const memCount = chalk.green(String(p.memories).padStart(4));
    const idStr = chalk.cyan(p.id.padEnd(12));
    const dateStr = p.lastUpdated
      ? formatDate(p.lastUpdated).padEnd(16)
      : chalk.dim("n/a".padEnd(16));
    const pathStr = p.sourceDir
      ? chalk.dim(p.sourceDir)
      : chalk.dim("(unknown)");

    console.log(
      `${idx}  ${sizeStr}  ${memCount}  ${idStr}  ${dateStr}  ${pathStr}`,
    );
  });

  console.log();
  console.log(
    chalk.bold(
      `Total: ${projects.length} project(s), ${formatSize(totalSize)}`,
    ),
  );
  console.log();
}

export async function memoryRmCommand(opts: {
  projectId?: string;
  all?: boolean;
  prune?: boolean;
}): Promise<void> {
  const baseDir = getProjectsBaseDir();

  if (!existsSync(baseDir)) {
    log.info("No memory projects found. Nothing to remove.");
    return;
  }

  if (opts.prune) {
    const mcpDir = getLibPath("cf-memory");
    ensureMemoryBuilt(mcpDir);

    const dirs = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);

    const orphaned: { id: string; reason: string; size: number }[] = [];
    for (const id of dirs) {
      const projectDir = join(baseDir, id);
      const info = getProjectInfo(projectDir, id, mcpDir);

      if (info.sourceDir && !existsSync(info.sourceDir)) {
        orphaned.push({
          id,
          reason: `source dir missing: ${info.sourceDir}`,
          size: info.size,
        });
      } else if (info.memories === 0) {
        orphaned.push({
          id,
          reason: info.sourceDir
            ? `0 memories (${info.sourceDir})`
            : "unknown path, 0 memories",
          size: info.size,
        });
      }
    }

    if (orphaned.length === 0) {
      log.success("No orphaned projects found.");
      return;
    }

    const totalSize = orphaned.reduce((sum, o) => sum + o.size, 0);
    log.warn(
      `Found ${orphaned.length} orphaned project(s) (${formatSize(totalSize)}):`,
    );
    console.log();
    for (const o of orphaned) {
      console.log(`  ${chalk.cyan(o.id)}  ${chalk.dim(o.reason)}`);
    }
    console.log();

    const ok = await confirm({
      message: `Delete ${orphaned.length} orphaned project(s)?`,
      default: false,
    });

    if (!ok) {
      log.info("Cancelled.");
      return;
    }

    for (const o of orphaned) {
      rmSync(join(baseDir, o.id), { recursive: true, force: true });
    }
    log.success(
      `Deleted ${orphaned.length} orphaned project(s) (${formatSize(totalSize)}).`,
    );
    return;
  }

  if (opts.all) {
    const dirs = readdirSync(baseDir, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && !d.name.startsWith("."),
    );

    if (dirs.length === 0) {
      log.info("No memory projects found. Nothing to remove.");
      return;
    }

    const totalSize = dirs.reduce(
      (sum, d) => sum + dirSize(join(baseDir, d.name)),
      0,
    );

    log.warn(
      `This will delete ALL ${dirs.length} project database(s) (${formatSize(totalSize)}).`,
    );
    log.warn("Markdown source files in docs/memory/ will NOT be affected.");
    console.log();

    const ok = await confirm({
      message: "Are you sure you want to delete all memory databases?",
      default: false,
    });

    if (!ok) {
      log.info("Cancelled.");
      return;
    }

    for (const d of dirs) {
      rmSync(join(baseDir, d.name), { recursive: true, force: true });
    }
    log.success(`Deleted ${dirs.length} project database(s).`);
    return;
  }

  if (opts.projectId) {
    const projectDir = join(baseDir, opts.projectId);

    // Prevent path traversal (e.g. --project-id "../../..")
    const resolved = resolve(projectDir);
    if (!resolved.startsWith(resolve(baseDir) + sep)) {
      log.error("Invalid project ID.");
      process.exit(1);
    }

    if (!existsSync(projectDir)) {
      log.error(`Project "${opts.projectId}" not found.`);
      log.dim('Run "cf memory list --projects" to see available projects.');
      process.exit(1);
    }

    const size = dirSize(projectDir);
    log.warn(
      `This will delete project "${opts.projectId}" (${formatSize(size)}).`,
    );
    log.warn("Markdown source files in docs/memory/ will NOT be affected.");
    console.log();

    const ok = await confirm({
      message: `Delete project ${opts.projectId}?`,
      default: false,
    });

    if (!ok) {
      log.info("Cancelled.");
      return;
    }

    rmSync(projectDir, { recursive: true, force: true });
    log.success(`Deleted project "${opts.projectId}".`);
    return;
  }

  log.error("Specify --project-id <id>, --all, or --prune.");
  log.dim('Run "cf memory list --projects" to see available projects.');
  process.exit(1);
}

export async function memoryMcpCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  warnStaleMcpJson();

  printMemoryMcpConfig(memoryDir);

  const localMcpPath = join(process.cwd(), ".mcp.json");
  const memoryDistPath = join(mcpDir, "dist", "index.js");

  let isDaemonRunning: () => Promise<boolean> = async () => false;
  try {
    const proc = await import(join(mcpDir, "dist/daemon/process.js"));
    isDaemonRunning = proc.isDaemonRunning;
  } catch {
    // cf-memory not built yet — daemon check will report stopped (warn)
  }

  const memoryHealth = await checkMemoryMcpHealth({
    readMcpJson: () => readJson<Record<string, unknown>>(localMcpPath),
    pathExists: existsSync,
    isDaemonRunning,
    memoryDistPath,
  });
  printHealthSection(memoryHealth);
}
