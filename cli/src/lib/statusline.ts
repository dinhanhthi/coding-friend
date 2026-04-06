import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { checkbox, input } from "@inquirer/prompts";
import { readJson, writeJson, mergeJson } from "./json.js";
import {
  claudeSettingsPath,
  globalConfigPath,
  installedPluginsPath,
  pluginCachePath,
} from "./paths.js";
import {
  STATUSLINE_COMPONENTS,
  ALL_COMPONENT_IDS,
  type StatuslineComponent,
  type CodingFriendConfig,
} from "../types.js";

/**
 * Get the currently installed plugin version from installed_plugins.json.
 * Returns the version string if found, null otherwise.
 */
export function getInstalledVersion(): string | null {
  const data = readJson<Record<string, unknown>>(installedPluginsPath());
  if (!data) return null;

  // v2 format: { version: 2, plugins: { "name@marketplace": [{ version, ... }] } }
  const plugins = (data.plugins ?? data) as Record<string, unknown>;

  for (const [key, value] of Object.entries(plugins)) {
    if (!key.includes("coding-friend")) continue;

    // Array format: [{ version: "1.4.0", ... }]
    if (Array.isArray(value) && value.length > 0) {
      const entry = value[0] as Record<string, unknown>;
      if (typeof entry.version === "string") return entry.version;
    }
    // Object format: { version: "1.4.0", ... }
    if (typeof value === "object" && value !== null && "version" in value) {
      return (value as { version: string }).version;
    }
  }
  return null;
}

/**
 * Find the latest cached plugin version directory.
 */
