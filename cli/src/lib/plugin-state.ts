import { readJson, writeJson } from "./json.js";
import {
  installedPluginsPath,
  knownMarketplacesPath,
  claudeSettingsPath,
  claudeProjectSettingsPath,
  claudeLocalSettingsPath,
} from "./paths.js";
import type { PluginScope } from "./prompt-utils.js";

const MARKETPLACE_NAME = "coding-friend-marketplace";
const PLUGIN_NAME = "coding-friend";
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

export function isPluginInstalled(): boolean {
  const data = readJson<Record<string, unknown>>(installedPluginsPath());
  if (!data) return false;
  const plugins = (data.plugins ?? data) as Record<string, unknown>;
  return Object.keys(plugins).some((k) => k.includes(PLUGIN_NAME));
}

export function isMarketplaceRegistered(): boolean {
  const data = readJson<Record<string, unknown>>(knownMarketplacesPath());
  if (!data) return false;
  return MARKETPLACE_NAME in data;
}

/** Map a plugin scope to the corresponding Claude settings file path. */
export function settingsPathForScope(scope: PluginScope): string {
  switch (scope) {
    case "user":
      return claudeSettingsPath();
    case "project":
      return claudeProjectSettingsPath();
    case "local":
      return claudeLocalSettingsPath();
  }
}

/** Check if the plugin is explicitly disabled at the given scope. */
export function isPluginDisabled(scope: PluginScope): boolean {
  const settings = readJson<Record<string, unknown>>(
    settingsPathForScope(scope),
  );
  if (!settings) return false;
  const enabled = settings.enabledPlugins as
    | Record<string, boolean>
    | undefined;
  if (!enabled) return false;
  return enabled[PLUGIN_ID] === false;
}

/** Enable or disable the plugin at the given scope by modifying enabledPlugins. */
export function setPluginEnabled(scope: PluginScope, enabled: boolean): void {
  const filePath = settingsPathForScope(scope);
  const settings = readJson<Record<string, unknown>>(filePath) ?? {};

  const enabledPlugins = (settings.enabledPlugins ?? {}) as Record<
    string,
    boolean
  >;

  if (enabled) {
    delete enabledPlugins[PLUGIN_ID];
    if (Object.keys(enabledPlugins).length === 0) {
      delete settings.enabledPlugins;
    } else {
      settings.enabledPlugins = enabledPlugins;
    }
  } else {
    enabledPlugins[PLUGIN_ID] = false;
    settings.enabledPlugins = enabledPlugins;
  }

  writeJson(filePath, settings);
}
