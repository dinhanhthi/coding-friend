import { readJson } from "./json.js";
import { installedPluginsPath, knownMarketplacesPath } from "./paths.js";

const MARKETPLACE_NAME = "coding-friend-marketplace";
const PLUGIN_NAME = "coding-friend";

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
