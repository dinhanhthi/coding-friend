import { existsSync, rmSync } from "fs";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { readJson, writeJson } from "../lib/json.js";
import {
  claudeSettingsPath,
  devStatePath,
  globalConfigDir,
  marketplaceCachePath,
  marketplaceClonePath,
} from "../lib/paths.js";
import { run, commandExists } from "../lib/exec.js";
import { log } from "../lib/log.js";
import {
  hasShellCompletion,
  removeShellCompletion,
} from "../lib/shell-completion.js";
import {
  isPluginInstalled,
  isMarketplaceRegistered,
} from "../lib/plugin-state.js";

const MARKETPLACE_NAME = "coding-friend-marketplace";
const PLUGIN_NAME = "coding-friend";
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

function hasStatuslineReference(): boolean {
  const settings = readJson<Record<string, unknown>>(claudeSettingsPath());
  if (!settings) return false;
  const statusLine = settings.statusLine as { command?: string } | undefined;
  return !!statusLine?.command?.includes(PLUGIN_NAME);
}

function removeStatuslineReference(): boolean {
  const settingsPath = claudeSettingsPath();
  const settings = readJson<Record<string, unknown>>(settingsPath);
  if (!settings) return false;

  const statusLine = settings.statusLine as { command?: string } | undefined;
  if (!statusLine?.command?.includes(PLUGIN_NAME)) return false;

  delete settings.statusLine;
  writeJson(settingsPath, settings);
  return true;
}

interface DetectionResult {
  pluginInstalled: boolean;
  marketplaceRegistered: boolean;
  cacheExists: boolean;
  cloneExists: boolean;
  statuslineConfigured: boolean;
  shellCompletionExists: boolean;
  globalConfigExists: boolean;
  devModeActive: boolean;
}

function detect(): DetectionResult {
  return {
    pluginInstalled: isPluginInstalled(),
    marketplaceRegistered: isMarketplaceRegistered(),
    cacheExists: existsSync(marketplaceCachePath()),
    cloneExists: existsSync(marketplaceClonePath()),
    statuslineConfigured: hasStatuslineReference(),
    shellCompletionExists: hasShellCompletion(),
    globalConfigExists: existsSync(globalConfigDir()),
    devModeActive: existsSync(devStatePath()),
  };
}

function displayDetection(d: DetectionResult): void {
  const check = (v: boolean) => (v ? chalk.green("✔") : chalk.dim("–"));

  console.log();
  console.log("  Detected components:");
  console.log(`    ${check(d.pluginInstalled)} Plugin registration`);
  console.log(`    ${check(d.marketplaceRegistered)} Marketplace registration`);
  console.log(`    ${check(d.cacheExists)} Plugin cache`);
  console.log(`    ${check(d.cloneExists)} Marketplace clone`);
  console.log(`    ${check(d.statuslineConfigured)} Statusline reference`);
  console.log(`    ${check(d.shellCompletionExists)} Shell tab completion`);
  console.log(
    `    ${check(d.globalConfigExists)} Global config (~/.coding-friend/)`,
  );
  console.log();
}

function nothingToRemove(d: DetectionResult): boolean {
  return (
    !d.pluginInstalled &&
    !d.marketplaceRegistered &&
    !d.cacheExists &&
    !d.cloneExists &&
    !d.statuslineConfigured &&
    !d.shellCompletionExists &&
    !d.globalConfigExists
  );
}

export async function uninstallCommand(): Promise<void> {
  console.log(`\n=== 👋 ${chalk.red("Coding Friend Uninstall")} 👋 ===`);

  // Check claude CLI
  if (!commandExists("claude")) {
    log.error("Claude CLI not found. Cannot uninstall plugin without it.");
    log.dim(
      "Install Claude CLI first: https://docs.anthropic.com/en/docs/claude-code",
    );
    return;
  }

  // Detect dev mode
  const detection = detect();

  if (detection.devModeActive) {
    log.warn("Dev mode is currently active.");
    log.dim(`Run ${chalk.bold("cf dev off")} first, then try again.`);
    return;
  }

  if (nothingToRemove(detection)) {
    log.info("Nothing to uninstall — Coding Friend is not installed.");
    return;
  }

  // Display what will be removed
  displayDetection(detection);

  // Ask for confirmation
  const proceed = await confirm({
    message: "This will remove Coding Friend from Claude Code. Continue?",
    default: false,
  });

  if (!proceed) {
    log.info("Uninstall cancelled.");
    return;
  }

  // Ask about global config
  let removeConfig = false;
  if (detection.globalConfigExists) {
    removeConfig = await confirm({
      message:
        "Also remove ~/.coding-friend/ config directory? (global config, custom skills)",
      default: false,
    });
  }

  console.log();

  // Execute removal in order
  let errors = 0;

  // 1. Uninstall plugin
  if (detection.pluginInstalled) {
    log.step("Uninstalling plugin...");
    const result = run("claude", ["plugin", "uninstall", PLUGIN_ID]);
    if (result === null) {
      // Try without marketplace qualifier
      const fallback = run("claude", ["plugin", "uninstall", PLUGIN_NAME]);
      if (fallback === null) {
        log.warn(
          "Could not uninstall plugin via CLI (may already be removed).",
        );
        errors++;
      }
    }
  }

  // 2. Remove marketplace
  if (detection.marketplaceRegistered) {
    log.step("Removing marketplace...");
    const result = run("claude", [
      "plugin",
      "marketplace",
      "remove",
      MARKETPLACE_NAME,
    ]);
    if (result === null) {
      log.warn(
        "Could not remove marketplace via CLI (may already be removed).",
      );
      errors++;
    }
  }

  // 3. Remove cache directory
  if (detection.cacheExists) {
    log.step("Removing plugin cache...");
    try {
      rmSync(marketplaceCachePath(), { recursive: true, force: true });
    } catch {
      log.warn("Could not remove plugin cache directory.");
      errors++;
    }
  }

  // 4. Remove marketplace clone directory
  if (detection.cloneExists) {
    log.step("Removing marketplace clone...");
    try {
      rmSync(marketplaceClonePath(), { recursive: true, force: true });
    } catch {
      log.warn("Could not remove marketplace clone directory.");
      errors++;
    }
  }

  // 5. Clean statusline
  if (detection.statuslineConfigured) {
    log.step("Cleaning statusline...");
    if (!removeStatuslineReference()) {
      log.warn("Could not clean statusline from settings.");
      errors++;
    }
  }

  // 6. Remove shell completion
  if (detection.shellCompletionExists) {
    log.step("Removing shell completion...");
    if (!removeShellCompletion()) {
      log.warn("Could not remove shell completion.");
      errors++;
    }
  }

  // 7. Remove global config (if user opted in)
  if (removeConfig) {
    log.step("Removing global config...");
    try {
      rmSync(globalConfigDir(), { recursive: true, force: true });
    } catch {
      log.warn("Could not remove ~/.coding-friend/ directory.");
      errors++;
    }
  }

  // Summary
  console.log();
  if (errors === 0) {
    log.success("Coding Friend has been completely uninstalled.");
  } else {
    log.warn(`Uninstalled with ${errors} warning(s). Check messages above.`);
  }

  if (!removeConfig && detection.globalConfigExists) {
    log.dim("Global config kept at ~/.coding-friend/");
  }

  console.log();
  log.dim("Restart Claude Code to complete the uninstall.");
}
