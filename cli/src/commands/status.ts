import { existsSync, readdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";

import { getInstalledVersion } from "../lib/statusline.js";
import { readJson } from "../lib/json.js";
import {
  claudeSettingsPath,
  devStatePath,
  globalConfigPath,
  localConfigPath,
} from "../lib/paths.js";
import { getExistingRules } from "../lib/permissions.js";
import { isPluginDisabled, detectPluginScope } from "../lib/plugin-state.js";
import { resolveMemoryDir } from "../lib/config.js";
import { getLibPath } from "../lib/lib-path.js";
import {
  semverCompare,
  getLatestVersion,
  getCliVersion,
  getLatestCliVersion,
} from "./update.js";

const VERSION_COL = 11;
const CONFIG_KEY_COL = 16;
const CONFIG_SUB_COL = 16;

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

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return String(value);
}

function pad(
  label: string,
  width: number,
  color?: (s: string) => string,
): string {
  const displayed = color ? color(label) : label;
  return `  ${displayed}${" ".repeat(Math.max(1, width - label.length))}`;
}

/**
 * Print a single sub-property line with indentation.
 */
function subLine(
  key: string,
  value: string,
  overrides: string,
  color?: (s: string) => string,
): void {
  const displayed = color ? color(key) : key;
  console.log(
    `    ${displayed}${" ".repeat(Math.max(1, CONFIG_SUB_COL - key.length))}${value}${overrides}`,
  );
}

/**
 * Print a config object grouped by top-level keys.
 * Top-level scalars: `  key  value`
 * Top-level objects: `  key` header, then indented sub-properties.
 * Special: learn.categories → comma-separated names only.
 * Special: arrays of primitives → comma-separated.
 */
function printConfig(
  obj: Record<string, unknown>,
  otherConfig: Record<string, unknown> | null,
): void {
  for (const [key, value] of Object.entries(obj)) {
    const overrides =
      otherConfig && key in otherConfig
        ? ` ${chalk.yellow("(overrides global)")}`
        : "";

    // Nested objects → group header + indented sub-properties
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      console.log(pad(key, CONFIG_KEY_COL, chalk.cyan) + chalk.dim("─") + overrides);
      const nested = value as Record<string, unknown>;
      const nestedOther =
        otherConfig && typeof otherConfig[key] === "object"
          ? (otherConfig[key] as Record<string, unknown>)
          : null;
      for (const [subKey, subVal] of Object.entries(nested)) {
        const subOverrides =
          nestedOther && subKey in nestedOther
            ? ` ${chalk.yellow("(overrides global)")}`
            : "";

        // Special: categories → names only
        if (subKey === "categories" && Array.isArray(subVal)) {
          const names = subVal
            .map((c: unknown) =>
              typeof c === "object" && c !== null && "name" in c
                ? (c as { name: string }).name
                : String(c),
            )
            .join(", ");
          subLine(subKey, names, subOverrides, chalk.cyan);
          continue;
        }

        // Sub-level nested objects → flatten inline
        if (
          typeof subVal === "object" &&
          subVal !== null &&
          !Array.isArray(subVal)
        ) {
          const innerEntries = Object.entries(
            subVal as Record<string, unknown>,
          );
          const inline = innerEntries
            .map(([k, v]) => `${k}: ${formatScalar(v)}`)
            .join(", ");
          subLine(subKey, inline, subOverrides, chalk.cyan);
          continue;
        }

        // Arrays → comma-separated
        if (Array.isArray(subVal)) {
          subLine(
            subKey,
            subVal.map((v) => formatScalar(v)).join(", "),
            subOverrides,
            chalk.cyan,
          );
          continue;
        }

        subLine(subKey, formatScalar(subVal), subOverrides, chalk.cyan);
      }
      continue;
    }

    // Top-level arrays → comma-separated
    if (Array.isArray(value)) {
      console.log(
        `${pad(key, CONFIG_KEY_COL, chalk.cyan)}${value.map((v) => formatScalar(v)).join(", ")}${overrides}`,
      );
      continue;
    }

    // Top-level scalars
    console.log(
      `${pad(key, CONFIG_KEY_COL, chalk.cyan)}${formatScalar(value)}${overrides}`,
    );
  }
}

function versionLine(
  label: string,
  current: string,
  latest: string | null,
): string {
  const padded = pad(label, VERSION_COL);
  if (!latest) {
    return `${padded}${current} ${chalk.dim("(latest unavailable)")}`;
  }
  const cmp = semverCompare(current, latest);
  const indicator =
    cmp >= 0 ? chalk.green("✔ up to date") : chalk.yellow("⚠ update available");
  return `${padded}${current} → ${latest} ${indicator}`;
}

