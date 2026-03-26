import { existsSync, readdirSync, statSync, rmSync } from "fs";
import { join, resolve, sep } from "path";
import { homedir } from "os";

import { confirm } from "@inquirer/prompts";
import { resolveMemoryDir, loadConfig } from "../lib/config.js";
import { run, runWithStderr } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
import {
  memoryConfigMenu,
  editMemoryTier,
  editMemoryAutoCapture,
  editMemoryAutoStart,
  editMemoryEmbedding,
  editMemoryDaemonTimeout,
  getMemoryMcpStatus,
  writeMemoryMcpEntry,
} from "../lib/memory-prompts.js";
import { readJson } from "../lib/json.js";
import { globalConfigPath, localConfigPath } from "../lib/paths.js";
import { showConfigHint } from "../lib/prompt-utils.js";
import type { CodingFriendConfig } from "../types.js";
import chalk from "chalk";

function countMdFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countMdFiles(join(dir, entry.name));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      count++;
    }
  }
  return count;
}

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

export function ensureMemoryBuilt(mcpDir: string): void {
  if (!existsSync(join(mcpDir, "node_modules"))) {
    log.step("Installing memory server dependencies (one-time setup)...");
    const result = runWithStderr("npm", ["install"], { cwd: mcpDir });
    if (result.exitCode !== 0) {
      log.error("Failed to install dependencies");
      if (result.stderr) log.error(truncateError(result.stderr));
      process.exit(1);
    }
    log.success("Done.");
  }

  if (!existsSync(join(mcpDir, "dist"))) {
    log.step("Building memory server...");
    const result = runWithStderr("npm", ["run", "build"], { cwd: mcpDir });
    if (result.exitCode !== 0) {
      log.error("Failed to build memory server");
      if (result.stderr) log.error(truncateError(result.stderr));
      process.exit(1);
    }
    log.success("Done.");
  }
}

