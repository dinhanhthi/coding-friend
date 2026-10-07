import { existsSync } from "fs";
import { run, commandExists } from "../lib/exec.js";
import {
  checkAgyVersion,
  checkCodexVersion,
  checkDevinVersion,
  checkOmpVersion,
  type Host,
} from "../lib/host.js";
import { log, printBanner } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { agyPluginDir, devStatePath } from "../lib/paths.js";
import {
  deployAgyPlugin,
  resolveAgyPluginSource,
  setAgyPluginEnabled,
  validateAgyPlugin,
} from "../lib/agy-config.js";
import { reconcileDevinPlugin } from "../lib/devin-config.js";
import {
  deployCodexAgents,
  findCodexAgentSourceDir,
  isCodexMarketplaceRegistered,
  setCodexPluginEnabled,
} from "../lib/codex-config.js";
import { registerMemoryMcp } from "../lib/memory-mcp-register.js";
import { deployOmpAgents, writeOmpExtensionEntry } from "../lib/omp-config.js";
import {
  isMarketplaceRegistered,
  isPluginDisabled,
  enableMarketplaceAutoUpdate,
} from "../lib/plugin-state.js";
import {
  resolveHostFlags,
  resolveScope,
  type PluginScope,
  type ScopeFlags,
} from "../lib/prompt-utils.js";
import { ensureShellCompletion } from "../lib/shell-completion.js";
import { getInstalledVersion } from "../lib/statusline.js";
import { getLatestVersion, semverCompare } from "./update.js";
import chalk from "chalk";

export interface InstallOptions extends ScopeFlags {
  yes?: boolean;
  json?: boolean;
}

export interface InstallResult {
  host: Host;
  scope: PluginScope | null;
  pluginVersion: string | null;
  alreadyInstalled: boolean;
  disabled: boolean;
}

export async function installCommand(opts: InstallOptions = {}): Promise<void> {
  if (opts.json) {
    await runJson(() => runInstall(opts));
    return;
  }
  await runHuman(() => runInstall(opts));
}

/**
 * Install body shared by human and JSON mode. Expected failures throw
 * CliError (after logging); returns null only for the human dev-mode skip.
 */
