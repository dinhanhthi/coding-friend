import { existsSync } from "fs";
import { join } from "path";
import { resolveLearnDir, resolveMemoryDir } from "../lib/config.js";
import { run } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";
import { ensureMemoryBuilt, printMemoryMcpConfig } from "./memory.js";
import {
  detectMemoryMcpState,
  warnStaleMcpJson,
  type MemoryMcpState,
} from "../lib/mcp-state.js";
import { printHealthSection, type McpHealthResult } from "../lib/mcp-health.js";
import {
  collectLearnMcpHealth,
  collectMemoryMcpHealth,
} from "../lib/mcp-report.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { isAgyPluginInstalled, readAgyMcpConfig } from "../lib/agy-config.js";
import {
  claudeJsonHasMcpServer,
  isDevinPluginInstalled,
  readDevinMcpConfig,
} from "../lib/devin-config.js";
import { readJson } from "../lib/json.js";
import {
  registerLearnMcp,
  isLearnMcpRegistered,
} from "../lib/learn-prompts.js";
import {
  registerMemoryMcp,
  isMemoryMcpRegistered,
} from "../lib/memory-mcp-register.js";
import { globalConfigPath } from "../lib/paths.js";
import { type CodingFriendConfig } from "../types.js";
import chalk from "chalk";

export { detectMemoryMcpState, type MemoryMcpState };

export { printHealthSection };

type Registration = "registered" | "already" | "disabled" | "failed";

export interface McpData {
  learn: { dir: string; registration: Registration; health: McpHealthResult };
  memory: {
    dir: string;
    registration: Registration;
    health: McpHealthResult | null;
    error?: "MEMORY_BUILD_FAILED";
  } | null;
  agy: AgyMcpStatus;
  devin: DevinMcpStatus;
}

export async function mcpCommand(opts: { json?: boolean } = {}): Promise<void> {
  if (opts.json) {
    await runJson(() => runMcp(true));
    return;
  }
  await runHuman(() => runMcp(false));
}

async function runMcp(json: boolean): Promise<McpData> {
  warnStaleMcpJson();

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
      throw new CliError("COMMAND_FAILED", "Failed to install dependencies");
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
      throw new CliError("COMMAND_FAILED", "Failed to build MCP server");
    }
    log.success("Done.");
  }

  console.log();
  console.log(
    chalk.dim(
      "Add this to your MCP client config (for non-Claude-Code clients):",
    ),
  );
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
  log.dim("See full docs: https://cf.dinhanhthi.com/#memory");
  console.log();

  // ─── Auto-activate CF Learn MCP (user scope) ─────────────────────────────
  let learnRegistration: Registration;
  if (globalCfg?.learn?.disabled) {
    learnRegistration = "disabled";
    log.dim("coding-friend-learn: skipped (disabled in global config)");
  } else if (isLearnMcpRegistered()) {
    learnRegistration = "already";
    log.dim("coding-friend-learn: already registered");
    log.dim(
      "  (If it points to an old path, run: claude mcp remove --scope user coding-friend-learn && cf mcp)",
    );
  } else {
    const registered = registerLearnMcp(learnDir);
    learnRegistration = registered ? "registered" : "failed";
    if (registered) {
      log.success(
        "Added coding-friend-learn (user scope). Restart Claude Code to activate.",
      );
    }
  }

  console.log();

  // ─── Learn MCP health check ───────────────────────────────────────────────
  const learnHealth = await collectLearnMcpHealth({
    learnMcpDir,
    docsDir: learnDir,
  });
  printHealthSection(learnHealth);

  // ─── Auto-activate CF Memory MCP (user scope) ────────────────────────────
  let memoryRegistration: Registration;
  if (isMemoryMcpRegistered()) {
    memoryRegistration = "already";
    log.dim("coding-friend-memory: already registered (user scope)");
    log.dim(
      "  (If it points to an old path, run: claude mcp remove --scope user coding-friend-memory && cf mcp)",
    );
  } else {
    const registered = registerMemoryMcp();
    memoryRegistration = registered ? "registered" : "failed";
    if (registered) {
      log.success(
        "Registered coding-friend-memory (user scope). Restart Claude Code to activate.",
      );
    }
  }
  console.log();

  // Memory MCP section
  const memory = await printMemoryMcp(memoryRegistration, json);

  const agy = printAgyMcpStatus();
  const devin = printDevinMcpStatus();

  return {
    learn: {
      dir: learnDir,
      registration: learnRegistration,
      health: learnHealth,
    },
    memory,
    agy,
    devin,
  };
}

