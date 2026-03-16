import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
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

export async function memoryListCommand(): Promise<void> {
  const memoryDir = getMemoryDir();

  if (!existsSync(memoryDir)) {
    log.error(`Memory dir not found: ${memoryDir}`);
    log.dim("Run `cf init` to create project folders.");
    process.exit(1);
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
      for (const m of metas) {
        console.log(\`\${m.frontmatter.type.padEnd(12)} \${m.id}\`);
        console.log(\`             \${m.frontmatter.title}\`);
        console.log();
      }
      console.log(\`Total: \${metas.length} memories\`);
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
