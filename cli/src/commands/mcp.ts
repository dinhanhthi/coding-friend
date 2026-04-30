import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { resolveDocsDir, resolveMemoryDir } from "../lib/config.js";
import { run } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
import { ensureMemoryBuilt, printMemoryMcpConfig } from "./memory.js";
import {
  detectMemoryMcpState,
  warnStaleMcpJson,
  type MemoryMcpState,
} from "../lib/mcp-state.js";
import {
  checkMemoryMcpHealth,
  checkLearnMcpHealth,
  type McpHealthResult,
} from "../lib/mcp-health.js";
import { readJson } from "../lib/json.js";
import { listMdFilesRecursive } from "../lib/fs-utils.js";
import chalk from "chalk";

export { detectMemoryMcpState, type MemoryMcpState };

function countMdFiles(dir: string): number {
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

/**
 * Print a health check section to the console.
 * Shows ✓/✗/⚠ per check, and a per-check fix hint (check.fix) for hard failures.
 */
export function printHealthSection(result: McpHealthResult): void {
  console.log(chalk.dim("─── Health Check ───"));
  for (const check of result.checks) {
    if (check.ok) {
      console.log(chalk.green(`  ✓ ${check.label}`));
    } else if (check.warn) {
      const detail = check.detail ? `: ${check.detail}` : "";
      console.log(chalk.yellow(`  ⚠ ${check.label}${detail}`));
    } else {
      const detail = check.detail ? `: ${check.detail}` : "";
      console.log(chalk.red(`  ✗ ${check.label}${detail}`));
      if (check.fix) {
        console.log(chalk.dim(`    → ${check.fix}`));
      }
    }
  }
  console.log();
}

export async function mcpCommand(path?: string): Promise<void> {
  warnStaleMcpJson(resolveMemoryDir());

  const docsDir = resolveDocsDir(path);
  const learnMcpDir = getLibPath("learn-mcp");

  // Validate docs
  if (!existsSync(docsDir)) {
    log.error(`Docs folder not found: ${docsDir}`);
    log.dim("Run /cf-learn first to generate some docs.");
    process.exit(1);
  }

  const docCount = countMdFiles(docsDir);
  if (docCount === 0) {
    log.error(`No .md files found in ${docsDir}`);
    log.dim("Run /cf-learn first to generate some docs.");
    process.exit(1);
  }

  printBanner("📚 Learn MCP");
  log.info(`Docs folder: ${chalk.cyan(docsDir)}`);
  log.info(`Found: ${chalk.green(docCount)} docs`);

  // Install deps if needed
  if (!existsSync(join(learnMcpDir, "node_modules"))) {
    log.step("Installing MCP server dependencies (one-time setup)...");
    const result = run("npm", ["install", "--silent"], { cwd: learnMcpDir });
    if (result === null) {
      log.error("Failed to install dependencies");
      process.exit(1);
    }
    log.success("Done.");
  }

  // Build if needed
  if (!existsSync(join(learnMcpDir, "dist"))) {
    log.step("Building MCP server...");
    const result = run("npm", ["run", "build", "--silent"], {
      cwd: learnMcpDir,
    });
    if (result === null) {
      log.error("Failed to build MCP server");
      process.exit(1);
    }
    log.success("Done.");
  }

  console.log();

  console.log(chalk.dim("Add this to your MCP client config:"));
  console.log();

  console.log(`{
  "mcpServers": {
    "coding-friend-learn": {
      "command": "npx",
      "args": [
        "-y",
        "coding-friend-cli",
        "mcp-serve-learn",
        "${docsDir}"
      ]
    }
  }
}`);
  console.log();

  log.dim(
    "Available tools & resources: https://cf.dinhanhthi.com/docs/cli/cf-mcp/",
  );
  console.log();

  // ─── Learn MCP health check ───────────────────────────────────────────────
  const localMcpPath = join(process.cwd(), ".mcp.json");
  const learnMcpDistPath = join(learnMcpDir, "dist", "index.js");
  const learnHealth = await checkLearnMcpHealth({
    readMcpJson: () => readJson<Record<string, unknown>>(localMcpPath),
    pathExists: existsSync,
    listMdFiles: listMdFilesRecursive,
    docsDir,
    learnMcpDistPath,
  });
  printHealthSection(learnHealth);

  // Memory MCP section
  await printMemoryMcp();
}

async function printMemoryMcp(): Promise<void> {
  const memoryDir = resolveMemoryDir();
  let mcpDir: string;
  try {
    mcpDir = getLibPath("cf-memory");
  } catch {
    log.dim(
      'Memory MCP: cf-memory package not found. Run "cf memory init" to set it up.',
    );
    return;
  }

  ensureMemoryBuilt(mcpDir);

  console.log();
  printBanner("🧠 Memory MCP", { color: chalk.magenta });
  log.info(`Memory dir: ${chalk.cyan(memoryDir)}`);
  console.log();

  printMemoryMcpConfig(memoryDir);

  // ─── Memory MCP health check ──────────────────────────────────────────────
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
