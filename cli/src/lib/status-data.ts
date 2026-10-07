import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { getInstalledVersion } from "./statusline.js";
import { readJson } from "./json.js";
import {
  isAgyPluginEnabled,
  isAgyPluginInstalled,
  readAgyPluginVersion,
} from "./agy-config.js";
import {
  readDevinInstallState,
  type DevinInstallState,
} from "./devin-config.js";
import {
  agyPluginDir,
  claudeSettingsPath,
  devStatePath,
  globalConfigPath,
  localConfigPath,
} from "./paths.js";
import { getExistingRules } from "./permissions.js";
import { isPluginDisabled, detectPluginScope } from "./plugin-state.js";
import type { PluginScope } from "./prompt-utils.js";
import { resolveMemoryDir, sanitizeRawConfig } from "./config.js";
import { getLibPath } from "./lib-path.js";
import type { McpHealthResult } from "./mcp-health.js";
import { collectLearnMcpHealth, collectMemoryMcpHealth } from "./mcp-report.js";
import {
  semverCompare,
  getLatestVersion,
  getCliVersion,
  getLatestCliVersion,
} from "../commands/update.js";

export interface VersionStatus {
  current: string | null;
  latest: string | null;
  /** null when either side is unknown. */
  updateAvailable: boolean | null;
}

export interface VersionsStatus {
  plugin: VersionStatus;
  cli: VersionStatus & { current: string };
}

export interface PluginStatus {
  scope: PluginScope;
  enabled: boolean;
  autoUpdate: boolean | "unknown";
  devMode: boolean;
  permissionRules: number;
  /** null when the Antigravity plugin is not installed. */
  antigravity: { version: string | null; enabled: boolean; dir: string } | null;
  devin: DevinInstallState;
}

export interface MemoryStatus {
  dir: string;
  documents: number;
  /** 1 = SQLite + Hybrid, 2 = MiniSearch + Daemon, 3 = Markdown; null = unavailable. */
  tier: 1 | 2 | 3 | null;
  /** null = unavailable. */
  daemon: {
    running: boolean;
    pid: number | null;
    startedAt: number | null;
  } | null;
}

export interface McpStatus {
  memory: McpHealthResult;
  learn: McpHealthResult;
}

export interface ConfigFileStatus {
  path: string;
  config: Record<string, unknown>;
}

export interface ConfigStatus {
  global: ConfigFileStatus | null;
  local: ConfigFileStatus | null;
}

export interface StatusData {
  versions: VersionsStatus;
  plugin: PluginStatus;
  memory: MemoryStatus;
  mcp: McpStatus | null;
  config: ConfigStatus;
}

function countMdFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
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

function updateAvailable(
  current: string | null,
  latest: string | null,
): boolean | null {
  if (!current || !latest) return null;
  return semverCompare(current, latest) < 0;
}

export function collectVersions(): VersionsStatus {
  const pluginVersion = getInstalledVersion();
  const latestPlugin = getLatestVersion();
  const cliVersion = getCliVersion();
  const latestCli = getLatestCliVersion();
  return {
    plugin: {
      current: pluginVersion,
      latest: latestPlugin,
      updateAvailable: updateAvailable(pluginVersion, latestPlugin),
    },
    cli: {
      current: cliVersion,
      latest: latestCli,
      updateAvailable: updateAvailable(cliVersion, latestCli),
    },
  };
}

function readAutoUpdate(): boolean | "unknown" {
  try {
    const claudeSettings =
      readJson<Record<string, unknown>>(claudeSettingsPath());
    const marketplaces = claudeSettings?.extraKnownMarketplaces as
      | Record<string, Record<string, unknown>>
      | undefined;
    return marketplaces?.["coding-friend-marketplace"]?.autoUpdate === true;
  } catch {
    return "unknown";
  }
}

export function collectPlugin(): PluginStatus {
  const scope = detectPluginScope();
  const enabled = !isPluginDisabled(scope);
  const autoUpdate = readAutoUpdate();
  const devMode = Boolean(readJson<{ localPath: string }>(devStatePath()));
  const permissionRules = getExistingRules(claudeSettingsPath()).length;
  const antigravity = isAgyPluginInstalled()
    ? {
        version: readAgyPluginVersion(),
        enabled: isAgyPluginEnabled(),
        dir: agyPluginDir(),
      }
    : null;
  const devin = readDevinInstallState();
  return {
    scope,
    enabled,
    autoUpdate,
    devMode,
    permissionRules,
    antigravity,
    devin,
  };
}

export async function collectMemory(): Promise<MemoryStatus> {
  const dir = resolveMemoryDir();
  const documents = countMdFiles(dir);
  let tier: MemoryStatus["tier"] = null;
  let daemon: MemoryStatus["daemon"] = null;

  try {
    const mcpDir = getLibPath("cf-memory");
    if (existsSync(join(mcpDir, "dist"))) {
      const { areSqliteDepsAvailable } = await import(
        join(mcpDir, "dist/lib/lazy-install.js")
      );
      const { isDaemonRunning, getDaemonInfo } = await import(
        join(mcpDir, "dist/daemon/process.js")
      );

      const sqliteAvailable = areSqliteDepsAvailable();
      const running = await isDaemonRunning();

      tier = sqliteAvailable ? 1 : running ? 2 : 3;

      if (running) {
        const info = getDaemonInfo();
        daemon = {
          running: true,
          pid: info ? info.pid : null,
          startedAt: info ? info.startedAt : null,
        };
      } else {
        daemon = { running: false, pid: null, startedAt: null };
      }
    }
  } catch {
    // cf-memory not built or not available — keep defaults
  }

  return { dir, documents, tier, daemon };
}

/** Memory + learn MCP health; null when the health wiring itself fails. */
export async function collectMcp(): Promise<McpStatus | null> {
  try {
    const memory = await collectMemoryMcpHealth();
    const learn = await collectLearnMcpHealth();
    return { memory, learn };
  } catch {
    return null;
  }
}

/** Sanitized global then local config (sanitizeRawConfig may log warnings). */
export function collectConfig(): ConfigStatus {
  const globalPath = globalConfigPath();
  const localPath = localConfigPath();
  const rawGlobal = readJson<Record<string, unknown>>(globalPath);
  const rawLocal = readJson<Record<string, unknown>>(localPath);
  const global = rawGlobal ? sanitizeRawConfig(rawGlobal) : null;
  const local = rawLocal ? sanitizeRawConfig(rawLocal) : null;
  return {
    global: global ? { path: globalPath, config: global } : null,
    local: local ? { path: localPath, config: local } : null,
  };
}

export async function collectStatus(): Promise<StatusData> {
  const versions = collectVersions();
  const plugin = collectPlugin();
  const memory = await collectMemory();
  const mcp = await collectMcp();
  const config = collectConfig();
  return { versions, plugin, memory, mcp, config };
}
