import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { globalConfigDir } from "./paths.js";
import { run } from "./exec.js";
import { log } from "./log.js";
import chalk from "chalk";

const UPDATE_CHECK_FILE = "cli-update-check.json";
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
}

export interface UpdateCheckOptions {
  autoUpdate?: boolean;
}

export function getUpdateCachePath(): string {
  return join(globalConfigDir(), UPDATE_CHECK_FILE);
}

export function readUpdateCache(): UpdateCache | null {
  try {
    const path = getUpdateCachePath();
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function writeUpdateCache(latestVersion: string): void {
  const dir = globalConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    getUpdateCachePath(),
    JSON.stringify({ lastCheck: Date.now(), latestVersion }),
  );
}

export function isCheckStale(
  cache: UpdateCache | null,
  now: number = Date.now(),
): boolean {
  if (!cache) return true;
  return now - cache.lastCheck > CHECK_INTERVAL_MS;
}

/** Returns 1 if a > b, -1 if a < b, 0 if equal */
function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Check for CLI updates with 24h cache, show notification, and optionally auto-update.
 */
export function checkAndNotifyCliUpdate(
  currentVersion: string,
  opts: UpdateCheckOptions = {},
): void {
  const { autoUpdate = true } = opts;

  try {
    const cache = readUpdateCache();
    let latestVersion: string | null = null;

    if (isCheckStale(cache)) {
      latestVersion = run("npm", ["view", "coding-friend-cli", "version"]);
      if (latestVersion) {
        writeUpdateCache(latestVersion);
      }
    } else {
      latestVersion = cache!.latestVersion;
    }

    if (!latestVersion) return;

    const cmp = semverCompare(currentVersion, latestVersion);
    if (cmp >= 0) return; // up to date or ahead

    // Show notification
    console.log();
    log.warn(
      `Update available: ${chalk.dim(`v${currentVersion}`)} → ${chalk.green(`v${latestVersion}`)}. Run ${chalk.cyan("cf update --cli")} to update.`,
    );

    // Auto-update
    if (autoUpdate) {
      log.step("Auto-updating CLI...");
      const result = run("npm", ["install", "-g", "coding-friend-cli@latest"]);
      if (result !== null) {
        log.success(`CLI auto-updated to ${chalk.green(`v${latestVersion}`)}`);
      } else {
        log.dim(
          "Auto-update failed. Run manually: npm install -g coding-friend-cli@latest",
        );
      }
    }
  } catch {
    // Never let update check break the main command
  }
}
