import {
  readAgyMcpConfig,
  removeAgyMcpEntry,
  writeAgyMcpEntry,
} from "./agy-config.js";
import {
  claudeJsonHasMcpServer,
  readDevinMcpConfig,
  removeDevinMcpEntry,
  writeDevinMcpEntry,
} from "./devin-config.js";
import { runWithStderr } from "./exec.js";
import type { Host } from "./host.js";
import { log } from "./log.js";
import {
  readOmpMcpJson,
  removeOmpMcpEntry,
  writeOmpMcpEntry,
} from "./omp-config.js";
import { resolvePath } from "./paths.js";

const MCP_NAME = "coding-friend-learn";

function learnServer(resolvedDir: string): {
  command: string;
  args: string[];
} {
  return {
    command: "npx",
    args: ["-y", "coding-friend-cli", "mcp-serve-learn", resolvedDir],
  };
}

function hasOmpLearnEntry(): boolean {
  const data = readOmpMcpJson();
  return data !== null && MCP_NAME in data.mcpServers;
}

function hasAgyLearnEntry(): boolean {
  const data = readAgyMcpConfig();
  return data !== null && MCP_NAME in data.mcpServers;
}

function hasDevinLearnEntry(): boolean {
  const data = readDevinMcpConfig();
  return data !== null && MCP_NAME in data.mcpServers;
}

export function registerLearnMcp(
  learnDir: string,
  host: Host = "claude",
): boolean {
  const resolved = resolvePath(learnDir);

  if (host === "omp") {
    try {
      writeOmpMcpEntry(MCP_NAME, learnServer(resolved));
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not register MCP: ${detail}`);
      return false;
    }
  }

  if (host === "agy") {
    try {
      writeAgyMcpEntry(MCP_NAME, learnServer(resolved));
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not register MCP: ${detail}`);
      return false;
    }
  }

  if (host === "devin") {
    try {
      // Devin imports ~/.claude.json mcpServers by default — an entry there
      // already reaches Devin, so only write the user-scope file when absent.
      if (claudeJsonHasMcpServer(MCP_NAME)) {
        log.dim(
          "coding-friend-learn already registered in ~/.claude.json — Devin imports it; skipping mcp_config.json.",
        );
        return true;
      }
      writeDevinMcpEntry(MCP_NAME, learnServer(resolved));
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not register MCP: ${detail}`);
      return false;
    }
  }

  // "codex" falls through to the Claude CLI — no dedicated Codex learn MCP writer.
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
    "mcp-serve-learn",
    resolved,
  ]);
  if (result.exitCode !== 0) {
    const stderr = result.stderr ?? "";
    if (stderr.includes("ENOENT") || stderr.includes("command not found")) {
      log.warn(
        `claude CLI not found — add MCP manually:\n  claude mcp add --scope user ${MCP_NAME} -- npx -y coding-friend-cli mcp-serve-learn ${resolved}`,
      );
    } else {
      log.warn(`Could not register MCP: ${stderr || "unknown error"}`);
    }
    return false;
  }
  return true;
}

export function isLearnMcpRegistered(host: Host = "claude"): boolean {
  if (host === "omp") return hasOmpLearnEntry();
  if (host === "agy") return hasAgyLearnEntry();
  // Registered for Devin = written to its user file or imported via ~/.claude.json.
  if (host === "devin") {
    return hasDevinLearnEntry() || claudeJsonHasMcpServer(MCP_NAME);
  }

  const result = runWithStderr("claude", ["mcp", "get", MCP_NAME]);
  return result.exitCode === 0;
}

export function unregisterLearnMcp(host: Host = "claude"): boolean {
  if (host === "omp") {
    try {
      removeOmpMcpEntry(MCP_NAME);
      return !hasOmpLearnEntry();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not unregister MCP: ${detail}`);
      return false;
    }
  }

  if (host === "agy") {
    try {
      removeAgyMcpEntry(MCP_NAME);
      return !hasAgyLearnEntry();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      log.warn(`Could not unregister MCP: ${detail}`);
      return false;
    }
  }

  if (host === "devin") {
    // Removes only the entry we wrote into ~/.config/devin/mcp_config.json —
    // an imported ~/.claude.json entry belongs to the Claude host.
    try {
      removeDevinMcpEntry(MCP_NAME);
      return !hasDevinLearnEntry();
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
