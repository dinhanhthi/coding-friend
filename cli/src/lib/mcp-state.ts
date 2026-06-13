import { existsSync } from "fs";
import { join } from "path";
import { readJson } from "./json.js";
import { log } from "./log.js";
import chalk from "chalk";

/**
 * Check .mcp.json in cwd for stale/legacy coding-friend-memory entries.
 * Warns only — does not rewrite. The project-scope entry shadows the
 * user-scope server (Claude Code precedence: local > project > user);
 * run `cf update` to remove it automatically.
 */
export function warnStaleMcpJson(): void {
  const localMcpPath = join(process.cwd(), ".mcp.json");
  if (!existsSync(localMcpPath)) return;

  const mcpJson = readJson<Record<string, unknown>>(localMcpPath);
  if (mcpJson === null) {
    log.warn(
      ".mcp.json exists but could not be parsed — check for syntax errors.",
    );
    return;
  }

  const state = detectMemoryMcpState(mcpJson, existsSync);

  if (state.kind === "stale") {
    console.log(
      chalk.yellow(`⚠ Stale MCP config detected in .mcp.json`),
    );
    console.log(chalk.dim(`  Path no longer exists: ${state.path}`));
    console.log(
      chalk.dim(
        `  This project-scope coding-friend-memory entry shadows the global (user-scope) memory server.`,
      ),
    );
    console.log(
      chalk.dim(`  Run "cf update" to remove it automatically.`),
    );
    console.log();
  } else if (state.kind === "legacy-valid") {
    console.log(
      chalk.cyan(
        `ℹ .mcp.json has a project-scope coding-friend-memory entry.`,
      ),
    );
    console.log(
      chalk.dim(
        `  This shadows the global (user-scope) memory server (Claude Code precedence: local > project > user).`,
      ),
    );
    console.log(
      chalk.dim(`  Run "cf update" to remove it automatically.`),
    );
    console.log();
  }
}

export type MemoryMcpState =
  | { kind: "none" }
  | { kind: "npx" }
  | { kind: "stale"; path: string }
  | { kind: "legacy-valid"; path: string };

/**
 * Inspect .mcp.json content and determine the state of the coding-friend-memory entry.
 * Pure function — pathExists is injected so it can be tested without hitting the filesystem.
 */
export function detectMemoryMcpState(
  mcpJson: Record<string, unknown> | null,
  pathExists: (p: string) => boolean,
): MemoryMcpState {
  if (!mcpJson) return { kind: "none" };

  const servers = mcpJson.mcpServers as Record<string, unknown> | undefined;
  if (!servers) return { kind: "none" };

  const entry = servers["coding-friend-memory"] as
    | Record<string, unknown>
    | undefined;
  if (!entry) return { kind: "none" };

  const command = entry.command as string | undefined;
  if (!command) return { kind: "none" };

  if (command === "npx") return { kind: "npx" };

  if (command === "node") {
    const args = entry.args as string[] | undefined;
    const serverPath = args?.[0];
    if (!serverPath) return { kind: "none" };

    if (!pathExists(serverPath)) {
      return { kind: "stale", path: serverPath };
    }
    return { kind: "legacy-valid", path: serverPath };
  }

  return { kind: "none" };
}
