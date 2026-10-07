import chalk from "chalk";
import { semverCompare } from "./update.js";
import type { McpHealthResult } from "../lib/mcp-health.js";
import {
  collectLearnMcpHealth,
  collectMemoryMcpHealth,
} from "../lib/mcp-report.js";
import { runJson } from "../lib/output.js";
import {
  collectConfig,
  collectMemory,
  collectPlugin,
  collectStatus,
  collectVersions,
  type ConfigStatus,
  type MemoryStatus,
  type PluginStatus,
  type VersionsStatus,
} from "../lib/status-data.js";

const VERSION_COL = 11;
const CONFIG_KEY_COL = 16;
const CONFIG_SUB_COL = 16;

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
      console.log(
        pad(key, CONFIG_KEY_COL, chalk.cyan) + chalk.dim("─") + overrides,
      );
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
          subLine(subKey, names, subOverrides, chalk.blueBright);
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
          subLine(subKey, inline, subOverrides, chalk.blueBright);
          continue;
        }

        // Arrays → comma-separated
        if (Array.isArray(subVal)) {
          subLine(
            subKey,
            subVal.map((v) => formatScalar(v)).join(", "),
            subOverrides,
            chalk.blueBright,
          );
          continue;
        }

        subLine(subKey, formatScalar(subVal), subOverrides, chalk.blueBright);
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

function printVersions(v: VersionsStatus): void {
  console.log();
  console.log(chalk.bold("📦 Versions"));

  if (v.plugin.current) {
    console.log(versionLine("Plugin", v.plugin.current, v.plugin.latest));
  } else {
    console.log(`${pad("Plugin", VERSION_COL)}${chalk.dim("not installed")}`);
  }

  console.log(versionLine("CLI", v.cli.current, v.cli.latest));
}

function printPlugin(p: PluginStatus): void {
  console.log();
  console.log(chalk.bold("🔧 Plugin"));
  console.log(`${pad("Scope", VERSION_COL)}${p.scope}`);
  console.log(
    `${pad("Status", VERSION_COL)}${p.enabled ? chalk.green("enabled") : chalk.yellow("disabled")}`,
  );

  const autoUpdate =
    p.autoUpdate === "unknown"
      ? chalk.dim("unknown")
      : p.autoUpdate
        ? chalk.green("on")
        : chalk.dim("off");
  console.log(`${pad("Auto-update", VERSION_COL)}${autoUpdate}`);

  console.log(
    `${pad("Dev mode", VERSION_COL)}${p.devMode ? chalk.cyan("on") : chalk.dim("off")}`,
  );
  console.log(
    `${pad("Permissions", VERSION_COL)}${p.permissionRules} rules ${chalk.dim('→ Run "cf permission" for details')}`,
  );

  if (!p.antigravity) {
    console.log(
      `${pad("Antigravity", VERSION_COL)}${chalk.dim("not installed")}`,
    );
  } else {
    const versionPart = p.antigravity.version
      ? `v${p.antigravity.version} `
      : "";
    const enabledPart = p.antigravity.enabled
      ? chalk.green("enabled")
      : chalk.yellow("disabled");
    console.log(
      `${pad("Antigravity", VERSION_COL)}${versionPart}${enabledPart}  ${chalk.dim(p.antigravity.dir)}`,
    );
  }

  const devinState = p.devin;
  if (devinState.kind === "none") {
    console.log(`${pad("Devin", VERSION_COL)}${chalk.dim("not installed")}`);
  } else {
    const versionPart = devinState.version ? `v${devinState.version} ` : "";
    const kindColor =
      devinState.kind === "unknown" ? chalk.yellow : chalk.green;
    let detail = "";
    if (devinState.kind === "local" && devinState.path) {
      detail = devinState.path;
    } else if (devinState.kind === "github" && devinState.path) {
      detail = `${devinState.path}#${devinState.subdir ?? "?"}`;
    }
    console.log(
      `${pad("Devin", VERSION_COL)}${versionPart}${kindColor(`${devinState.kind} install`)}${detail ? `  ${chalk.dim(detail)}` : ""}`,
    );
  }
}

