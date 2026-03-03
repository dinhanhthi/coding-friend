import { existsSync, readdirSync } from "fs";
import { checkbox } from "@inquirer/prompts";
import { readJson, writeJson, mergeJson } from "./json.js";
import {
  claudeSettingsPath,
  globalConfigPath,
  pluginCachePath,
} from "./paths.js";
import {
  STATUSLINE_COMPONENTS,
  ALL_COMPONENT_IDS,
  type StatuslineComponent,
  type CodingFriendConfig,
} from "../types.js";

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
 * Returns null if plugin not found or hook missing.
 */
export function findStatuslineHookPath(): {
  hookPath: string;
  version: string;
} | null {
  const version = findLatestVersion();
  if (!version) return null;

  const hookPath = `${pluginCachePath()}/${version}/hooks/statusline.sh`;
  if (!existsSync(hookPath)) return null;

  return { hookPath, version };
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
  return components.filter((c) =>
    ALL_COMPONENT_IDS.includes(c as StatuslineComponent),
  );
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
 */
export function saveStatuslineConfig(components: StatuslineComponent[]): void {
  mergeJson(globalConfigPath(), { statusline: { components } });
}

/**
 * Write the statusline hook command to Claude Code settings.
 */
export function writeStatuslineSettings(hookPath: string): void {
  const settingsPath = claudeSettingsPath();
  const settings = readJson<Record<string, unknown>>(settingsPath) ?? {};
  settings.statusLine = {
    type: "command",
    command: `bash ${hookPath}`,
  };
  writeJson(settingsPath, settings);
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