export async function runInstall(
  opts: InstallOptions = {},
): Promise<InstallResult | null> {
  const host = resolveInstallHost(opts);
  if (host === "codex") return installCodexCommand();
  if (host === "omp") return installOmpCommand(opts);
  if (host === "agy") return installAgyCommand();
  if (host === "devin") return installDevinCommand();

  printBanner("✨ Coding Friend Install ✨");
  console.log();

  // Step 1: Check claude CLI
  if (!commandExists("claude")) {
    log.error(
      "Claude CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code/getting-started",
    );
    throw new CliError("NOT_FOUND", "Claude CLI not found");
  }

  // Step 2: Check dev mode (installing marketplace plugin would conflict)
  if (existsSync(devStatePath())) {
    log.warn("Dev mode is currently active.");
    log.dim(
      `Run ${chalk.bold("cf dev off")} first, then install. Or use ${chalk.bold("cf dev sync")} to update the dev plugin.`,
    );
    if (opts.json) {
      throw new CliError(
        "DEV_MODE_ACTIVE",
        "Dev mode is currently active. Run cf dev off first, then install.",
      );
    }
    return null;
  }

  // Step 3: Resolve scope
  const scope = await resolveInstallScope(opts);

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
      throw new CliError("COMMAND_FAILED", "Failed to add marketplace");
    }
    log.success("Marketplace added.");
  }

  // Step 5: Enable auto-update for the marketplace
  if (enableMarketplaceAutoUpdate()) {
    log.success("Auto-update enabled for coding-friend plugin.");
  } else {
    log.warn(
      `Cannot make plugin auto-update. Please enable it manually: ${chalk.cyan("https://cf.dinhanhthi.com/#install")}`,
    );
  }

  // Step 6: Install plugin at the resolved scope
  // For non-user scopes, always run install (getInstalledVersion only checks global state)
  const installedVersion = getInstalledVersion();
  const alreadyInstalled = !!installedVersion && scope === "user";
  let disabled = false;

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
      throw new CliError("COMMAND_FAILED", "Failed to install plugin");
    }
    log.success("Plugin installed!");
  } else {
    log.success(
      `Plugin already installed (${chalk.green(`v${installedVersion}`)}).`,
    );

    // Check if disabled
    disabled = isPluginDisabled(scope);
    if (disabled) {
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

  // Step 7: Shell completion
  ensureShellCompletion({ silent: false });

  // Step 8: Next steps
  console.log();
  log.info("Next steps:");
  console.log(
    `  ${chalk.cyan("cf init")}           Initialize workspace (docs folders, config)`,
  );
  console.log(
    `  ${chalk.cyan("cf memory init")}    Setup AI memory for the project (also available in ${chalk.cyan("cf init")})`,
  );
  console.log(
    `  ${chalk.cyan("cf statusline")}     Setup statusline in Claude Code to show more real-time info`,
  );
  console.log();
  log.dim("Restart Claude Code (or start a new session) to use the plugin.");

  return {
    host: "claude",
    scope,
    pluginVersion: installedVersion ?? getInstalledVersion(),
    alreadyInstalled,
    disabled,
  };
}

/** Host flags → host. A resolution error (thrown) becomes INVALID_ARGS. */
function resolveInstallHost(opts: InstallOptions): Host {
  try {
    return resolveHostFlags(opts).host;
  } catch (err) {
    throw new CliError(
      "INVALID_ARGS",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * JSON mode never calls resolveScope (it prompts or process.exits): flags are
 * resolved inline. Human mode keeps resolveScope unless --yes picks "user".
 */
async function resolveInstallScope(opts: InstallOptions): Promise<PluginScope> {
  const scopes = new Set<PluginScope>();
  if (opts.user || opts.global) scopes.add("user");
  if (opts.project) scopes.add("project");
  if (opts.local) scopes.add("local");

  if (opts.json) {
    if (scopes.size > 1) {
      throw new CliError(
        "INVALID_ARGS",
        "Only one scope flag can be used at a time: --user, --global, --project, or --local",
      );
    }
    if (scopes.size === 1) return [...scopes][0];
    if (opts.yes) return "user";
    throw new CliError(
      "INTERACTIVE_REQUIRED",
      "--json needs --yes or a scope flag (--user, --global, --project, --local)",
    );
  }

  if (opts.yes && scopes.size === 0) return "user";
  return resolveScope(opts);
}

function hostResult(
  host: Host,
  overrides: Partial<InstallResult> = {},
): InstallResult {
  return {
    host,
    scope: null,
    pluginVersion: null,
    alreadyInstalled: false,
    disabled: false,
    ...overrides,
  };
}

async function installCodexCommand(): Promise<InstallResult> {
  printBanner("✨ Coding Friend Codex Install ✨");
  console.log();

  if (!commandExists("codex")) {
    log.error(
      "Codex CLI not found. Install it first: https://developers.openai.com/codex",
    );
    throw new CliError("NOT_FOUND", "Codex CLI not found");
  }

  const version = checkCodexVersion();
  if (!version.ok) {
    log.error(
      `Codex CLI ${version.actual ? `v${version.actual}` : "version"} is unsupported. Coding Friend requires Codex CLI >= ${version.min}.`,
    );
    log.dim("Upgrade Codex, then rerun: cf install --agent codex");
    throw new CliError("COMMAND_FAILED", "Codex CLI version is unsupported");
  }

  if (isCodexMarketplaceRegistered()) {
    log.success("Codex marketplace already registered.");
  } else {
    log.step("Adding coding-friend Codex marketplace...");
    const result = run("codex", [
      "plugin",
      "marketplace",
      "add",
      "dinhanhthi/coding-friend",
    ]);
    if (result === null && !isCodexMarketplaceRegistered()) {
      log.error(
        "Failed to add Codex marketplace. Try manually: codex plugin marketplace add dinhanhthi/coding-friend",
      );
      throw new CliError("COMMAND_FAILED", "Failed to add Codex marketplace");
    }
    log.success("Codex marketplace registered.");
  }

  setCodexPluginEnabled(true);
  log.success("Codex plugin enablement recorded in ~/.codex/config.toml.");

  const agentSource = findCodexAgentSourceDir();
  if (agentSource) {
    const copied = deployCodexAgents(agentSource);
    log.success(`Deployed ${copied} Codex agent definition(s).`);
  } else {
    log.warn(
      "Codex agent TOMLs were not found locally yet. Install the plugin from Codex, then run cf init --agent codex to deploy project agents.",
    );
  }

  console.log();
  log.info("One manual Codex step remains:");
  console.log(
    `  ${chalk.cyan("codex")} → ${chalk.cyan("/plugins")} → install ${chalk.bold("coding-friend")}`,
  );
  log.dim(
    "Codex CLI v0.130.0 exposes marketplace registration but not scriptable plugin install.",
  );
  log.dim("Run cf update --agent codex for on-demand plugin updates.");
  return hostResult("codex");
}

const OMP_INSTALL_URL = "https://omp.sh/";
const OMP_INSTALL_HINT = `curl -fsSL ${OMP_INSTALL_URL}install | sh`;

async function installOmpCommand(
  opts: ScopeFlags = {},
): Promise<InstallResult> {
  printBanner("✨ Coding Friend omp Install (beta) ✨");
  console.log();

  if (!commandExists("omp")) {
    log.error(
      `omp CLI not found. Install it first: ${OMP_INSTALL_URL} (${OMP_INSTALL_HINT})`,
    );
    throw new CliError("NOT_FOUND", "omp CLI not found");
  }

  const version = checkOmpVersion();
  if (!version.ok) {
    log.error(
      `omp CLI ${version.actual ? `v${version.actual}` : "version"} is unsupported. Coding Friend requires omp CLI >= ${version.min}. Install or upgrade: ${OMP_INSTALL_URL} (${OMP_INSTALL_HINT})`,
    );
    throw new CliError("COMMAND_FAILED", "omp CLI version is unsupported");
  }

  const ompScope = opts.project || opts.local ? "project" : "user";

  const { deployed } = deployOmpAgents(ompScope);
  log.success(`Deployed ${deployed.length} omp agent definition(s).`);

  writeOmpExtensionEntry(ompScope);
  log.success("Wrote omp extension entry.");

  registerMemoryMcp("omp");

  console.log();
  log.success("Installed for omp (beta).");
  log.dim("Skills inherit from ~/.claude — no extra skill install needed.");
  log.dim("Restart omp (or start a new session) to pick up agents and MCP.");
  return hostResult("omp", { scope: ompScope });
}

const AGY_INSTALL_URL = "https://antigravity.google/";

async function installAgyCommand(): Promise<InstallResult> {
  printBanner("✨ Coding Friend Antigravity Install (beta) ✨");
  console.log();

  if (!commandExists("agy")) {
    log.error(`agy CLI not found. Install it first: ${AGY_INSTALL_URL}`);
    throw new CliError("NOT_FOUND", "agy CLI not found");
  }

  const version = checkAgyVersion();
  if (!version.ok) {
    log.error(
      `agy CLI ${version.actual ? `v${version.actual}` : "version"} is unsupported. Coding Friend requires agy CLI >= ${version.min}. Install or upgrade: ${AGY_INSTALL_URL}`,
    );
    throw new CliError("COMMAND_FAILED", "agy CLI version is unsupported");
  }

  try {
    const source = resolveAgyPluginSource();
    log.step(`Installing Antigravity plugin (${source.kind} source)...`);
    const { files } = deployAgyPlugin(source.path);
    log.success(`Deployed ${files} Antigravity plugin file(s).`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error(detail);
    throw new CliError("COMMAND_FAILED", detail);
  }

  registerMemoryMcp("agy");
  setAgyPluginEnabled(true);

  const validation = validateAgyPlugin(agyPluginDir());
  if (validation.stdout.trim()) {
    console.log(validation.stdout.trimEnd());
  }
  if (validation.status !== 0) {
    log.warn(
      "agy plugin validate reported issues. Plugin files are still installed.",
    );
  }

  console.log();
  log.success("Installed for Antigravity (beta).");
  log.dim(
    "Restart Antigravity (or start a new `agy` session) to pick up the plugin.",
  );
  log.dim(
    "Note: autoApprove in config enables Claude Code (LLM classifier), Antigravity, Codex, and Devin (deterministic rules).",
  );
  return hostResult("agy");
}

const DEVIN_INSTALL_URL = "https://devin.ai/";

async function installDevinCommand(): Promise<InstallResult> {
  printBanner("✨ Coding Friend Devin Install (beta) ✨");
  console.log();

  if (!commandExists("devin")) {
    log.error(`Devin CLI not found. Install it first: ${DEVIN_INSTALL_URL}`);
    throw new CliError("NOT_FOUND", "Devin CLI not found");
  }

  const version = checkDevinVersion();
  if (!version.ok) {
    log.error(
      `Devin CLI ${version.actual ? `v${version.actual}` : "version"} is unsupported. Coding Friend requires Devin CLI >= ${version.min}. Upgrade Devin, then rerun: cf install --devin`,
    );
    throw new CliError("COMMAND_FAILED", "Devin CLI version is unsupported");
  }

  let alreadyInstalled: boolean;
  try {
    // reconcileDevinPlugin checks `devin auth status` and that the target is
    // resolvable BEFORE touching any existing install.
    const action = await reconcileDevinPlugin({ allowReplace: true });
    alreadyInstalled = action === "unchanged";
    if (alreadyInstalled) {
      log.success("Devin plugin already installed (live --local link).");
    } else {
      log.success("Devin plugin installed.");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error(detail);
    throw new CliError("COMMAND_FAILED", detail);
  }

  // The memory MCP ships inside plugin-devin/.mcp.json — this only confirms
  // the registered state. Learn MCP needs a chosen dir, so it is registered
  // by `cf init --agent devin` instead.
  registerMemoryMcp("devin");

  console.log();
  log.success("Installed for Devin (beta).");
  log.dim(
    "Start a new Devin session to pick up the plugin, then try /coding-friend:cf-plan.",
  );
  return hostResult("devin", { alreadyInstalled });
}