export function printMemoryMcpConfig(
  serverPath: string,
  memoryDir: string,
): void {
  console.log(chalk.dim("Add this to your MCP client config:"));
  console.log();

  console.log(
    chalk.yellow.bold("--- Claude Code (.mcp.json in project root) ---"),
  );
  console.log(`
{
  "mcpServers": {
    "coding-friend-memory": {
      "command": "node",
      "args": ["${serverPath}", "${memoryDir}"]
    }
  }
}`);
  console.log();

  console.log(
    chalk.yellow.bold(
      "--- Claude Desktop / Claude Chat (claude_desktop_config.json) ---",
    ),
  );
  console.log(`
{
  "mcpServers": {
    "coding-friend-memory": {
      "command": "node",
      "args": ["${serverPath}", "${memoryDir}"]
    }
  }
}`);
  console.log();

  console.log(chalk.yellow.bold("--- Generic MCP client ---"));
  console.log(`
Server command: node ${serverPath} ${memoryDir}
Transport: stdio`);
  console.log();

  console.log(chalk.yellow.bold("--- Available tools ---"));
  console.log();
  console.log(
    `  ${chalk.white("memory_store")}       ${chalk.dim("Store a new memory")}`,
  );
  console.log(
    `  ${chalk.white("memory_search")}      ${chalk.dim("Search memories (keyword match)")}`,
  );
  console.log(
    `  ${chalk.white("memory_retrieve")}    ${chalk.dim("Get a specific memory by ID")}`,
  );
  console.log(
    `  ${chalk.white("memory_list")}        ${chalk.dim("List memories with filtering")}`,
  );
  console.log(
    `  ${chalk.white("memory_update")}      ${chalk.dim("Update existing memory")}`,
  );
  console.log(
    `  ${chalk.white("memory_delete")}      ${chalk.dim("Delete a memory")}`,
  );
  console.log();

  console.log(chalk.yellow.bold("--- Resources ---"));
  console.log();
  console.log(
    `  ${chalk.white("memory://index")}     ${chalk.dim("Browse all memories")}`,
  );
  console.log(
    `  ${chalk.white("memory://stats")}     ${chalk.dim("Storage statistics")}`,
  );
  console.log();
  log.warn(
    "Note: The memory path is project-specific. Use local .mcp.json (per project), not global ~/.claude/.mcp.json.",
  );
  console.log();
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

export async function memoryStatusCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const docCount = countMdFiles(memoryDir);
  const mcpDir = getLibPath("cf-memory");
  ensureMemoryBuilt(mcpDir);

  // Dynamically import modules to check status
  const { isDaemonRunning, getDaemonInfo } = await import(
    join(mcpDir, "dist/daemon/process.js")
  );
  const { areSqliteDepsAvailable } = await import(
    join(mcpDir, "dist/lib/lazy-install.js")
  );

  const sqliteAvailable = areSqliteDepsAvailable();
  const running = await isDaemonRunning();
  const daemonInfo = getDaemonInfo();

  let tierLabel: string;
  if (sqliteAvailable) {
    tierLabel = chalk.cyan("Tier 1 (SQLite + Hybrid)");
  } else if (running) {
    tierLabel = chalk.cyan("Tier 2 (MiniSearch + Daemon)");
  } else {
    tierLabel = chalk.cyan("Tier 3 (Markdown)");
  }

  printBanner("🧠 Coding Friend Memory");
  console.log();
  log.info(`Tier: ${tierLabel}`);
  log.info(`Memory dir: ${chalk.cyan(memoryDir)}`);
  log.info(`Memories in this dir: ${chalk.green(String(docCount))}`);

  if (running && daemonInfo) {
    const uptime = (Date.now() - daemonInfo.startedAt) / 1000;
    log.info(
      `Daemon: ${chalk.green("running")} (PID ${daemonInfo.pid}, uptime ${formatUptime(uptime)}) ${chalk.dim('Turn it off by "cf memory stop-daemon"')}`,
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

  const config = loadConfig();
  const embeddingConfig = config.memory?.embedding;
  if (embeddingConfig?.provider || embeddingConfig?.model) {
    const provider = embeddingConfig.provider ?? "transformers";
    const model =
      embeddingConfig.model ??
      (provider === "ollama" ? "all-minilm:l6-v2" : "Xenova/all-MiniLM-L6-v2");
    log.info(`Embedding: ${chalk.cyan(model)} ${chalk.dim(`(${provider})`)}`);
  }

  // MCP status
  const mcpStatus = getMemoryMcpStatus();
  if (mcpStatus.configured && mcpStatus.scope === "local") {
    log.info(
      `MCP: ${chalk.green("configured")} ${chalk.dim("(local .mcp.json)")}`,
    );
  } else if (mcpStatus.configured && mcpStatus.scope === "global") {
    log.info(
      `MCP: ${chalk.green("configured")} ${chalk.dim("(global ~/.claude/.mcp.json)")} ${chalk.yellow("⚠ global config uses a fixed path — only works for one project")}`,
    );
  } else {
    log.info(
      `MCP: ${chalk.dim("not configured")} ${chalk.dim('(run "cf memory init" or add manually via "cf memory mcp")')}`,
    );
  }

  const autoCapture = config.memory?.autoCapture ?? false;
  log.info(
    `Auto-capture: ${autoCapture ? chalk.green("on") : chalk.dim("off")}`,
  );

  if (existsSync(memoryDir)) {
    const categories = readdirSync(memoryDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => {
        const catCount = countMdFiles(join(memoryDir, d.name));
        return `${d.name} (${catCount})`;
      })
      .filter((s) => !s.endsWith("(0)"));

    if (categories.length > 0) {
      log.info(`Categories: ${chalk.dim(categories.join(", "))}`);
    }
  }
  console.log();
  log.dim(`Docs: https://cf.dinhanhthi.com/docs/reference/memory-system/`);
  console.log();
}

export async function memorySearchCommand(query: string): Promise<void> {
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
      import { MarkdownBackend } from "${join(mcpDir, "dist/backends/markdown.js")}";
      const backend = new MarkdownBackend("${memoryDir}");
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

export async function memoryListCommand(opts: {
  projects?: boolean;
}): Promise<void> {
  if (opts.projects) {
    return memoryListProjectsCommand();
  }

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
      import { MarkdownBackend } from "${join(mcpDir, "dist/backends/markdown.js")}";
      const backend = new MarkdownBackend("${memoryDir}");
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
  const idleTimeoutMs = config.memory?.daemon?.idleTimeout;
  const result = await spawnDaemon(memoryDir, embedding, { idleTimeoutMs });

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
 * Core memory init wizard — runs steps 1-5, installs deps, imports
 * existing memories, and sets up MCP.  Called by both `cf memory init`
 * and the CF Memory step inside `cf init`.
 */
export async function memoryInitWizard(
  memoryDir: string,
  mcpDir: string,
): Promise<void> {
  // Step 1: Tier
  log.step("Step 1/5: Search tier");
  await editMemoryTier(
    readJson<CodingFriendConfig>(globalConfigPath()),
    readJson<CodingFriendConfig>(localConfigPath()),
  );
  console.log();

  // Step 2: Embedding
  log.step("Step 2/5: Embedding provider");
  await editMemoryEmbedding(
    readJson<CodingFriendConfig>(globalConfigPath()),
    readJson<CodingFriendConfig>(localConfigPath()),
  );
  console.log();

  // Step 3: Auto-capture
  log.step("Step 3/5: Auto-capture");
  await editMemoryAutoCapture(
    readJson<CodingFriendConfig>(globalConfigPath()),
    readJson<CodingFriendConfig>(localConfigPath()),
  );
  console.log();

  // Step 4: Auto-start daemon
  log.step("Step 4/5: Auto-start daemon");
  await editMemoryAutoStart(
    readJson<CodingFriendConfig>(globalConfigPath()),
    readJson<CodingFriendConfig>(localConfigPath()),
  );
  console.log();

  // Step 5: Daemon timeout
  log.step("Step 5/5: Daemon idle timeout");
  await editMemoryDaemonTimeout(
    readJson<CodingFriendConfig>(globalConfigPath()),
    readJson<CodingFriendConfig>(localConfigPath()),
  );
  console.log();

  // Install deps and import
  const config = loadConfig();
  const tier = config.memory?.tier ?? "auto";

  if (tier === "markdown") {
    await setupMemoryMcp(memoryDir, mcpDir);
    log.success(
      'Memory initialized with Tier 3 (markdown). Run "cf memory status" to verify.',
    );
    return;
  }

  if (tier === "lite") {
    await setupMemoryMcp(memoryDir, mcpDir);
    log.success(
      'Memory initialized. Run "cf memory start-daemon" to enable Tier 2 search.',
    );
    return;
  }

  // Tier 1 (full or auto): install SQLite deps
  const depsOk = await ensureSqliteDepsIfNeeded(mcpDir);
  if (!depsOk) return;

  // Import existing memories
  if (!existsSync(memoryDir)) {
    log.info(
      "No memory directory found. Memories will be indexed as they're created.",
    );
    await setupMemoryMcp(memoryDir, mcpDir);
    log.success('Memory initialized. Run "cf memory status" to verify.');
    return;
  }

  const docCount = countMdFiles(memoryDir);
  if (docCount === 0) {
    log.info("No existing memories to import.");
    await setupMemoryMcp(memoryDir, mcpDir);
    log.success('Memory initialized. Run "cf memory status" to verify.');
    return;
  }

  log.step(`Importing ${docCount} existing memories into SQLite...`);

  const { SqliteBackend } = await import(
    join(mcpDir, "dist/backends/sqlite/index.js")
  );

  const embedding = config.memory?.embedding;
  const backend = new SqliteBackend(memoryDir, {
    skipVec: false,
    ...(embedding && { embedding }),
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

  // Configure MCP
  await setupMemoryMcp(memoryDir, mcpDir);

  console.log();
  log.success('Memory initialized! Run "cf memory status" to verify.');
  log.info(
    `Tip: Run ${chalk.cyan("/cf-scan")} in Claude Code to populate memory with project knowledge.`,
  );
}

async function setupMemoryMcp(
  memoryDir: string,
  mcpDir: string,
): Promise<void> {
  const mcpStatus = getMemoryMcpStatus();
  if (mcpStatus.configured && mcpStatus.scope === "local") {
    log.info(`MCP: ${chalk.green("already configured")} in .mcp.json`);
    return;
  }

  console.log();
  log.step("MCP setup");
  log.dim(
    "The Memory MCP connects Claude Code to the memory system so skills can store and search memories.",
  );

  const addMcp = await confirm({
    message: "Add coding-friend-memory to .mcp.json?",
    default: true,
  });

  if (!addMcp) {
    log.dim('Skipped. Run "cf memory mcp" anytime to get the config.');
    return;
  }

  const serverPath = join(mcpDir, "dist", "index.js");
  if (!existsSync(serverPath)) {
    log.warn(
      "cf-memory not built yet. Run `cf memory mcp` after building to get the config.",
    );
    return;
  }

  writeMemoryMcpEntry(serverPath, memoryDir);
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
  printBanner("🧠 Memory Setup");
  console.log();

  showConfigHint();

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

function getProjectsBaseDir(): string {
  const home = homedir();
  return join(home, ".coding-friend", "memory", "projects");
}

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

function dirSize(dir: string): number {
  let total = 0;
  if (!existsSync(dir)) return 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isFile()) {
      total += statSync(p).size;
    } else if (entry.isDirectory()) {
      total += dirSize(p);
    }
  }
  return total;
}

interface ProjectInfo {
  id: string;
  sourceDir: string | null;
  memories: number;
  size: number;
  lastUpdated: string | null;
}

function getProjectInfo(
  projectDir: string,
  projectId: string,
  mcpDir: string,
  knownSourceDir?: string,
): ProjectInfo {
  const dbPath = join(projectDir, "db.sqlite");
  const size = dirSize(projectDir);
  const info: ProjectInfo = {
    id: projectId,
    sourceDir: null,
    memories: 0,
    size,
    lastUpdated: null,
  };

  if (!existsSync(dbPath)) return info;

  // Try to read metadata from SQLite
  // If knownSourceDir is provided and source_dir is missing, backfill it
  try {
    const backfillDir = knownSourceDir
      ? JSON.stringify(knownSourceDir)
      : "null";
    const result = run(
      "node",
      [
        "-e",
        `
        const path = require("path");
        const mod = require(path.join(${JSON.stringify(mcpDir)}, "dist/lib/lazy-install.js"));
        if (!mod.areSqliteDepsAvailable()) { console.log(JSON.stringify({})); process.exit(0); }
        const Database = require(mod.getDepsDir() + "/node_modules/better-sqlite3");
        const backfill = ${backfillDir};
        const db = new Database(${JSON.stringify(dbPath)}, { readonly: !backfill });
        const getMeta = (key) => { try { const r = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key); return r?.value ?? null; } catch { return null; } };
        let sourceDir = getMeta("source_dir");
        if (!sourceDir && backfill) {
          try { db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run("source_dir", backfill); sourceDir = backfill; } catch {}
        }
        const count = (() => { try { const r = db.prepare("SELECT COUNT(*) as c FROM memories").get(); return r?.c ?? 0; } catch { return 0; } })();
        const lastUpdated = (() => { try { const r = db.prepare("SELECT updated FROM memories ORDER BY updated DESC LIMIT 1").get(); return r?.updated ?? null; } catch { return null; } })();
        console.log(JSON.stringify({ sourceDir, memories: count, lastUpdated }));
        db.close();
        `,
      ],
      { cwd: projectDir },
    );
    if (result) {
      const parsed = JSON.parse(result.trim());
      info.sourceDir = parsed.sourceDir ?? null;
      info.memories = parsed.memories ?? 0;
      info.lastUpdated = parsed.lastUpdated ?? null;
    }
  } catch {
    // Ignore — will show defaults
  }

  return info;
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

  const serverPath = join(mcpDir, "dist", "index.js");
  printMemoryMcpConfig(serverPath, memoryDir);
}
