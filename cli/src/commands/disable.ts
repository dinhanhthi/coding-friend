import chalk from "chalk";
import { log } from "../lib/log.js";
import { isPluginDisabled, setPluginEnabled } from "../lib/plugin-state.js";
import { resolveScope, type ScopeFlags } from "../lib/prompt-utils.js";

export async function disableCommand(opts: ScopeFlags = {}): Promise<void> {
  // Step 1: Resolve scope
  const scope = await resolveScope(
    opts,
    "Where should Coding Friend be disabled?",
  );

  // Step 4: Check if already disabled
  if (isPluginDisabled(scope)) {
    log.info(
      `Coding Friend is already disabled at ${chalk.cyan(scope)} scope.`,
    );
    return;
  }

  // Step 5: Disable
  log.step(`Disabling plugin (${chalk.cyan(scope)} scope)...`);
  setPluginEnabled(scope, false);

  log.success(`Coding Friend disabled at ${chalk.cyan(scope)} scope.`);
  log.dim("Restart Claude Code for the change to take effect.");
  log.dim(
    `Run ${chalk.bold(`cf enable --${scope}`)} to re-enable.`,
  );
}
