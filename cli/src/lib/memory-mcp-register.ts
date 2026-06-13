import { runWithStderr } from "./exec.js";
import { log } from "./log.js";

const MCP_NAME = "coding-friend-memory";

export function registerMemoryMcp(): boolean {
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

export function isMemoryMcpRegistered(): boolean {
  const result = runWithStderr("claude", ["mcp", "get", MCP_NAME]);
  return result.exitCode === 0;
}

export function unregisterMemoryMcp(): boolean {
  const result = runWithStderr("claude", [
    "mcp",
    "remove",
    "--scope",
    "user",
    MCP_NAME,
  ]);
  return result.exitCode === 0;
}
