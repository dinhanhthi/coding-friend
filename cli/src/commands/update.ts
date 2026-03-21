import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readJson } from "../lib/json.js";
import { claudeSettingsPath } from "../lib/paths.js";
import { run, runWithStderr, commandExists, sleepSync } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { ensureShellCompletion } from "../lib/shell-completion.js";
import { ensureStatusline, getInstalledVersion } from "../lib/statusline.js";
import { resolveScope, type ScopeFlags } from "../lib/prompt-utils.js";
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

export function getCliVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
  );
  return pkg.version;
}

export function getLatestCliVersion(): string | null {
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

export interface UpdateOptions extends ScopeFlags {
  cli?: boolean;
  plugin?: boolean;
  statusline?: boolean;
}

export async function updateCommand(opts: UpdateOptions): Promise<void> {
  // If no component flags specified, update everything
  const updateAll = !opts.cli && !opts.plugin && !opts.statusline;
  const doCli = updateAll || !!opts.cli;
  const doPlugin = updateAll || !!opts.plugin;
  const doStatusline = updateAll || !!opts.statusline;

  // Resolve scope (only matters for plugin updates)
  const hasScopeFlag = !!(
    opts.user ||
    opts.global ||
    opts.project ||
    opts.local
  );
  let scope: string | undefined;
  if (doPlugin && hasScopeFlag) {
    scope = await resolveScope(opts);
  } else if (doPlugin && !hasScopeFlag) {
    // Default to user scope for update (no interactive prompt — backward compatible)
    scope = "user";
  }

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
          log.step(
            `Updating plugin${scope && scope !== "user" ? ` (${scope} scope)` : ""}...`,
          );
          const updateArgs = [
            "plugin",
            "update",
            "coding-friend@coding-friend-marketplace",
          ];
          if (scope) {
            updateArgs.push("--scope", scope);
          }
          const result = runWithStderr("claude", updateArgs);

          if (result.exitCode !== 0) {
            log.error(
              "Plugin update failed. Try manually: claude plugin update coding-friend@coding-friend-marketplace",
            );
            if (result.stderr) {
              log.dim(`stderr: ${result.stderr}`);
            }
          } else {
            // Verify with retry — installed_plugins.json may not be written immediately
            let newVersion: string | null = currentVersion;
            for (let i = 0; i < 3; i++) {
              newVersion = getInstalledVersion();
              if (newVersion !== currentVersion) break;
              if (i < 2) sleepSync(1000);
            }

            // Fallback: if update didn't change version, try reinstall
            // (marketplace cache may be stale while GitHub has the new release)
            if (newVersion === currentVersion) {
              log.dim("Marketplace cache may be stale. Trying reinstall...");
              const installArgs = [
                "plugin",
                "install",
                "coding-friend@coding-friend-marketplace",
              ];
              if (scope) {
                installArgs.push("--scope", scope);
              }
              run("claude", installArgs);

              newVersion = getInstalledVersion();
            }

            if (newVersion !== currentVersion) {
              log.success(`Plugin updated to ${chalk.green(`v${newVersion}`)}`);
            } else {
              log.warn(
                "Plugin command succeeded but version in installed_plugins.json is still unchanged.",
              );
              if (result.stdout) {
                log.dim(`stdout: ${result.stdout}`);
              }
              if (result.stderr) {
                log.dim(`stderr: ${result.stderr}`);
              }
              log.dim(
                "Try manually in Claude Code: /plugins → Installed → coding-friend → Update now → /reload-plugins",
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
