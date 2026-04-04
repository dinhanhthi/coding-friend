import {
  existsSync,
  unlinkSync,
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
} from "fs";
import { resolve, join } from "path";
import { homedir } from "os";
import { readJson, writeJson } from "../lib/json.js";
import {
  devStatePath,
  knownMarketplacesPath,
  pluginCachePath,
} from "../lib/paths.js";
import { run, commandExists } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import {
  isPluginInstalled,
  isMarketplaceRegistered,
} from "../lib/plugin-state.js";
import { ensureShellCompletion } from "../lib/shell-completion.js";
import { ensureStatusline } from "../lib/statusline.js";
import chalk from "chalk";

const REMOTE_URL = "https://github.com/dinhanhthi/coding-friend.git";
const MARKETPLACE_NAME = "coding-friend-marketplace";
const PLUGIN_NAME = "coding-friend";
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

interface DevState {
  localPath: string;
  savedAt: string;
}

function getDevState(): DevState | null {
  return readJson<DevState>(devStatePath());
}

function getLocalPluginVersion(localPath: string): string | null {
  const pluginJsonPath = resolve(
    localPath,
    "plugin",
    ".claude-plugin",
    "plugin.json",
  );
  const data = readJson<{ version?: string }>(pluginJsonPath);
  return data?.version ?? null;
}

function ensureClaude(): boolean {
  if (!commandExists("claude")) {
    log.error(
      "Claude CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code",
    );
    return false;
  }
  return true;
}

function runClaude(args: string[], label: string): boolean {
  log.step(label);
  const result = run("claude", args);
  if (result === null) {
    log.error(`Failed: claude ${args.join(" ")}`);
    return false;
  }
  return true;
}

export async function devOnCommand(path?: string): Promise<void> {
  const state = getDevState();
  if (state) {
    log.warn(`Dev mode is already ON (local: ${chalk.cyan(state.localPath)})`);
    log.dim(`Run ${chalk.bold("cf dev off")} first to switch back.`);
    return;
  }

  if (!ensureClaude()) return;

  const localPath = resolve(path || process.cwd());

  // Verify the path contains a coding-friend plugin
  if (
    !existsSync(resolve(localPath, "plugin", ".claude-plugin", "plugin.json"))
  ) {
    log.error(`No plugin/.claude-plugin/plugin.json found at ${localPath}`);
    log.dim("Make sure you point to the coding-friend repo root.");
    return;
  }

  const version = getLocalPluginVersion(localPath);
  const versionLabel = version ? ` (v${version})` : "";

  console.log();
  printBanner(`Switching to local dev mode${versionLabel}`, {
    color: chalk.green,
  });
  console.log();
  log.info(`Local path: ${chalk.cyan(localPath)}`);

  // Step 1: Uninstall remote plugin (if installed)
  if (isPluginInstalled()) {
    if (
      !runClaude(
        ["plugin", "uninstall", PLUGIN_ID],
        "Uninstalling remote plugin...",
      )
    ) {
      // Try without marketplace qualifier
      run("claude", ["plugin", "uninstall", PLUGIN_NAME]);
    }
  }

  // Step 2: Remove remote marketplace (if registered)
  if (isMarketplaceRegistered()) {
    runClaude(
      ["plugin", "marketplace", "remove", MARKETPLACE_NAME],
      "Removing remote marketplace...",
    );
  }

  // Step 3: Add local marketplace
  if (
    !runClaude(
      ["plugin", "marketplace", "add", localPath],
      "Adding local marketplace...",
    )
  ) {
    log.error("Failed to add local marketplace. Aborting.");
    return;
  }

  // Step 4: Install from local
  if (
    !runClaude(
      ["plugin", "install", PLUGIN_ID],
      "Installing plugin from local source...",
    )
  ) {
    // Try without marketplace qualifier
    if (!runClaude(["plugin", "install", PLUGIN_NAME], "Retrying install...")) {
      log.error("Failed to install local plugin.");
      return;
    }
  }

  // Step 5: Save state
  const devState: DevState = {
    localPath,
    savedAt: new Date().toISOString(),
  };
  writeJson(devStatePath(), devState as unknown as Record<string, unknown>);

  // Step 6: Ensure statusline and shell completion are up-to-date
  ensureStatusline();
  ensureShellCompletion({ silent: true });

  console.log();
  log.success(
    `Dev mode ${chalk.green("ON")} — using local plugin${versionLabel} from ${chalk.cyan(localPath)}`,
  );
  log.dim("Restart Claude Code to see changes.");
}

export async function devOffCommand(): Promise<void> {
  const state = getDevState();
  if (!state) {
    log.info("Dev mode is already OFF (using remote marketplace).");
    return;
  }

  if (!ensureClaude()) return;

  console.log();
  printBanner("Switching back to remote marketplace", {
    color: chalk.yellow,
  });
  console.log();

  // Step 1: Uninstall local plugin
  if (isPluginInstalled()) {
    if (
      !runClaude(
        ["plugin", "uninstall", PLUGIN_ID],
        "Uninstalling local plugin...",
      )
    ) {
      run("claude", ["plugin", "uninstall", PLUGIN_NAME]);
    }
  }

  // Step 2: Remove local marketplace
  if (isMarketplaceRegistered()) {
    runClaude(
      ["plugin", "marketplace", "remove", MARKETPLACE_NAME],
      "Removing local marketplace...",
    );
  }

  // Step 3: Add remote marketplace
  if (
    !runClaude(
      ["plugin", "marketplace", "add", REMOTE_URL],
      "Adding remote marketplace...",
    )
  ) {
    log.error("Failed to add remote marketplace.");
    return;
  }

  // Step 4: Install from remote
  if (
    !runClaude(
      ["plugin", "install", PLUGIN_ID],
      "Installing plugin from remote...",
    )
  ) {
    if (!runClaude(["plugin", "install", PLUGIN_NAME], "Retrying install...")) {
      log.error("Failed to install remote plugin.");
      return;
    }
  }

  // Step 5: Clean up state file
  try {
    unlinkSync(devStatePath());
  } catch {
    // ignore
  }

  console.log();
  log.success(`Dev mode ${chalk.yellow("OFF")} — using remote marketplace.`);
  log.dim("Restart Claude Code to see changes.");
}

