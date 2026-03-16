import { createHash } from "crypto";
import { existsSync, readdirSync, statSync, rmSync } from "fs";
import { join, resolve, sep } from "path";
import { homedir } from "os";
import { spawn } from "child_process";
import { confirm } from "@inquirer/prompts";
import { resolveMemoryDir, loadConfig } from "../lib/config.js";
import { run } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
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

function ensureBuilt(mcpDir: string): void {
  if (!existsSync(join(mcpDir, "node_modules"))) {
    log.step("Installing memory server dependencies (one-time setup)...");
    const result = run("npm", ["install", "--silent"], { cwd: mcpDir });
    if (result === null) {
      log.error("Failed to install dependencies");
      process.exit(1);
    }
    log.success("Done.");
  }

  if (!existsSync(join(mcpDir, "dist"))) {
    log.step("Building memory server...");
    const result = run("npm", ["run", "build", "--silent"], { cwd: mcpDir });
    if (result === null) {
      log.error("Failed to build memory server");
      process.exit(1);
    }
    log.success("Done.");
  }
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
  ensureBuilt(mcpDir);

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

  console.log("=== 🧠 Coding Friend Memory ===");
  console.log();
  log.info(`Tier: ${tierLabel}`);
  log.info(`Memory dir: ${chalk.cyan(memoryDir)}`);
  log.info(`Memories: ${chalk.green(String(docCount))}`);

  if (running && daemonInfo) {
    const uptime = (Date.now() - daemonInfo.startedAt) / 1000;
    log.info(
      `Daemon: ${chalk.green("running")} (PID ${daemonInfo.pid}, uptime ${formatUptime(uptime)})`,
    );
  } else if (sqliteAvailable) {
    log.info(
      `Daemon: ${chalk.dim("stopped")} ${chalk.dim("(not needed — Tier 1 uses SQLite directly)")}`,
    );
  } else {
    log.info(
      `Daemon: ${chalk.dim("stopped")} ${chalk.dim('(run "cf memory start" for Tier 2 search)')}`,
    );
  }

  if (sqliteAvailable) {
    log.info(`SQLite deps: ${chalk.green("installed")}`);
  } else {
    log.info(
      `SQLite deps: ${chalk.dim("not installed")} (run "cf memory init" to enable Tier 1)`,
    );
  }

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
  ensureBuilt(mcpDir);

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
      'Or run "cf init" to set up this project, then "/cf-onboard" in Claude Code.',
    );
    return;
  }

  const mcpDir = getLibPath("cf-memory");
  ensureBuilt(mcpDir);

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

export async function memoryStartCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureBuilt(mcpDir);

  const { isDaemonRunning, getDaemonInfo } = await import(
    join(mcpDir, "dist/daemon/process.js")
  );

  if (await isDaemonRunning()) {
    const info = getDaemonInfo();
    log.info(`Daemon already running (PID ${info?.pid})`);
    return;
  }

  const entryPath = join(mcpDir, "dist/daemon/entry.js");
  if (!existsSync(entryPath)) {
    log.error("Daemon entry point not found. Try rebuilding: npm run build");
    process.exit(1);
  }

  log.step("Starting memory daemon...");

  // Build daemon args with embedding config from config.json
  const args = [entryPath, memoryDir];
  const config = loadConfig();
  const embedding = config.memory?.embedding;
  if (embedding?.provider)
    args.push(`--embedding-provider=${embedding.provider}`);
  if (embedding?.model) args.push(`--embedding-model=${embedding.model}`);
  if (embedding?.ollamaUrl)
    args.push(`--embedding-ollama-url=${embedding.ollamaUrl}`);

  const child = spawn("node", args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  // Wait for daemon to be ready (max 5 seconds)
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await isDaemonRunning()) {
      const info = getDaemonInfo();
      log.success(`Daemon started (PID ${info?.pid})`);
      log.info(`Tier: ${chalk.cyan("Tier 2 (MiniSearch + Daemon)")}`);
      return;
    }
  }

  log.error("Daemon did not start within 5 seconds");
  process.exit(1);
}