function findLatestVersion(): string | null {
  const cachePath = pluginCachePath();
  if (!existsSync(cachePath)) return null;

  const versions = readdirSync(cachePath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();

  return versions[0] ?? null;
}

/**
 * Find the statusline hook path and plugin version.
 * Prefers the currently installed version over the latest cached directory.
 * Falls back to the latest cached version if installed version has no hook.
 * Returns null if plugin not found or hook missing.
 */
export function findStatuslineHookPath(): {
  hookPath: string;
  version: string;
} | null {
  const cachePath = pluginCachePath();

  // Prefer the installed version (respects dev/prod state)
  const installed = getInstalledVersion();
  if (installed) {
    const hookPath = join(cachePath, installed, "hooks", "statusline.sh");
    if (existsSync(hookPath)) return { hookPath, version: installed };
  }

  // Fall back to latest cached version
  const latest = findLatestVersion();
  if (!latest) return null;

  const hookPath = join(cachePath, latest, "hooks", "statusline.sh");
  if (!existsSync(hookPath)) return null;

  return { hookPath, version: latest };
}

/**
 * Load currently configured statusline components from global config.
 * Returns all component IDs if no config exists.
 * Filters out invalid component IDs from manual edits.
 */
export function loadStatuslineComponents(): StatuslineComponent[] {
  const config = readJson<CodingFriendConfig>(globalConfigPath());
  const components = config?.statusline?.components;
  if (!components) return ALL_COMPONENT_IDS;
  return components
    .map((c) => (c === ("usage" as string) ? "rate_limit" : c))
    .filter((c) =>
      ALL_COMPONENT_IDS.includes(c as StatuslineComponent),
    ) as StatuslineComponent[];
}

/**
 * Present an interactive checklist for selecting statusline components.
 * Pre-checks currently enabled components.
 */
export async function selectStatuslineComponents(
  current?: StatuslineComponent[],
): Promise<StatuslineComponent[]> {
  const enabled = current ?? loadStatuslineComponents();

  const selected = await checkbox<StatuslineComponent>({
    message: "Which components to show in the statusline?",
    choices: STATUSLINE_COMPONENTS.map((c) => ({
      name: c.label,
      value: c.id,
      checked: enabled.includes(c.id),
    })),
  });

  return selected;
}

/**
 * Save statusline component config to global config.
 * Reads existing statusline config first to avoid clobbering sibling keys (e.g. accountAliases).
 */
export function saveStatuslineConfig(components: StatuslineComponent[]): void {
  const config = readJson<Record<string, unknown>>(globalConfigPath()) ?? {};
  const existing = (config.statusline ?? {}) as Record<string, unknown>;
  mergeJson(globalConfigPath(), { statusline: { ...existing, components } });
}

/**
 * Get the current account email from ~/.claude.json.
 * Returns undefined if not found.
 */
export function getCurrentAccountEmail(): string | undefined {
  const claudeJsonPath = join(
    process.env.HOME ?? process.env.USERPROFILE ?? "",
    ".claude.json",
  );
  const data = readJson<Record<string, unknown>>(claudeJsonPath);
  const oauth = data?.oauthAccount as { emailAddress?: string } | undefined;
  return oauth?.emailAddress || undefined;
}

/**
 * Load the account alias for a given email from global config.
 * Returns undefined if not set.
 */
export function loadStatuslineAlias(email: string): string | undefined {
  const config = readJson<CodingFriendConfig>(globalConfigPath());
  return config?.statusline?.accountAliases?.[email] || undefined;
}

/**
 * Save account alias for a given email to global config.
 * Reads existing statusline config first to avoid clobbering components.
 * Pass undefined or empty string to clear the alias for that email.
 */
export function saveStatuslineAlias(
  email: string,
  alias: string | undefined,
): void {
  const config = readJson<Record<string, unknown>>(globalConfigPath()) ?? {};
  const existing = (config.statusline ?? {}) as Record<string, unknown>;
  const aliases = {
    ...((existing.accountAliases as Record<string, string>) ?? {}),
  };
  if (alias) {
    aliases[email] = alias;
  } else {
    delete aliases[email];
  }
  const updated = { ...existing, accountAliases: aliases };
  // Remove empty map
  if (Object.keys(aliases).length === 0) delete updated.accountAliases;
  mergeJson(globalConfigPath(), { statusline: updated });
}

/**
 * Prompt user to set an account alias for the current email.
 * Shows the email so user knows which account they're aliasing.
 * Returns the alias string, or undefined if left empty (clears alias).
 */
export async function promptAccountAlias(
  email: string,
  currentAlias?: string,
): Promise<string | undefined> {
  const value = await input({
    message: `Alias for ${email} (leave empty to clear):`,
    default: currentAlias ?? "",
    validate: (val) => {
      if (val.length > 40) return "Alias must be 40 characters or less.";
      if (/[\x00-\x1f]/.test(val))
        return "Alias must not contain control characters.";
      return true;
    },
  });
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Build the statusline bash command from a hook path.
 * Normalizes backslashes to forward slashes for bash compatibility on Windows
 * and quotes the path to handle spaces in usernames.
 */
function buildStatuslineCommand(hookPath: string): string {
  const normalized = hookPath.replace(/\\/g, "/");
  return `bash "${normalized}"`;
}

/**
 * Write the statusline hook command to Claude Code settings.
 */
export function writeStatuslineSettings(hookPath: string): void {
  const settingsPath = claudeSettingsPath();
  const settings = readJson<Record<string, unknown>>(settingsPath) ?? {};
  settings.statusLine = {
    type: "command",
    command: buildStatuslineCommand(hookPath),
  };
  writeJson(settingsPath, settings);
}

/**
 * Ensure statusline points to the currently installed plugin version.
 * Returns the version string if settings were updated, null if already current or no hook found.
 */
export function ensureStatusline(): string | null {
  const info = findStatuslineHookPath();
  if (!info) return null;

  const settingsPath = claudeSettingsPath();
  const settings = readJson<Record<string, unknown>>(settingsPath) ?? {};
  const current = (settings.statusLine as { command?: string })?.command;
  const expected = buildStatuslineCommand(info.hookPath);

  if (current === expected) return null;

  settings.statusLine = { type: "command", command: expected };
  writeJson(settingsPath, settings);
  return info.version;
}

/**
 * Check if statusline is already configured in Claude Code settings.
 */
export function isStatuslineConfigured(): boolean {
  const settings = readJson<Record<string, unknown>>(claudeSettingsPath());
  if (!settings) return false;
  const sl = settings.statusLine as { command?: string } | undefined;
  return !!sl?.command;
}
