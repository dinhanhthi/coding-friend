import { existsSync, readdirSync } from "fs";
import { readJson, writeJson } from "../lib/json.js";
import { claudeSettingsPath, pluginCachePath } from "../lib/paths.js";
import { log } from "../lib/log.js";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";

function findLatestVersion(cachePath: string): string | null {
  if (!existsSync(cachePath)) return null;
  const versions = readdirSync(cachePath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  return versions[0] ?? null;
}

export async function statuslineCommand(): Promise<void> {
  console.log("=== 🌿 Coding Friend Statusline 🌿 ===");
  console.log();

  // Step 1: Find plugin path
  const cachePath = pluginCachePath();
  const version = findLatestVersion(cachePath);

  if (!version) {
    log.error(
      "coding-friend plugin not found in cache. Install it first via Claude Code.",
    );
    return;
  }

  const hookPath = `${cachePath}/${version}/hooks/statusline.sh`;
  if (!existsSync(hookPath)) {
    log.error(`Statusline hook not found: ${hookPath}`);
    return;
  }

  log.info(`Found plugin ${chalk.green(`v${version}`)}`);

  // Step 2: Read current settings
  const settingsPath = claudeSettingsPath();
  const settings = readJson<Record<string, unknown>>(settingsPath) ?? {};

  const existing = settings.statusLine as
    | { command?: string }
    | undefined;
  if (existing?.command) {
    log.warn(`Statusline already configured: ${existing.command}`);
    const overwrite = await confirm({
      message: "Overwrite existing statusline config?",
      default: true,
    });
    if (!overwrite) {
      log.dim("Skipped.");
      return;
    }
  }

  // Step 3: Update
  settings.statusLine = {
    type: "command",
    command: `bash ${hookPath}`,
  };
  writeJson(settingsPath, settings);

  // Step 4: Confirm
  log.success("Statusline configured!");
  log.dim("Restart Claude Code (or start a new session) to see it.");
  log.dim("Shows: plugin name, active model, and git branch.");
}
