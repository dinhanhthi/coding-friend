import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { log, printBanner } from "../lib/log.js";
import { commandExists } from "../lib/exec.js";
import { ALL_COMPONENT_IDS } from "../types.js";
import {
  findStatuslineHookPath,
  selectStatuslineComponents,
  saveStatuslineConfig,
  writeStatuslineSettings,
  isStatuslineConfigured,
} from "../lib/statusline.js";

export async function statuslineCommand(): Promise<void> {
  printBanner("✨ Coding Friend Statusline ✨");
  console.log();

  // Step 1: Find plugin path
  const result = findStatuslineHookPath();

  if (!result) {
    log.error(
      "coding-friend plugin not found in cache. Install it first via Claude Code.",
    );
    return;
  }

  log.info(`Found plugin ${chalk.green(`v${result.version}`)}`);

  // Step 2: Check existing statusline config
  if (isStatuslineConfigured()) {
    log.warn("Statusline already configured.");
    const overwrite = await confirm({
      message: "Reconfigure statusline?",
      default: true,
    });
    if (!overwrite) {
      log.dim("Skipped.");
      return;
    }
  }

  // Step 3: Select components
  const components = await selectStatuslineComponents();

  // Warn about missing dependencies
  if (components.includes("rate_limit")) {
    const missing: string[] = [];
    if (!commandExists("curl")) missing.push("curl");
    if (!commandExists("jq")) missing.push("jq");
    if (missing.length > 0) {
      log.warn(
        `Rate limit requires ${missing.join(" & ")}. Install them first, or the statusline will show a warning instead.`,
      );
    }
  }
  if (
    components.includes("account") &&
    !components.includes("rate_limit") &&
    !commandExists("jq")
  ) {
    log.warn(
      "Account info requires jq. Install it first, or the statusline will skip account info.",
    );
  }

  // Step 4: Save config + write settings
  saveStatuslineConfig(components);
  writeStatuslineSettings(result.hookPath);

  // Step 5: Confirm
  log.success("Statusline configured!");
  log.dim("Restart Claude Code (or start a new session) to see it.");
  if (components.length < ALL_COMPONENT_IDS.length) {
    log.dim(`Showing: ${components.join(", ")}`);
  } else {
    log.dim("Showing all components.");
  }
}
