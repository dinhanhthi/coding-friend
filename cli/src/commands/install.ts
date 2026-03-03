import { run, commandExists } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { isMarketplaceRegistered } from "../lib/plugin-state.js";
import {
  getInstalledVersion,
  getLatestVersion,
  semverCompare,
} from "./update.js";
import chalk from "chalk";

export async function installCommand(): Promise<void> {
  console.log("=== 🌿 Coding Friend Install 🌿 ===");
  console.log();

  // Step 1: Check claude CLI
  if (!commandExists("claude")) {
    log.error(
      "Claude CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code/getting-started",
    );
    process.exit(1);
  }

  // Step 2: Check marketplace
  if (isMarketplaceRegistered()) {
    log.success("Marketplace already registered.");
  } else {
    log.step("Adding coding-friend marketplace...");
    const result = run("claude", [
      "plugin",
      "marketplace",
      "add",
      "dinhanhthi/coding-friend",
    ]);
    if (result === null) {
      log.error(
        "Failed to add marketplace. Try manually: claude plugin marketplace add dinhanhthi/coding-friend",
      );
      process.exit(1);
    }
    log.success("Marketplace added.");
  }

  // Step 3: Check plugin installation
  const installedVersion = getInstalledVersion();

  if (!installedVersion) {
    log.step("Installing plugin...");
    const result = run("claude", [
      "plugin",
      "install",
      "coding-friend@coding-friend-marketplace",
    ]);
    if (result === null) {
      log.error(
        "Failed to install plugin. Try manually: claude plugin install coding-friend@coding-friend-marketplace",
      );
      process.exit(1);
    }
    log.success("Plugin installed!");
  } else {
    log.success(
      `Plugin already installed (${chalk.green(`v${installedVersion}`)}).`,
    );

    // Check for updates
    const latestVersion = getLatestVersion();
    if (latestVersion) {
      const cmp = semverCompare(installedVersion, latestVersion);
      if (cmp < 0) {
        log.warn(
          `Update available: ${chalk.yellow(`v${installedVersion}`)} → ${chalk.green(`v${latestVersion}`)}. Run ${chalk.cyan("cf update")} to update.`,
        );
      } else {
        log.success("Already on the latest version.");
      }
    } else {
      log.dim("Could not check for updates (no network or GitHub rate limit).");
    }
  }

  // Step 4: Next steps
  console.log();
  log.info("Next steps:");
  log.dim(
    `  ${chalk.cyan("cf init")}         Initialize workspace (docs folders, config)`,
  );
  log.dim(`  ${chalk.cyan("cf statusline")}   Setup statusline in Claude Code`);
  console.log();
  log.dim("Restart Claude Code (or start a new session) to use the plugin.");
}