export async function statusCommand(): Promise<void> {
  // ─── Versions ────────────────────────────────────────────────────
  const pluginVersion = getInstalledVersion();
  const latestPlugin = getLatestVersion();
  const cliVersion = getCliVersion();
  const latestCli = getLatestCliVersion();

  console.log();
  console.log(chalk.bold("📦 Versions"));

  if (pluginVersion) {
    console.log(versionLine("Plugin", pluginVersion, latestPlugin));
  } else {
    console.log(`${pad("Plugin", VERSION_COL)}${chalk.dim("not installed")}`);
  }

  console.log(versionLine("CLI", cliVersion, latestCli));

  // ─── Plugin ──────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold("🔧 Plugin"));

  // Scope detection: check highest-priority scope with plugin config
  const detectedScope = detectPluginScope();
  console.log(`${pad("Scope", VERSION_COL)}${detectedScope}`);

  // Enabled/disabled
  const disabled = isPluginDisabled(detectedScope);
  console.log(
    `${pad("Status", VERSION_COL)}${disabled ? chalk.yellow("disabled") : chalk.green("enabled")}`,
  );

  // Auto-update
  try {
    const claudeSettings =
      readJson<Record<string, unknown>>(claudeSettingsPath());
    const marketplaces = claudeSettings?.extraKnownMarketplaces as
      | Record<string, Record<string, unknown>>
      | undefined;
    const autoUpdate =
      marketplaces?.["coding-friend-marketplace"]?.autoUpdate === true;
    console.log(
      `${pad("Auto-update", VERSION_COL)}${autoUpdate ? chalk.green("on") : chalk.dim("off")}`,
    );
  } catch {
    console.log(`${pad("Auto-update", VERSION_COL)}${chalk.dim("unknown")}`);
  }

  // Dev mode
  const devState = readJson<{ localPath: string }>(devStatePath());
  console.log(
    `${pad("Dev mode", VERSION_COL)}${devState ? chalk.cyan("on") : chalk.dim("off")}`,
  );

  // Permissions
  const rules = getExistingRules(claudeSettingsPath());
  console.log(
    `${pad("Permissions", VERSION_COL)}${rules.length} rules ${chalk.dim('→ Run "cf permission" for details')}`,
  );

  // ─── Memory ──────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold("🧠 Memory"));

  const memoryDir = resolveMemoryDir();
  const docCount = countMdFiles(memoryDir);

  let tierLabel = chalk.dim("unavailable");
  let daemonLabel = chalk.dim("unavailable");

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

      if (sqliteAvailable) {
        tierLabel = chalk.cyan("Tier 1 (SQLite + Hybrid)");
      } else if (running) {
        tierLabel = chalk.cyan("Tier 2 (MiniSearch + Daemon)");
      } else {
        tierLabel = chalk.cyan("Tier 3 (Markdown)");
      }

      if (running) {
        const info = getDaemonInfo();
        if (info) {
          const uptime = (Date.now() - info.startedAt) / 1000;
          daemonLabel = `${chalk.green("running")} (PID ${info.pid}, uptime ${formatUptime(uptime)}) ${chalk.dim('→ "cf memory stop-daemon" to stop')}`;
        } else {
          daemonLabel = `${chalk.green("running")} ${chalk.dim('→ "cf memory stop-daemon" to stop')}`;
        }
      } else {
        daemonLabel = `${chalk.dim("stopped")} ${chalk.dim('→ "cf memory start-daemon" to start')}`;
      }
    }
  } catch {
    // cf-memory not built or not available — keep defaults
  }

  console.log(`${pad("Tier", VERSION_COL)}${tierLabel}`);
  console.log(`${pad("Daemon", VERSION_COL)}${daemonLabel}`);
  console.log(`${pad("Documents", VERSION_COL)}${docCount} files`);
  console.log(chalk.dim(`  → Run "cf memory status" for details`));

  // ─── Config ──────────────────────────────────────────────────────
  const globalConfig = readJson<Record<string, unknown>>(globalConfigPath());
  const localConfig = readJson<Record<string, unknown>>(localConfigPath());

  if (globalConfig && Object.keys(globalConfig).length > 0) {
    console.log();
    console.log(chalk.bold(`⚙️ Config (global: ${globalConfigPath()})`));
    printConfig(globalConfig, null);
  }

  if (localConfig && Object.keys(localConfig).length > 0) {
    console.log();
    console.log(chalk.bold(`⚙️ Config (local: ${localConfigPath()})`));
    printConfig(localConfig, globalConfig);
  }

  console.log();
}
