// Antigravity plugin helpers. Single install location: ~/.gemini/config/plugins/coding-friend/.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { dirname, join, resolve } from "path";

import { commandExists, run, runWithStderr } from "./exec.js";
import { readJson, writeJson } from "./json.js";
import {
  agyConfigDir,
  agyConfigJsonPath,
  agyConfigRoot,
  agyPluginDir,
  agyPluginsDir,
  agySourceCloneDir,
  devStatePath,
  marketplaceClonePath,
} from "./paths.js";

export { checkAgyVersion } from "./host.js";

const PLUGIN_NAME = "coding-friend";
const PLUGIN_SUBDIR = "plugin-antigravity";
const SOURCE_REPO = "https://github.com/dinhanhthi/coding-friend";
const INSTALLED_VERSION_FILE = "installed_version.json";
const PLUGIN_JSON = "plugin.json";
const MCP_CONFIG = "mcp_config.json";

export type AgyPluginSourceKind = "dev" | "marketplace" | "clone";

export interface AgyPluginSource {
  path: string;
  kind: AgyPluginSourceKind;
}

export interface AgyMcpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface AgyMcpJson {
  mcpServers: Record<string, AgyMcpServer>;
}

export interface AgyValidateResult {
  stdout: string;
  status: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function pluginSourcePath(root: string): string {
  return join(root, PLUGIN_SUBDIR);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function countFiles(dir: string): number {
  let count = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(join(dir, entry.name));
    } else {
      count += 1;
    }
  }
  return count;
}

function readVersionFromPluginJson(dir: string): string | null {
  const data = readJson<{ version?: unknown }>(join(dir, PLUGIN_JSON));
  if (typeof data?.version !== "string") return null;
  const version = data.version.trim();
  return version || null;
}

function ensureAgySourceClone(cloneDir: string): void {
  if (!commandExists("git")) {
    throw new Error(
      "git is not installed or not on PATH. Cannot clone the Antigravity plugin source from GitHub.",
    );
  }

  if (existsSync(join(cloneDir, ".git"))) {
    const result = run("git", ["-C", cloneDir, "pull", "--ff-only"]);
    if (result === null) {
      throw new Error(
        `Failed to update Antigravity plugin source at ${cloneDir} (git pull --ff-only). Delete that directory and retry, or check your network.`,
      );
    }
    return;
  }

  if (existsSync(cloneDir)) {
    rmSync(cloneDir, { recursive: true, force: true });
  }

  mkdirSync(dirname(cloneDir), { recursive: true });
  const result = run("git", ["clone", "--depth", "1", SOURCE_REPO, cloneDir]);
  if (result === null) {
    rmSync(cloneDir, { recursive: true, force: true });
    throw new Error(
      `Failed to clone ${SOURCE_REPO} into ${cloneDir}. Check your network and that git can reach GitHub. Cannot install a partial Antigravity plugin.`,
    );
  }
}

export function resolveAgyPluginSource(): AgyPluginSource {
  const devState = readJson<{ localPath?: unknown }>(devStatePath());
  if (typeof devState?.localPath === "string" && devState.localPath.trim()) {
    const path = pluginSourcePath(resolve(devState.localPath.trim()));
    if (isDirectory(path)) return { path, kind: "dev" };
  }

  const marketplacePath = pluginSourcePath(marketplaceClonePath());
  if (isDirectory(marketplacePath)) {
    return { path: marketplacePath, kind: "marketplace" };
  }

  const cloneDir = agySourceCloneDir();
  ensureAgySourceClone(cloneDir);
  const path = pluginSourcePath(cloneDir);
  if (!isDirectory(path)) {
    throw new Error(
      `Cloned coding-friend source at ${cloneDir} is missing ${PLUGIN_SUBDIR}/. Cannot install the Antigravity plugin.`,
    );
  }
  return { path, kind: "clone" };
}

