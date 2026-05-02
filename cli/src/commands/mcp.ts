import { confirm } from "@inquirer/prompts";
import { existsSync } from "fs";
import { join } from "path";
import { resolveLearnDir, resolveMemoryDir } from "../lib/config.js";
import { run } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
import { ensureMemoryBuilt, printMemoryMcpConfig } from "./memory.js";
import {
  writeMemoryMcpEntry,
  getMemoryMcpStatus,
} from "../lib/memory-prompts.js";
import {
  detectMemoryMcpState,
  warnStaleMcpJson,
  type MemoryMcpState,
} from "../lib/mcp-state.js";
import {
  checkMemoryMcpHealth,
  checkLearnMcpHealth,
  printHealthSection,
  type McpHealthResult,
} from "../lib/mcp-health.js";
import { readJson } from "../lib/json.js";
import { listMdFilesRecursive } from "../lib/fs-utils.js";
import {
  registerLearnMcp,
  isLearnMcpRegistered,
} from "../lib/learn-prompts.js";
import { globalConfigPath } from "../lib/paths.js";
import { type CodingFriendConfig } from "../types.js";
import chalk from "chalk";

export { detectMemoryMcpState, type MemoryMcpState };

export { printHealthSection };

export async function mcpCommand(): Promise<void> {
  warnStaleMcpJson(resolveMemoryDir());

  const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
  const learnDir = resolveLearnDir(globalCfg);
  const learnMcpDir = getLibPath("learn-mcp");

  printBanner("📚 Learn MCP");
  log.info(`Learn folder: ${chalk.cyan(learnDir)}`);

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
  console.log(chalk.dim("Add this to your MCP client config (for non-Claude-Code clients):"));
  console.log();

  const learnDirJson = JSON.stringify(learnDir);
  console.log(`{
  "mcpServers": {
    "coding-friend-learn": {
      "command": "npx",
      "args": [
        "-y",
        "coding-friend-cli",
        "mcp-serve-learn",
        ${learnDirJson}
      ]
    }
  }
}`);
  console.log();
  log.dim("See full docs: https://cf.dinhanhthi.com/docs/cli/cf-mcp/");
  console.log();

  // ─── Auto-activate CF Learn MCP (user scope) ─────────────────────────────
  if (globalCfg?.learn?.disabled) {
    log.dim("coding-friend-learn: skipped (disabled in global config)");
  } else if (isLearnMcpRegistered()) {
    log.dim("coding-friend-learn: already registered");
    log.dim(
      "  (If it points to an old path, run: claude mcp remove --scope user coding-friend-learn && cf mcp)",
    );
  } else {
    const registered = registerLearnMcp(learnDir);
    if (registered) {
      log.success(
        "Added coding-friend-learn (user scope). Restart Claude Code to activate.",
      );
    }
  }

  console.log();

  // ─── Learn MCP health check ───────────────────────────────────────────────
  const learnMcpDistPath = join(learnMcpDir, "dist", "index.js");
  const learnHealth = await checkLearnMcpHealth({
    checkRegistered: isLearnMcpRegistered,
    pathExists: existsSync,
    listMdFiles: listMdFilesRecursive,
    docsDir: learnDir,
    learnMcpDistPath,
  });
  printHealthSection(learnHealth);

  // ─── CF Memory MCP — prompt if not in current project ────────────────────
  const memoryMcpStatus = getMemoryMcpStatus();
  if (memoryMcpStatus.configured) {
    log.dim("coding-friend-memory: already in .mcp.json");
  } else {
    const addMemoryMcp = await confirm({
      message:
        "coding-friend-memory not found in this project's .mcp.json. Add it now? (project-scoped — writes to .mcp.json)",
      default: true,
    });
    if (addMemoryMcp) {
      const memoryDir = resolveMemoryDir();
      writeMemoryMcpEntry(memoryDir);
    }
  }
  console.log();

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
