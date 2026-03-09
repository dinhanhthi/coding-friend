import { existsSync } from "fs";
import { run, commandExists } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { devStatePath } from "../lib/paths.js";
import {
  isMarketplaceRegistered,
  isPluginDisabled,
} from "../lib/plugin-state.js";
import { resolveScope, type ScopeFlags } from "../lib/prompt-utils.js";
import { ensureShellCompletion } from "../lib/shell-completion.js";
import { getInstalledVersion } from "../lib/statusline.js";
import { getLatestVersion, semverCompare } from "./update.js";
import chalk from "chalk";

export async function installCommand(opts: ScopeFlags = {}): Promise<void> {
  console.log("=== 🌿 Coding Friend Install 🌿 ===");
  console.log();

  // Step 1: Check claude CLI
  if (!commandExists("claude")) {
    log.error(
      "Claude CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code/getting-started",
    );
    process.exit(1);
  }

  // Step 2: Check dev mode (installing marketplace plugin would conflict)
  if (existsSync(devStatePath())) {
    log.warn("Dev mode is currently active.");
    log.dim(
      `Run ${chalk.bold("cf dev off")} first, then install. Or use ${chalk.bold("cf dev sync")} to update the dev plugin.`,
    );
    return;
  }

  // Step 3: Resolve scope
  const scope = await resolveScope(opts);

  // Step 4: Check marketplace (always global — no --scope support)
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

  // Step 5: Install plugin at the resolved scope
  // For non-user scopes, always run install (getInstalledVersion only checks global state)
  const installedVersion = getInstalledVersion();

  if (!installedVersion || scope !== "user") {
    log.step(`Installing plugin (${chalk.cyan(scope)} scope)...`);
    const result = run("claude", [
      "plugin",
      "install",
      "coding-friend@coding-friend-marketplace",
      "--scope",
      scope,
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

    // Check if disabled
    if (isPluginDisabled(scope)) {
      log.warn(
        `Plugin is installed but disabled at ${chalk.cyan(scope)} scope. Run ${chalk.bold(`cf enable --${scope}`)} to re-enable.`,
      );
    }

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

  // Step 6: Shell completion
  ensureShellCompletion({ silent: false });

  // Step 7: Next steps
  console.log();
  log.info("Next steps:");
  console.log(
    `  ${chalk.cyan("cf init")}         Initialize workspace (docs folders, config)`,
  );
  console.log(
    `  ${chalk.cyan("cf statusline")}   Setup statusline in Claude Code to show more real-time info`,
  );
  console.log();
  log.dim("Restart Claude Code (or start a new session) to use the plugin.");
}