interface AgyMcpStatus {
  installed: boolean;
  memoryRegistered: boolean;
}

function printAgyMcpStatus(): AgyMcpStatus {
  if (!isAgyPluginInstalled()) {
    return { installed: false, memoryRegistered: false };
  }

  console.log();
  printBanner("Antigravity MCP");
  const cfg = readAgyMcpConfig();
  const servers = cfg?.mcpServers ?? {};
  const memoryRegistered = "coding-friend-memory" in servers;
  const status = memoryRegistered ? "registered" : "not registered";
  log.info(`coding-friend-memory: ${status} in plugin mcp_config.json`);
  return { installed: true, memoryRegistered };
}

export interface DevinMcpStatus {
  installed: boolean;
  memoryInMcpConfig: boolean;
  /** Where coding-friend-learn is registered for Devin. */
  learn: "mcp_config" | "claude_json" | "none";
}

export function printDevinMcpStatus(): DevinMcpStatus {
  if (!isDevinPluginInstalled()) {
    return { installed: false, memoryInMcpConfig: false, learn: "none" };
  }

  console.log();
  printBanner("Devin MCP");
  log.dim("coding-friend-memory ships inside the Devin plugin (.mcp.json).");
  const servers = readDevinMcpConfig()?.mcpServers ?? {};
  const memoryInMcpConfig = "coding-friend-memory" in servers;
  if (memoryInMcpConfig) {
    log.info(
      "coding-friend-memory: also present in mcp_config.json (Devin de-dups by name).",
    );
  }
  const learn: DevinMcpStatus["learn"] =
    "coding-friend-learn" in servers
      ? "mcp_config"
      : claudeJsonHasMcpServer("coding-friend-learn")
        ? "claude_json"
        : "none";
  const status =
    learn === "mcp_config"
      ? "registered in mcp_config.json"
      : learn === "claude_json"
        ? "registered via ~/.claude.json (Devin imports it)"
        : "not registered — run `cf init --agent devin` to add it";
  log.info(`coding-friend-learn: ${status}`);
  return { installed: true, memoryInMcpConfig, learn };
}

async function printMemoryMcp(
  registration: Registration,
  json: boolean,
): Promise<McpData["memory"]> {
  const memoryDir = resolveMemoryDir();
  let mcpDir: string;
  try {
    mcpDir = getLibPath("cf-memory");
  } catch {
    log.dim(
      'Memory MCP: cf-memory package not found. Run "cf memory init" to set it up.',
    );
    return null;
  }

  if (json) {
    if (!ensureMemoryBuilt(mcpDir, { exitOnError: false })) {
      return {
        dir: memoryDir,
        registration: "failed",
        health: null,
        error: "MEMORY_BUILD_FAILED",
      };
    }
  } else {
    ensureMemoryBuilt(mcpDir);
  }

  console.log();
  printBanner("🧠 Memory MCP", { color: chalk.magenta });
  log.info(`Memory dir: ${chalk.cyan(memoryDir)}`);
  console.log();

  printMemoryMcpConfig(memoryDir);

  // ─── Memory MCP health check ──────────────────────────────────────────────
  const memoryHealth = await collectMemoryMcpHealth(mcpDir);
  printHealthSection(memoryHealth);
  return { dir: memoryDir, registration, health: memoryHealth };
}
