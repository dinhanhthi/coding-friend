import { select, Separator } from "@inquirer/prompts";
import { existsSync } from "fs";
import chalk from "chalk";
import { run } from "./exec.js";
import { readJson } from "./json.js";
import { log } from "./log.js";
import { globalConfigPath, localConfigPath } from "./paths.js";

export const BACK = "__back__";

/**
 * Inject a separator + "Back" (or custom label) at the bottom of select choices.
 */
export function injectBackChoice<T extends string>(
  choices: Array<{ name: string; value: T; description?: string }>,
  label = "Back",
): Array<{ name: string; value: T | typeof BACK; description?: string } | Separator> {
  return [
    ...choices,
    new Separator(),
    { name: label, value: BACK as T | typeof BACK },
  ];
}

/**
 * Ask scope: "Save to: Global / Local / Back"
 * Returns 'global' | 'local' | 'back'.
 */
export async function askScope(
  label = "Save to:",
): Promise<"global" | "local" | "back"> {
  return select({
    message: label,
    choices: [
      { name: "Global (all projects)", value: "global" as const },
      { name: "This project only", value: "local" as const },
      new Separator(),
      { name: "Back", value: "back" as const },
    ],
  });
}

/**
 * Print hint about config file locations.
 */
export function showConfigHint(): void {
  console.log(chalk.dim("Config files:"));
  console.log(chalk.dim("  Global: ~/.coding-friend/config.json"));
  console.log(chalk.dim("  Local:  .coding-friend/config.json (this project)"));
  console.log(chalk.dim("Local overrides global at property level."));
  console.log();
  console.log(
    `  ${chalk.yellow("[-]")}      ${chalk.dim("not set anywhere")}`,
  );
  console.log(
    `  ${chalk.blue("[global]")}  ${chalk.dim("set in global config only")}`,
  );
  console.log(
    `  ${chalk.green("[local]")}   ${chalk.dim("set in this project only")}`,
  );
  console.log(
    `  ${chalk.cyan("[both]")}    ${chalk.dim("set in both places — local value takes effect")}`,
  );
  console.log();
}

/**
 * Get the scope label for a config key.
 * Returns 'both' | 'global' | 'local' | '-'.
 */
export function getScopeLabel(
  key: string,
  globalCfg: object | null,
  localCfg: object | null,
): string {
  const inGlobal = globalCfg
    ? (globalCfg as Record<string, unknown>)[key] !== undefined
    : false;
  const inLocal = localCfg
    ? (localCfg as Record<string, unknown>)[key] !== undefined
    : false;
  if (inGlobal && inLocal) return "both";
  if (inGlobal) return "global";
  if (inLocal) return "local";
  return "-";
}

/**
 * Format a scope label with color for display.
 */
export function formatScopeLabel(scope: string): string {
  if (scope === "-") return chalk.yellow("[-]");
  if (scope === "both") return chalk.cyan("[both]");
  if (scope === "global") return chalk.blue("[global]");
  if (scope === "local") return chalk.green("[local]");
  return `[${scope}]`;
}

/**
 * Get the merged value for a config key (local overrides global at top level).
 */
export function getMergedValue(
  key: string,
  globalCfg: object | null,
  localCfg: object | null,
): unknown {
  const localVal = localCfg
    ? (localCfg as Record<string, unknown>)[key]
    : undefined;
  if (localVal !== undefined) return localVal;
  return globalCfg ? (globalCfg as Record<string, unknown>)[key] : undefined;
}

function createSubfolders(docsDir: string, subfolders: string[]): void {
  const created: string[] = [];
  for (const sub of subfolders) {
    const p = `${docsDir}/${sub}`;
    if (!existsSync(p)) {
      run("mkdir", ["-p", p]);
      created.push(sub);
    }
  }
  if (created.length > 0) {
    log.success(`Created subfolders: ${created.map((s) => `${docsDir}/${s}`).join(", ")}`);
  }
}

/**
 * Handle docsDir folder rename/create after user picks a new name and scope.
 * If subfolders are provided, they are created inside the new docsDir.
 *
 * save to local:
 *   - old folder exists → rename it, then ensure subfolders
 *   - old folder doesn't exist → create new folder + subfolders
 *
 * save to global:
 *   - local docsDir is set → skip (project manages its own folder)
 *   - no local docsDir → check current global docsDir folder:
 *     - old global folder exists → rename it, then ensure subfolders
 *     - old global folder doesn't exist → create new folder + subfolders
 */
export function applyDocsDirChange(
  newValue: string,
  oldValue: string | undefined,
  scope: "global" | "local",
  subfolders: string[] = [],
): void {
  if (newValue === oldValue) return;

  if (scope === "local") {
    if (oldValue && existsSync(oldValue)) {
      if (existsSync(newValue)) {
        log.warn(`Folder "${newValue}" already exists — skipped rename.`);
      } else {
        run("mv", [oldValue, newValue]);
        log.success(`Renamed "${oldValue}" → "${newValue}"`);
        createSubfolders(newValue, subfolders);
      }
    } else if (!existsSync(newValue)) {
      run("mkdir", ["-p", newValue]);
      log.success(`Created "${newValue}"`);
      createSubfolders(newValue, subfolders);
    }
  } else {
    // global scope: skip if project has a local docsDir override
    const localCfg = readJson<{ docsDir?: string }>(localConfigPath());
    if (localCfg?.docsDir) return;

    // No local override — use current global docsDir as the "old" folder
    const globalCfg = readJson<{ docsDir?: string }>(globalConfigPath());
    const oldGlobalDir = globalCfg?.docsDir;

    if (oldGlobalDir && existsSync(oldGlobalDir)) {
      if (existsSync(newValue)) {
        log.warn(`Folder "${newValue}" already exists — skipped rename.`);
      } else {
        run("mv", [oldGlobalDir, newValue]);
        log.success(`Renamed "${oldGlobalDir}" → "${newValue}"`);
        createSubfolders(newValue, subfolders);
      }
    } else if (!existsSync(newValue)) {
      run("mkdir", ["-p", newValue]);
      log.success(`Created "${newValue}"`);
      createSubfolders(newValue, subfolders);
    }
  }
}
