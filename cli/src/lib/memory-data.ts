import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig } from "./config.js";
import { run } from "./exec.js";
import { getMemoryMcpStatus } from "./memory-prompts.js";
import { CliError } from "./output.js";

export function countMdFiles(dir: string): number {
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

export function getProjectsBaseDir(): string {
  const home = homedir();
  return join(home, ".coding-friend", "memory", "projects");
}

export function dirSize(dir: string): number {
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

export interface ProjectInfo {
  id: string;
  sourceDir: string | null;
  memories: number;
  size: number;
  lastUpdated: string | null;
}

export function getProjectInfo(
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

// ─── memory status collectors (callers ensure the memory server is built) ───

export interface MemoryCore {
  dir: string;
  documents: number;
  /** 1 = SQLite + Hybrid, 2 = MiniSearch + Daemon, 3 = Markdown. */
  tier: 1 | 2 | 3;
  sqliteDeps: boolean;
  daemon: { running: boolean; pid: number | null; startedAt: number | null };
}

export async function collectMemoryCore(
  memoryDir: string,
  mcpDir: string,
): Promise<MemoryCore> {
  const { isDaemonRunning, getDaemonInfo } = await import(
    join(mcpDir, "dist/daemon/process.js")
  );
  const { areSqliteDepsAvailable } = await import(
    join(mcpDir, "dist/lib/lazy-install.js")
  );

  const sqliteDeps: boolean = areSqliteDepsAvailable();
  const running: boolean = await isDaemonRunning();
  // The pid file can outlive the daemon; only trust it while it runs.
  const info: { pid: number; startedAt: number } | null = running
    ? getDaemonInfo()
    : null;

  return {
    dir: memoryDir,
    documents: countMdFiles(memoryDir),
    tier: sqliteDeps ? 1 : running ? 2 : 3,
    sqliteDeps,
    daemon: {
      running,
      pid: info?.pid ?? null,
      startedAt: info?.startedAt ?? null,
    },
  };
}

export interface MemoryDetails {
  /** null when neither provider nor model is configured. */
  embedding: { provider: string; model: string } | null;
  mcp: ReturnType<typeof getMemoryMcpStatus>;
  autoCapture: boolean;
  /** Top-level categories with at least one memory. */
  categories: { name: string; count: number }[];
}

export function collectMemoryDetails(memoryDir: string): MemoryDetails {
  const config = loadConfig();
  const embeddingConfig = config.memory?.embedding;
  let embedding: MemoryDetails["embedding"] = null;
  if (embeddingConfig?.provider || embeddingConfig?.model) {
    const provider = embeddingConfig.provider ?? "transformers";
    const model =
      embeddingConfig.model ??
      (provider === "ollama" ? "all-minilm:l6-v2" : "Xenova/all-MiniLM-L6-v2");
    embedding = { provider, model };
  }

  const categories = existsSync(memoryDir)
    ? readdirSync(memoryDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => ({
          name: d.name,
          count: countMdFiles(join(memoryDir, d.name)),
        }))
        .filter((c) => c.count > 0)
    : [];

  return {
    embedding,
    mcp: getMemoryMcpStatus(),
    autoCapture: config.memory?.autoCapture ?? false,
    categories,
  };
}

// ─── JSON-mode search / list (separate child scripts that print JSON) ───────

export interface MemorySearchHit {
  id: string;
  category: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
  score: number;
  matchedOn: string[];
}

export interface MemoryListItem {
  id: string;
  category: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
  updated: string;
}

function runJsonChild<T>(
  script: string,
  memoryDir: string,
  env?: NodeJS.ProcessEnv,
): T {
  const out = run("node", ["-e", script], { cwd: memoryDir, env });
  if (out === null) {
    throw new CliError("COMMAND_FAILED", "Memory backend process failed");
  }
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new CliError(
      "COMMAND_FAILED",
      "Memory backend returned invalid JSON",
    );
  }
}

export function searchMemories(
  memoryDir: string,
  mcpDir: string,
  query: string,
  limit = 10,
): MemorySearchHit[] {
  // Query goes through an env var to prevent command injection.
  return runJsonChild<MemorySearchHit[]>(
    `
    import { MarkdownBackend } from ${JSON.stringify(join(mcpDir, "dist/backends/markdown.js"))};
    const backend = new MarkdownBackend(${JSON.stringify(memoryDir)});
    const results = await backend.search({ query: process.env.CF_SEARCH_QUERY, limit: ${Number(limit)} });
    console.log(JSON.stringify(results.map((r) => ({
      id: r.memory.id,
      category: r.memory.category,
      title: r.memory.frontmatter.title,
      description: r.memory.frontmatter.description,
      type: r.memory.frontmatter.type,
      tags: r.memory.frontmatter.tags ?? [],
      score: r.score,
      matchedOn: r.matchedOn,
    }))));
    `,
    memoryDir,
    { ...process.env, CF_SEARCH_QUERY: query },
  );
}

export function listMemories(
  memoryDir: string,
  mcpDir: string,
): MemoryListItem[] {
  return runJsonChild<MemoryListItem[]>(
    `
    import { MarkdownBackend } from ${JSON.stringify(join(mcpDir, "dist/backends/markdown.js"))};
    const backend = new MarkdownBackend(${JSON.stringify(memoryDir)});
    const metas = await backend.list({});
    console.log(JSON.stringify(metas.map((m) => ({
      id: m.id,
      category: m.category,
      title: m.frontmatter.title,
      description: m.frontmatter.description,
      type: m.frontmatter.type,
      tags: m.frontmatter.tags ?? [],
      updated: m.frontmatter.updated,
    }))));
    `,
    memoryDir,
  );
}