interface MarketplaceEntry {
  source?: { source?: string; repo?: string; path?: string };
  installLocation?: string;
}

function getMarketplaceSource(): { type: string; location: string } | null {
  const data = readJson<Record<string, MarketplaceEntry>>(
    knownMarketplacesPath(),
  );
  if (!data || !(MARKETPLACE_NAME in data)) return null;
  const entry = data[MARKETPLACE_NAME];
  const src = entry.source;
  if (!src) return null;
  if (src.source === "directory" && src.path) {
    return { type: "local", location: src.path };
  }
  if (src.source === "github" && src.repo) {
    return { type: "remote", location: src.repo };
  }
  return null;
}

function copyDirRecursive(
  src: string,
  dest: string,
  fileCount = { n: 0 },
): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath, fileCount);
    } else {
      copyFileSync(srcPath, destPath);
      fileCount.n++;
    }
  }
}

export async function devSyncCommand(): Promise<void> {
  const state = getDevState();
  if (!state) {
    log.error("Dev mode is OFF. Run `cf dev on <path>` first.");
    return;
  }

  const localPath = state.localPath;
  const pluginSrcDir = join(localPath, "plugin");

  if (!existsSync(pluginSrcDir)) {
    log.error(
      `No plugin/ directory found at ${localPath}. Make sure you point to the coding-friend repo root.`,
    );
    return;
  }

  const cacheBase = pluginCachePath();

  // Find the cached version directory
  let cacheVersionDir: string | null = null;
  if (existsSync(cacheBase)) {
    const versions = readdirSync(cacheBase).filter((v) =>
      statSync(join(cacheBase, v)).isDirectory(),
    );
    if (versions.length > 0) {
      // Use the most recently modified version dir
      cacheVersionDir = join(
        cacheBase,
        versions.sort((a, b) => {
          return (
            statSync(join(cacheBase, b)).mtimeMs -
            statSync(join(cacheBase, a)).mtimeMs
          );
        })[0],
      );
    }
  }

  if (!cacheVersionDir) {
    log.error(
      "No cached plugin version found. Run `cf dev off && cf dev on` first.",
    );
    return;
  }

  const shortDest = cacheVersionDir.replace(homedir(), "~");
  log.step(`Syncing ${chalk.cyan(pluginSrcDir)} → ${chalk.dim(shortDest)}`);

  // Copy plugin/ contents directly into cache version dir
  const fileCount = { n: 0 };
  copyDirRecursive(pluginSrcDir, cacheVersionDir, fileCount);

  log.success(
    `Synced ${chalk.green(fileCount.n)} files. Restart Claude Code to apply changes.`,
  );
}

async function devReinstall(
  path: string | undefined,
  label: string,
): Promise<void> {
  const state = getDevState();

  if (!ensureClaude()) return;

  // Priority: explicit arg > saved state > cwd
  const localPath = path ?? state?.localPath;

  const version = localPath ? getLocalPluginVersion(localPath) : null;
  const bannerTitle = version ? `${label} (v${version})` : label;
  console.log();
  printBanner(bannerTitle, { color: chalk.cyan });
  console.log();

  // Turn off first (skip if already off)
  if (state) {
    await devOffCommand();
    console.log();
  } else {
    log.info("Dev mode was OFF — skipping off step.");
  }

  // Turn on with resolved path
  await devOnCommand(localPath);

  // Ensure shell completion is up-to-date
  ensureShellCompletion({ silent: true });
}

export const devRestartCommand = (path?: string) =>
  devReinstall(path, "Restarting dev mode");

export const devUpdateCommand = (path?: string) =>
  devReinstall(path, "Updating dev plugin");

export async function devStatusCommand(): Promise<void> {
  const state = getDevState();
  const source = getMarketplaceSource();
  const installed = isPluginInstalled();

  if (state) {
    log.info(`Dev mode: ${chalk.green("ON")}`);
    log.info(`Local path: ${chalk.cyan(state.localPath)}`);
    if (!existsSync(state.localPath)) {
      log.warn(
        `Dev mode path no longer exists: ${state.localPath}. Run 'cf host <new-path>' to update.`,
      );
    }
    log.dim(`Since: ${state.savedAt}`);
  } else {
    log.info(`Dev mode: ${chalk.yellow("OFF")}`);
  }

  console.log();
  if (source) {
    const label =
      source.type === "local"
        ? `${chalk.green("local")} → ${chalk.cyan(source.location)}`
        : `${chalk.blue("remote")} → ${source.location}`;
    log.info(`Marketplace source: ${label}`);
  } else {
    log.warn(`Marketplace "${MARKETPLACE_NAME}" not registered.`);
  }
  log.info(
    `Plugin installed: ${installed ? chalk.green("yes") : chalk.yellow("no")}`,
  );
}
