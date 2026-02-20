import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { resolveDocsDir } from "../lib/config.js";
import { run } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
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

  console.log("=== 🌿 Coding Friend MCP 🌿 ===");
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

  console.log(`Add this to your MCP client config:

--- Claude Desktop / Claude Chat (claude_desktop_config.json) ---

{
  "mcpServers": {
    "coding-friend-learn": {
      "command": "node",
      "args": ["${serverPath}", "${docsDir}"]
    }
  }
}

--- Generic MCP client ---

Server command: node ${serverPath} ${docsDir}
Transport: stdio

--- Available tools ---

Read:
  list-categories    List all categories with doc counts
  list-docs          List docs, filter by category/tag
  read-doc           Read full content of a doc
  search-docs        Full-text search across all docs
  get-review-list    Docs that need review

Write:
  create-doc         Create new learning doc
  update-doc         Append content or update tags
  improve-doc        Get improvement suggestions
  track-knowledge    Record understanding level (remembered/needs-review/new)
`);
}
