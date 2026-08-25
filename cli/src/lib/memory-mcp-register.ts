import {
  readAgyMcpConfig,
  removeAgyMcpEntry,
  writeAgyMcpEntry,
  type AgyMcpServer,
} from "./agy-config.js";
import { runWithStderr } from "./exec.js";
import type { Host } from "./host.js";
import { log } from "./log.js";
import {
  readOmpMcpJson,
  removeOmpMcpEntry,
  writeOmpMcpEntry,
  type OmpMcpServer,
} from "./omp-config.js";

const MCP_NAME = "coding-friend-memory";

const OMP_MEMORY_SERVER: OmpMcpServer = {
  command: "npx",
  args: ["-y", "coding-friend-cli", "mcp-serve"],
};

const AGY_MEMORY_SERVER: AgyMcpServer = {
  command: "npx",
  args: ["-y", "coding-friend-cli", "mcp-serve"],
};

function hasOmpMemoryEntry(): boolean {
  const data = readOmpMcpJson();
  return data !== null && MCP_NAME in data.mcpServers;
}

function hasAgyMemoryEntry(): boolean {
  const data = readAgyMcpConfig();
  return data !== null && MCP_NAME in data.mcpServers;
}

export function registerMemoryMcp(host: Host = "claude"): boolean {
  if (host === "omp") {
    try {
      writeOmpMcpEntry(MCP_NAME, OMP_MEMORY_SERVER);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not register MCP: ${detail}`);
      return false;
    }
  }

  if (host === "agy") {
    try {
      writeAgyMcpEntry(MCP_NAME, AGY_MEMORY_SERVER);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not register MCP: ${detail}`);
      return false;
    }
  }

  // "codex" uses writeCodexMemoryMcpConfig(memoryDir) in init.ts — keep the Claude CLI path here.
  const result = runWithStderr("claude", [
    "mcp",
    "add",
    "--scope",
    "user",
    MCP_NAME,
    "--",
    "npx",
    "-y",
    "coding-friend-cli",
    "mcp-serve",
  ]);
  if (result.exitCode !== 0) {
    const stderr = result.stderr ?? "";
    if (stderr.includes("ENOENT") || stderr.includes("command not found")) {
      log.warn(
        `claude CLI not found — add MCP manually:\n  claude mcp add --scope user ${MCP_NAME} -- npx -y coding-friend-cli mcp-serve`,
      );
    } else {
      log.warn(`Could not register MCP: ${stderr || "unknown error"}`);
    }
    return false;
  }
  return true;
}

export function isMemoryMcpRegistered(host: Host = "claude"): boolean {
  if (host === "omp") return hasOmpMemoryEntry();
  if (host === "agy") return hasAgyMemoryEntry();

  const result = runWithStderr("claude", ["mcp", "get", MCP_NAME]);
  return result.exitCode === 0;
}

export function unregisterMemoryMcp(host: Host = "claude"): boolean {
  if (host === "omp") {
    try {
      removeOmpMcpEntry(MCP_NAME);
      return !hasOmpMemoryEntry();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not unregister MCP: ${detail}`);
      return false;
    }
  }

  if (host === "agy") {
    try {
      removeAgyMcpEntry(MCP_NAME);
      return !hasAgyMemoryEntry();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not unregister MCP: ${detail}`);
      return false;
    }
  }

  const result = runWithStderr("claude", [
    "mcp",
    "remove",
    "--scope",
    "user",
    MCP_NAME,
  ]);
  return result.exitCode === 0;
}