export async function memoryStopCommand(): Promise<void> {
  const mcpDir = getLibPath("cf-memory");
  ensureBuilt(mcpDir);

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
  ensureBuilt(mcpDir);

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
    log.dim("Or start the daemon: cf memory start");
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

export async function memoryInitCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureBuilt(mcpDir);

  log.step("Initializing Tier 1 (SQLite + Hybrid Search)...");

  // Step 1: Install heavy dependencies
  const { ensureDeps, areSqliteDepsAvailable } = await import(
    join(mcpDir, "dist/lib/lazy-install.js")
  );

  if (areSqliteDepsAvailable()) {
    log.info("SQLite dependencies already installed.");
  } else {
    const installed = await ensureDeps({
      onProgress: (msg: string) => log.step(msg),
    });

    if (!installed) {
      log.error("Failed to install dependencies.");
      log.dim(
        "Ensure you have a C++ compiler installed (Xcode CLT on macOS, build-essential on Linux).",
      );
      process.exit(1);
    }
    log.success("Dependencies installed.");
  }

  // Step 2: Create SQLite database and import existing memories
  if (!existsSync(memoryDir)) {
    log.info("No memory directory found. Nothing to import.");
    log.success(
      "Tier 1 is ready. Memories will be indexed as they're created.",
    );
    return;
  }

  const docCount = countMdFiles(memoryDir);
  if (docCount === 0) {
    log.info("No existing memories to import.");
    log.success(
      "Tier 1 is ready. Memories will be indexed as they're created.",
    );
    return;
  }

  log.step(`Importing ${docCount} existing memories into SQLite...`);

  const { SqliteBackend } = await import(
    join(mcpDir, "dist/backends/sqlite/index.js")
  );

  const config = loadConfig();
  const embedding = config.memory?.embedding;
  const backend = new SqliteBackend(memoryDir, {
    skipVec: false,
    ...(embedding && { embedding }),
  });

  try {
    await backend.rebuild();
    const stats = await backend.stats();
    log.success(`Imported ${stats.total} memories. DB: ${backend.getDbPath()}`);

    if (backend.isVecEnabled()) {
      log.info(`Vector search: ${chalk.green("enabled")}`);
    } else {
      log.info(
        `Vector search: ${chalk.dim("disabled")} (sqlite-vec not available)`,
      );
    }
  } finally {
    await backend.close();
  }

  log.success('Tier 1 initialized. Run "cf memory status" to verify.');
  log.info(
    `Tip: Run ${chalk.cyan("/cf-onboard")} in Claude Code to populate memory with project knowledge.`,
  );
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
  // Normalize various date formats to YYYY-MM-DD HH:MM
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
  ensureBuilt(mcpDir);

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

  // Compute hash of the current project's memoryDir so we can backfill source_dir
  const currentMemoryDir = resolve(getMemoryDir());
  const currentHash = createHash("sha256")
    .update(currentMemoryDir)
    .digest("hex")
    .slice(0, 12);

  log.step(`Scanning ${dirs.length} project(s)...\n`);

  const projects: ProjectInfo[] = [];
  for (const id of dirs) {
    // If this project matches the current directory, pass the path for backfill
    const knownDir = id === currentHash ? currentMemoryDir : undefined;
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
}): Promise<void> {
  const baseDir = getProjectsBaseDir();

  if (!existsSync(baseDir)) {
    log.info("No memory projects found. Nothing to remove.");
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

  log.error("Specify --project-id <id> or --all.");
  log.dim('Run "cf memory list --projects" to see available projects.');
  process.exit(1);
}

export async function memoryMcpCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const mcpDir = getLibPath("cf-memory");
  ensureBuilt(mcpDir);

  const serverPath = join(mcpDir, "dist", "index.js");

  console.log(`Add this to your MCP client config:

--- Claude Desktop / Claude Chat (claude_desktop_config.json) ---

{
  "mcpServers": {
    "coding-friend-memory": {
      "command": "node",
      "args": ["${serverPath}", "${memoryDir}"]
    }
  }
}

--- Generic MCP client ---

Server command: node ${serverPath} ${memoryDir}
Transport: stdio

--- Available tools ---

  memory_store       Store a new memory
  memory_search      Search memories (keyword match)
  memory_retrieve    Get a specific memory by ID
  memory_list        List memories with filtering
  memory_update      Update existing memory
  memory_delete      Delete a memory

--- Resources ---

  memory://index     Browse all memories
  memory://stats     Storage statistics
`);
}