export function deployAgyPlugin(source: string): { files: number } {
  const resolvedSource = resolve(source);
  if (!isDirectory(resolvedSource)) {
    throw new Error(`Antigravity plugin source not found: ${resolvedSource}`);
  }

  const target = agyPluginDir();
  if (resolvedSource === resolve(target)) {
    throw new Error(
      "Cannot deploy Antigravity plugin: source and target are the same directory.",
    );
  }

  mkdirSync(agyPluginsDir(), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  try {
    // recursive cpSync preserves posix modes (including exec bits).
    cpSync(resolvedSource, target, { recursive: true });
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw new Error(
      `Failed to copy Antigravity plugin from ${resolvedSource} to ${target}: ${errorMessage(error)}`,
    );
  }

  const files = countFiles(target);
  if (files === 0) {
    rmSync(target, { recursive: true, force: true });
    throw new Error(
      `Antigravity plugin source ${resolvedSource} copied 0 files. Refusing partial install.`,
    );
  }

  writeJson(join(target, INSTALLED_VERSION_FILE), {
    version: readVersionFromPluginJson(resolvedSource) ?? "unknown",
    installedAt: new Date().toISOString(),
    source: resolvedSource,
  });
  return { files };
}

export function removeAgyPlugin(): void {
  const target = agyPluginDir();
  if (
    target === agyConfigRoot() ||
    target === agyConfigDir() ||
    target === agyPluginsDir()
  ) {
    throw new Error(
      "Refusing to remove Antigravity config root; expected the coding-friend plugin directory.",
    );
  }
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true });
}

export function isAgyPluginInstalled(): boolean {
  return existsSync(join(agyPluginDir(), PLUGIN_JSON));
}

export function readAgyPluginVersion(): string | null {
  const dir = agyPluginDir();
  const installed = readJson<{ version?: unknown }>(
    join(dir, INSTALLED_VERSION_FILE),
  );
  if (typeof installed?.version === "string" && installed.version.trim()) {
    return installed.version.trim();
  }
  return readVersionFromPluginJson(dir);
}

export function setAgyPluginEnabled(enabled: boolean): void {
  const filePath = agyConfigJsonPath();
  const existing = readJson<Record<string, unknown>>(filePath);
  const data: Record<string, unknown> = isPlainObject(existing)
    ? { ...existing }
    : {};
  const plugins: Record<string, unknown> = isPlainObject(data.plugins)
    ? { ...data.plugins }
    : {};
  const entry: Record<string, unknown> = isPlainObject(plugins[PLUGIN_NAME])
    ? { ...plugins[PLUGIN_NAME] }
    : {};
  entry.enabled = enabled;
  plugins[PLUGIN_NAME] = entry;
  data.plugins = plugins;
  writeJson(filePath, data);
}

export function isAgyPluginEnabled(): boolean {
  const data = readJson<Record<string, unknown>>(agyConfigJsonPath());
  if (!data || !isPlainObject(data.plugins)) return false;
  const entry = data.plugins[PLUGIN_NAME];
  return isPlainObject(entry) && entry.enabled === true;
}

/** Remove plugins["coding-friend"] without touching other config keys. */
export function removeAgyPluginConfigEntry(): boolean {
  const filePath = agyConfigJsonPath();
  const existing = readJson<Record<string, unknown>>(filePath);
  if (!existing || !isPlainObject(existing.plugins)) return false;
  if (!(PLUGIN_NAME in existing.plugins)) return false;
  const plugins = { ...existing.plugins };
  delete plugins[PLUGIN_NAME];
  writeJson(filePath, { ...existing, plugins });
  return true;
}

function mcpConfigPath(): string {
  return join(agyPluginDir(), MCP_CONFIG);
}

export function readAgyMcpConfig(): AgyMcpJson | null {
  const data = readJson<Record<string, unknown>>(mcpConfigPath());
  if (!data || !isPlainObject(data.mcpServers)) return null;
  return data as unknown as AgyMcpJson;
}

export function writeAgyMcpEntry(name: string, server: AgyMcpServer): void {
  const filePath = mcpConfigPath();
  const existing = readJson<Record<string, unknown>>(filePath);
  const data: Record<string, unknown> = isPlainObject(existing)
    ? { ...existing }
    : {};
  const mcpServers: Record<string, AgyMcpServer> = isPlainObject(
    data.mcpServers,
  )
    ? { ...(data.mcpServers as Record<string, AgyMcpServer>) }
    : {};
  mcpServers[name] = server;
  data.mcpServers = mcpServers;
  writeJson(filePath, data);
}

export function removeAgyMcpEntry(name: string): void {
  const filePath = mcpConfigPath();
  const existing = readJson<Record<string, unknown>>(filePath);
  if (!existing || !isPlainObject(existing.mcpServers)) return;
  const mcpServers = {
    ...(existing.mcpServers as Record<string, AgyMcpServer>),
  };
  if (!(name in mcpServers)) return;
  delete mcpServers[name];
  writeJson(filePath, { ...existing, mcpServers });
}

export function validateAgyPlugin(dir: string): AgyValidateResult {
  if (!commandExists("agy")) {
    return { stdout: "", status: 127 };
  }
  const result = runWithStderr("agy", ["plugin", "validate", dir]);
  const stdout = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return { stdout, status: result.exitCode };
}
