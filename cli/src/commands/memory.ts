import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { resolveDocsDir } from "../lib/config.js";
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
  const docsDir = resolveDocsDir(path);
  return join(docsDir, "memory");
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

export async function memoryStatusCommand(): Promise<void> {
  const memoryDir = getMemoryDir();
  const docCount = countMdFiles(memoryDir);

  console.log("=== 🧠 Coding Friend Memory ===");
  console.log();
  log.info(`Tier: ${chalk.cyan("Tier 3 (Markdown)")}`);
  log.info(`Memory dir: ${chalk.cyan(memoryDir)}`);
  log.info(`Memories: ${chalk.green(String(docCount))}`);

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
