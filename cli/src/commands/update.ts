import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readJson } from "../lib/json.js";
import { claudeSettingsPath } from "../lib/paths.js";
import { run, commandExists, sleepSync } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { ensureShellCompletion } from "../lib/shell-completion.js";
import { ensureStatusline, getInstalledVersion } from "../lib/statusline.js";
import chalk from "chalk";

/** Returns 1 if a > b, -1 if a < b, 0 if equal */
export function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function getCliVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
  );
  return pkg.version;
}

function getLatestCliVersion(): string | null {
  return run("npm", ["view", "coding-friend-cli", "version"]);
}

export function getLatestVersion(): string | null {
  let tag: string | null = null;

  // Try gh CLI first — filter for plugin tags (v0.x.x, not cli-v*, learn-*-v*)
  tag = run("gh", [
    "api",
    "repos/dinhanhthi/coding-friend/releases?per_page=100",
    "--jq",
    '[.[] | select(.tag_name | test("^v[0-9]"))][0].tag_name',
  ]);

  // Fallback to curl + node JSON parse
  if (!tag) {
    const json = run("curl", [
      "-s",
      "https://api.github.com/repos/dinhanhthi/coding-friend/releases?per_page=100",
    ]);
    if (json) {
      try {
        const releases = JSON.parse(json);
        if (Array.isArray(releases)) {
          const pluginRelease = releases.find((r: { tag_name?: string }) =>
            /^v[0-9]/.test(r.tag_name ?? ""),
          );
          if (pluginRelease) tag = pluginRelease.tag_name;
        }
      } catch {
        // ignore
      }
    }
  }

  if (!tag) return null;
  return tag.replace(/^v/, "");
}

function getStatuslineVersion(): string | null {
  const settings = readJson<Record<string, unknown>>(claudeSettingsPath());
  if (!settings?.statusLine) return null;

  const sl = settings.statusLine as { command?: string };
  if (!sl.command) return null;

  const match = sl.command.match(
    /coding-friend-marketplace\/coding-friend\/([^/]+)\//,
  );
  return match?.[1] ?? null;
}

export interface UpdateOptions {
  cli?: boolean;
  plugin?: boolean;
  statusline?: boolean;
}

export async function updateCommand(opts: UpdateOptions): Promise<void> {
  // If no flags specified, update everything
  const updateAll = !opts.cli && !opts.plugin && !opts.statusline;
  const doCli = updateAll || !!opts.cli;
  const doPlugin = updateAll || !!opts.plugin;
  const doStatusline = updateAll || !!opts.statusline;

  console.log("=== 🌿 Coding Friend Update 🌿 ===");
  console.log();

  // Step 1: Gather info
  const currentVersion = getInstalledVersion();
  const latestVersion = getLatestVersion();
  const statuslineVersion = getStatuslineVersion();
  const cliVersion = getCliVersion();
  const latestCliVersion = getLatestCliVersion();

  log.info(
    `Plugin version: ${currentVersion ? `v${currentVersion}` : chalk.yellow("not found")}`,
  );
  log.info(
    `Latest plugin version: ${latestVersion ? chalk.green(`v${latestVersion}`) : chalk.yellow("unknown (cannot reach GitHub)")}`,
  );
  log.info(`CLI version: v${cliVersion}`);
  log.info(
    `Latest CLI version: ${latestCliVersion ? chalk.green(`v${latestCliVersion}`) : chalk.yellow("unknown (cannot reach npm)")}`,
  );
  log.info(
    `Statusline version: ${statuslineVersion ? chalk.green(`v${statuslineVersion}`) : chalk.yellow("not configured")}`,
  );
  console.log();

  // Step 2: Update plugin if needed
  if (doPlugin) {
    if (!latestVersion) {
      log.warn(
        "Cannot check latest plugin version. Verify manually at https://github.com/dinhanhthi/coding-friend/releases",
      );
    } else if (!currentVersion) {
      log.warn(
        "Plugin not installed. Run: claude plugin install coding-friend@coding-friend-marketplace",
      );
    } else {
      const cmp = semverCompare(currentVersion, latestVersion);
      if (cmp === 0) {
        log.success(
          `Plugin already on the latest version (${chalk.green(`v${latestVersion}`)}).`,
        );
      } else if (cmp > 0) {
        log.info(
          `Plugin is ahead of latest release (local: ${chalk.cyan(`v${currentVersion}`)}, latest: v${latestVersion}). Skipping.`,
        );
      } else {
        log.step(
          `Plugin update available: ${chalk.yellow(`v${currentVersion}`)} → ${chalk.green(`v${latestVersion}`)}`,
        );

        if (!commandExists("claude")) {
          log.error(
            "Claude CLI not found. Install it first, or run: claude plugin update coding-friend@coding-friend-marketplace",
          );
        } else {
          log.step("Updating plugin...");
          const result = run("claude", [
            "plugin",
            "update",
            "coding-friend@coding-friend-marketplace",
          ]);

          if (result === null) {
            log.error(
              "Plugin update failed. Try manually: claude plugin update coding-friend@coding-friend-marketplace",
            );
          } else {
            log.success("Plugin updated!");

            // Verify with retry — installed_plugins.json may not be written immediately
            let newVersion: string | null = currentVersion;
            for (let i = 0; i < 5; i++) {
              newVersion = getInstalledVersion();
              if (newVersion !== currentVersion) break;
              if (i < 4) sleepSync(1000);
            }

            if (newVersion !== currentVersion) {
              log.success(`Plugin updated to ${chalk.green(`v${newVersion}`)}`);
            } else {
              log.warn(
                "Version in installed_plugins.json unchanged. Cache may still have been updated.",
              );
            }
          }
        }
      }
    }
  }

  // Step 3: Update CLI if needed
  if (doCli) {
    if (!latestCliVersion) {
      log.warn("Cannot check latest CLI version from npm.");
    } else {
      const cmp = semverCompare(cliVersion, latestCliVersion);
      if (cmp === 0) {
        log.success(
          `CLI already on the latest version (${chalk.green(`v${latestCliVersion}`)}).`,
        );
      } else if (cmp > 0) {
        log.info(
          `CLI is ahead of latest release (local: ${chalk.cyan(`v${cliVersion}`)}, latest: v${latestCliVersion}). Skipping.`,
        );
      } else {
        log.step(
          `CLI update available: ${chalk.yellow(`v${cliVersion}`)} → ${chalk.green(`v${latestCliVersion}`)}`,
        );
        log.step("Updating CLI...");
        const result = run("npm", [
          "install",
          "-g",
          "coding-friend-cli@latest",
        ]);

        if (result === null) {
          log.error(
            "CLI update failed. Try manually: npm install -g coding-friend-cli@latest",
          );
        } else {
          log.success(`CLI updated to ${chalk.green(`v${latestCliVersion}`)}`);
        }
      }
    }
  }

  // Step 4: Fix statusline
  if (doStatusline) {
    log.step("Updating statusline...");
    const updatedVersion = ensureStatusline();
    if (updatedVersion) {
      log.success(`Statusline updated to ${chalk.green(`v${updatedVersion}`)}`);
    } else {
      log.dim("Statusline already up-to-date.");
    }
  }

  // Step 5: Ensure shell completion
  ensureShellCompletion({ silent: false });

  console.log();
  log.dim("Restart Claude Code (or start a new session) to see changes.");
}
