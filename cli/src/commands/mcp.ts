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

export async function mcpCommand(path?: string): Promise<void> {
  warnStaleMcpJson(resolveMemoryDir());

  const docsDir = resolveDocsDir(path);
  const mcpDir = getLibPath("learn-mcp");

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
  if (!existsSync(join(mcpDir, "node_modules"))) {
    log.step("Installing MCP server dependencies (one-time setup)...");
    const result = run("npm", ["install", "--silent"], { cwd: mcpDir });
    if (result === null) {
      log.error("Failed to install dependencies");
      process.exit(1);
    }
    log.success("Done.");
  }

  // Build if needed
  if (!existsSync(join(mcpDir, "dist"))) {
    log.step("Building MCP server...");
    const result = run("npm", ["run", "build", "--silent"], { cwd: mcpDir });
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

  // Memory MCP section
  printMemoryMcp();
}

function printMemoryMcp(): void {
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
}
