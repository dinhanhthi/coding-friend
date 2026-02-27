import { existsSync, unlinkSync, readdirSync, statSync, mkdirSync, copyFileSync } from "fs";
import { resolve, join } from "path";
import { readJson, writeJson } from "../lib/json.js";
import { devStatePath, knownMarketplacesPath, installedPluginsPath, pluginCachePath } from "../lib/paths.js";
import { run, commandExists } from "../lib/exec.js";
import { log } from "../lib/log.js";
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

function isPluginInstalled(): boolean {
  const data = readJson<Record<string, unknown>>(installedPluginsPath());
  if (!data) return false;
  const plugins = (data.plugins ?? data) as Record<string, unknown>;
  return Object.keys(plugins).some((k) => k.includes(PLUGIN_NAME));
}

function isMarketplaceRegistered(): boolean {
  const data = readJson<Record<string, unknown>>(knownMarketplacesPath());
  if (!data) return false;
  return MARKETPLACE_NAME in data;
}

function ensureClaude(): boolean {
  if (!commandExists("claude")) {
    log.error("Claude CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code");
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
  if (!existsSync(resolve(localPath, "plugin", ".claude-plugin", "plugin.json"))) {
    log.error(`No plugin/.claude-plugin/plugin.json found at ${localPath}`);
    log.dim("Make sure you point to the coding-friend repo root.");
    return;
  }

  console.log(`\n=== ${chalk.green("Switching to local dev mode")} ===\n`);
  log.info(`Local path: ${chalk.cyan(localPath)}`);

  // Step 1: Uninstall remote plugin (if installed)
  if (isPluginInstalled()) {
    if (!runClaude(["plugin", "uninstall", PLUGIN_ID], "Uninstalling remote plugin...")) {
      // Try without marketplace qualifier
      run("claude", ["plugin", "uninstall", PLUGIN_NAME]);
    }
  }

  // Step 2: Remove remote marketplace (if registered)
  if (isMarketplaceRegistered()) {
    runClaude(["plugin", "marketplace", "remove", MARKETPLACE_NAME], "Removing remote marketplace...");
  }

  // Step 3: Add local marketplace
  if (!runClaude(["plugin", "marketplace", "add", localPath], "Adding local marketplace...")) {
    log.error("Failed to add local marketplace. Aborting.");
    return;
  }

  // Step 4: Install from local
  if (!runClaude(["plugin", "install", PLUGIN_ID], "Installing plugin from local source...")) {
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

  console.log();
  log.success(`Dev mode ${chalk.green("ON")} — using local plugin from ${chalk.cyan(localPath)}`);
  log.dim("Restart Claude Code to see changes.");
}

export async function devOffCommand(): Promise<void> {
  const state = getDevState();
  if (!state) {
    log.info("Dev mode is already OFF (using remote marketplace).");
    return;
  }

  if (!ensureClaude()) return;

  console.log(`\n=== ${chalk.yellow("Switching back to remote marketplace")} ===\n`);

  // Step 1: Uninstall local plugin
  if (isPluginInstalled()) {
    if (!runClaude(["plugin", "uninstall", PLUGIN_ID], "Uninstalling local plugin...")) {
      run("claude", ["plugin", "uninstall", PLUGIN_NAME]);
    }
  }

  // Step 2: Remove local marketplace
  if (isMarketplaceRegistered()) {
    runClaude(["plugin", "marketplace", "remove", MARKETPLACE_NAME], "Removing local marketplace...");
  }

  // Step 3: Add remote marketplace
  if (!runClaude(["plugin", "marketplace", "add", REMOTE_URL], "Adding remote marketplace...")) {
    log.error("Failed to add remote marketplace.");
    return;
  }

  // Step 4: Install from remote
  if (!runClaude(["plugin", "install", PLUGIN_ID], "Installing plugin from remote...")) {
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
  const data = readJson<Record<string, MarketplaceEntry>>(knownMarketplacesPath());
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

function copyDirRecursive(src: string, dest: string, fileCount = { n: 0 }): void {
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
    log.error(`No plugin/ directory found at ${localPath}. Make sure you point to the coding-friend repo root.`);
    return;
  }

  const cacheBase = pluginCachePath();

  // Find the cached version directory
  let cacheVersionDir: string | null = null;
  if (existsSync(cacheBase)) {
    const versions = readdirSync(cacheBase).filter((v) =>
      statSync(join(cacheBase, v)).isDirectory()
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
        })[0]
      );
    }
  }

  if (!cacheVersionDir) {
    log.error("No cached plugin version found. Run `cf dev off && cf dev on` first.");
    return;
  }

  const shortDest = cacheVersionDir.replace(process.env.HOME ?? "", "~");
  log.step(`Syncing ${chalk.cyan(pluginSrcDir)} → ${chalk.dim(shortDest)}`);

  // Copy plugin/ contents directly into cache version dir
  const fileCount = { n: 0 };
  copyDirRecursive(pluginSrcDir, cacheVersionDir, fileCount);

  log.success(`Synced ${chalk.green(fileCount.n)} files. Restart Claude Code to apply changes.`);
}

export async function devStatusCommand(): Promise<void> {
  const state = getDevState();
  const source = getMarketplaceSource();
  const installed = isPluginInstalled();

  if (state) {
    log.info(`Dev mode: ${chalk.green("ON")}`);
    log.info(`Local path: ${chalk.cyan(state.localPath)}`);
    log.dim(`Since: ${state.savedAt}`);
  } else {
    log.info(`Dev mode: ${chalk.yellow("OFF")}`);
  }

  console.log();
  if (source) {
    const label = source.type === "local"
      ? `${chalk.green("local")} → ${chalk.cyan(source.location)}`
      : `${chalk.blue("remote")} → ${source.location}`;
    log.info(`Marketplace source: ${label}`);
  } else {
    log.warn(`Marketplace "${MARKETPLACE_NAME}" not registered.`);
  }
  log.info(`Plugin installed: ${installed ? chalk.green("yes") : chalk.yellow("no")}`);
}
