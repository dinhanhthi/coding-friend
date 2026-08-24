import chalk from "chalk";
import {
  isCodexPluginDisabled,
  setCodexPluginEnabled,
} from "../lib/codex-config.js";
import { log } from "../lib/log.js";
import { setOmpAgentEnabled } from "../lib/omp-config.js";
import { isPluginDisabled, setPluginEnabled } from "../lib/plugin-state.js";
import {
  resolveHostFlags,
  resolveScope,
  type ScopeFlags,
} from "../lib/prompt-utils.js";

export async function enableCommand(opts: ScopeFlags = {}): Promise<void> {
  const { host } = resolveHostFlags(opts);
  if (host === "codex") {
    if (!isCodexPluginDisabled()) {
      log.info("Coding Friend is already enabled for Codex.");
      return;
    }

    log.step("Enabling Codex plugin...");
    setCodexPluginEnabled(true);
    log.success("Coding Friend enabled for Codex.");
    log.dim("Restart Codex CLI for the change to take effect.");
    return;
  }

  if (host === "omp") {
    const ompScope = opts.project || opts.local ? "project" : "user";
    if (!setOmpAgentEnabled(ompScope)) {
      log.info(
        `Coding Friend is already enabled for omp at ${chalk.cyan(ompScope)} scope.`,
      );
      return;
    }

    log.step(`Enabling omp agents (${chalk.cyan(ompScope)} scope)...`);
    log.success(
      `Coding Friend enabled for omp at ${chalk.cyan(ompScope)} scope.`,
    );
    log.dim("Restart omp for the change to take effect.");
    return;
  }

  // Step 1: Resolve scope
  const scope = await resolveScope(
    opts,
    "Where should Coding Friend be enabled?",
  );

  // Step 4: Check if already enabled
  if (!isPluginDisabled(scope)) {
    log.info(`Coding Friend is already enabled at ${chalk.cyan(scope)} scope.`);
    return;
  }

  // Step 5: Enable
  log.step(`Enabling plugin (${chalk.cyan(scope)} scope)...`);
  setPluginEnabled(scope, true);

  log.success(`Coding Friend enabled at ${chalk.cyan(scope)} scope.`);
  log.dim("Restart Claude Code for the change to take effect.");
}