const TIER_LABELS = {
  1: "Tier 1 (SQLite + Hybrid)",
  2: "Tier 2 (MiniSearch + Daemon)",
  3: "Tier 3 (Markdown)",
} as const;

function daemonLabel(daemon: MemoryStatus["daemon"]): string {
  if (!daemon) return chalk.dim("unavailable");
  if (!daemon.running) {
    return `${chalk.dim("stopped")} ${chalk.dim('→ "cf memory start-daemon" to start')}`;
  }
  if (daemon.pid !== null && daemon.startedAt !== null) {
    const uptime = (Date.now() - daemon.startedAt) / 1000;
    return `${chalk.green("running")} (PID ${daemon.pid}, uptime ${formatUptime(uptime)}) ${chalk.dim('→ "cf memory stop-daemon" to stop')}`;
  }
  return `${chalk.green("running")} ${chalk.dim('→ "cf memory stop-daemon" to stop')}`;
}

function printMemory(m: MemoryStatus): void {
  console.log();
  console.log(chalk.bold("🧠 Memory"));
  const tierLabel = m.tier
    ? chalk.cyan(TIER_LABELS[m.tier])
    : chalk.dim("unavailable");
  console.log(`${pad("Tier", VERSION_COL)}${tierLabel}`);
  console.log(`${pad("Daemon", VERSION_COL)}${daemonLabel(m.daemon)}`);
  console.log(`${pad("Documents", VERSION_COL)}${m.documents} files`);
  console.log(chalk.dim(`  → Run "cf memory status" for details`));
}

function printHealthChecks(health: McpHealthResult): void {
  let hasIssues = false;
  for (const check of health.checks) {
    const indicator = check.ok
      ? chalk.green("✓")
      : check.warn
        ? chalk.yellow("⚠")
        : chalk.red("✗");
    const detail = !check.ok && check.detail ? `: ${check.detail}` : "";
    console.log(`    ${indicator} ${pad(check.label, 20)}${detail}`);
    if (!check.ok && !check.warn) hasIssues = true;
  }
  if (hasIssues) {
    console.log(chalk.dim(`    → Run "cf mcp" to fix`));
  }
}

/** Prints each MCP sub-section as soon as it is collected (keeps partial output on error). */
async function printMcp(): Promise<void> {
  console.log();
  console.log(chalk.bold("🔌 MCP"));

  try {
    console.log(chalk.dim("  Memory MCP (coding-friend-memory)"));
    printHealthChecks(await collectMemoryMcpHealth());

    console.log();

    console.log(chalk.dim("  Learn MCP (coding-friend-learn)"));
    printHealthChecks(await collectLearnMcpHealth());
  } catch {
    console.log(`${pad("MCP", VERSION_COL)}${chalk.dim("unavailable")}`);
  }
}

function printConfigSection(c: ConfigStatus): void {
  const globalConfig = c.global?.config ?? null;

  if (c.global && Object.keys(c.global.config).length > 0) {
    console.log();
    console.log(chalk.bold(`⚙️ Config (global: ${c.global.path})`));
    printConfig(c.global.config, null);
  }

  if (c.local && Object.keys(c.local.config).length > 0) {
    console.log();
    console.log(chalk.bold(`⚙️ Config (local: ${c.local.path})`));
    printConfig(c.local.config, globalConfig);
  }

  console.log();
}

export async function statusCommand(
  opts: { json?: boolean } = {},
): Promise<void> {
  if (opts.json) {
    await runJson(collectStatus);
    return;
  }

  console.log(chalk.dim("Loading status information…"));
  printVersions(collectVersions());
  printPlugin(collectPlugin());
  printMemory(await collectMemory());
  await printMcp();
  printConfigSection(collectConfig());
}
