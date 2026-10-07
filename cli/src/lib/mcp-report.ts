import { existsSync } from "fs";
import { join } from "path";
import { readJson } from "./json.js";
import { globalConfigPath } from "./paths.js";
import { resolveLearnDir } from "./config.js";
import { getLibPath } from "./lib-path.js";
import { listMdFilesRecursive } from "./fs-utils.js";
import { isLearnMcpRegistered } from "./learn-prompts.js";
import { isMemoryMcpRegistered } from "./memory-mcp-register.js";
import {
  checkLearnMcpHealth,
  checkMemoryMcpHealth,
  type McpHealthResult,
} from "./mcp-health.js";
import type { CodingFriendConfig } from "../types.js";

function libPathOrNull(name: "cf-memory" | "learn-mcp"): string | null {
  try {
    return getLibPath(name);
  } catch {
    return null;
  }
}

/**
 * Health of the memory MCP server, wired to the real filesystem and daemon.
 * `mcpDir` defaults to the bundled cf-memory package (null when not found).
 */
export async function collectMemoryMcpHealth(
  mcpDir: string | null = libPathOrNull("cf-memory"),
): Promise<McpHealthResult> {
  const localMcpPath = join(process.cwd(), ".mcp.json");
  const memoryDistPath = mcpDir
    ? join(mcpDir, "dist", "index.js")
    : "/unavailable";

  let isDaemonRunning: () => Promise<boolean> = async () => false;
  if (mcpDir) {
    try {
      const proc = await import(join(mcpDir, "dist/daemon/process.js"));
      isDaemonRunning = proc.isDaemonRunning;
    } catch {
      // not built yet — daemon reports stopped (warn)
    }
  }

  return checkMemoryMcpHealth({
    readMcpJson: () => readJson<Record<string, unknown>>(localMcpPath),
    pathExists: existsSync,
    isDaemonRunning,
    memoryDistPath,
    isRegistered: isMemoryMcpRegistered,
  });
}

/**
 * Health of the learn MCP server. `learnMcpDir` defaults to the bundled
 * learn-mcp package; `docsDir` defaults to the global config learn dir.
 */
export async function collectLearnMcpHealth(
  opts: { learnMcpDir?: string | null; docsDir?: string } = {},
): Promise<McpHealthResult> {
  const learnMcpDir =
    opts.learnMcpDir === undefined
      ? libPathOrNull("learn-mcp")
      : opts.learnMcpDir;
  const learnMcpDistPath = learnMcpDir
    ? join(learnMcpDir, "dist", "index.js")
    : "/unavailable";
  const docsDir =
    opts.docsDir ??
    resolveLearnDir(readJson<CodingFriendConfig>(globalConfigPath()));

  return checkLearnMcpHealth({
    checkRegistered: isLearnMcpRegistered,
    pathExists: existsSync,
    listMdFiles: listMdFilesRecursive,
    docsDir,
    learnMcpDistPath,
  });
}
