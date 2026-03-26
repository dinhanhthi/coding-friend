import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { resolveDocsDir, resolveMemoryDir } from "../lib/config.js";
import { run } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
import { ensureMemoryBuilt, printMemoryMcpConfig } from "./memory.js";
import chalk from "chalk";

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
  console.log();

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

  const serverPath = join(mcpDir, "dist", "index.js");

  console.log(chalk.dim("Add this to your MCP client config:"));
  console.log();

  console.log(
    chalk.yellow.bold(
      "--- Claude Desktop / Claude Chat (claude_desktop_config.json) ---",
    ),
  );
  console.log(`
{
  "mcpServers": {
    "coding-friend-learn": {
      "command": "node",
      "args": ["${serverPath}", "${docsDir}"]
    }
  }
}`);
  console.log();

  console.log(chalk.yellow.bold("--- Generic MCP client ---"));
  console.log(`
Server command: node ${serverPath} ${docsDir}
Transport: stdio`);
  console.log();

  console.log(chalk.yellow.bold("--- Available tools ---"));
  console.log();
  console.log(chalk.cyan.bold("Read:"));
  console.log(
    `  ${chalk.white("list-categories")}    ${chalk.dim("List all categories with doc counts")}`,
  );
  console.log(
    `  ${chalk.white("list-docs")}          ${chalk.dim("List docs, filter by category/tag")}`,
  );
  console.log(
    `  ${chalk.white("read-doc")}           ${chalk.dim("Read full content of a doc")}`,
  );
  console.log(
    `  ${chalk.white("search-docs")}        ${chalk.dim("Full-text search across all docs")}`,
  );
  console.log(
    `  ${chalk.white("get-review-list")}    ${chalk.dim("Docs that need review")}`,
  );
  console.log();
  console.log(chalk.cyan.bold("Write:"));
  console.log(
    `  ${chalk.white("create-doc")}         ${chalk.dim("Create new learning doc")}`,
  );
  console.log(
    `  ${chalk.white("update-doc")}         ${chalk.dim("Append content or update tags")}`,
  );
  console.log(
    `  ${chalk.white("improve-doc")}        ${chalk.dim("Get improvement suggestions")}`,
  );
  console.log(
    `  ${chalk.white("track-knowledge")}    ${chalk.dim("Record understanding level (remembered/needs-review/new)")}`,
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

  const serverPath = join(mcpDir, "dist", "index.js");

  console.log();
  printBanner("🧠 Memory MCP", { color: chalk.magenta });
  log.info(`Memory dir: ${chalk.cyan(memoryDir)}`);
  console.log();

  printMemoryMcpConfig(serverPath, memoryDir);
}
