import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join, resolve } from "path";
import {
  codexAgentsDir,
  codexConfigTomlPath,
  codexInstalledPluginsPath,
} from "./paths.js";

export const CODEX_MARKETPLACE_NAME = "coding-friend-marketplace";
export const CODEX_PLUGIN_NAME = "coding-friend";
export const CODEX_PLUGIN_ID = `${CODEX_PLUGIN_NAME}@${CODEX_MARKETPLACE_NAME}`;

const CODEX_PLUGIN_TABLE = `plugins."${CODEX_PLUGIN_ID}"`;
const CODEX_MEMORY_MCP_TABLE = "mcp_servers.coding-friend-memory";

function readToml(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function writeToml(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`);
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tableHeader(tableName: string): string {
  return `[${tableName}]`;
}

function findTableRange(
  lines: string[],
  header: string,
): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function replaceTable(
  content: string,
  tableName: string,
  body: string[],
): string {
  const header = tableHeader(tableName);
  const lines = content.split(/\n/);
  const range = findTableRange(lines, header);
  const nextBlock = [header, ...body];

  if (range) {
    lines.splice(range.start, range.end - range.start, ...nextBlock);
    return `${lines.join("\n").replace(/\n*$/, "")}\n`;
  }

  const prefix = content.replace(/\n*$/, "");
  return `${prefix}${prefix ? "\n\n" : ""}${nextBlock.join("\n")}\n`;
}

function upsertTableKey(
  content: string,
  tableName: string,
  key: string,
  valueLine: string,
): string {
  const header = tableHeader(tableName);
  const lines = content.split(/\n/);
  const range = findTableRange(lines, header);

  if (!range) {
    return replaceTable(content, tableName, [valueLine]);
  }

  const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
  let replaced = false;
  for (let index = range.start + 1; index < range.end; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = valueLine;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    lines.splice(range.end, 0, valueLine);
  }

  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

function getTable(content: string, tableName: string): string[] {
  const lines = content.split(/\n/);
  const range = findTableRange(lines, tableHeader(tableName));
  if (!range) return [];
  return lines.slice(range.start + 1, range.end);
}

export function isCodexMarketplaceRegistered(
  configPath = codexConfigTomlPath(),
): boolean {
  return readToml(configPath)
    .split(/\n/)
    .some(
      (line) =>
        line.trim() === tableHeader(`marketplaces.${CODEX_MARKETPLACE_NAME}`),
    );
}

export function setCodexPluginEnabled(
  enabled: boolean,
  configPath = codexConfigTomlPath(),
): void {
  const content = readToml(configPath);
  writeToml(
    configPath,
    upsertTableKey(
      content,
      CODEX_PLUGIN_TABLE,
      "enabled",
      `enabled = ${enabled ? "true" : "false"}`,
    ),
  );
}

export function isCodexPluginDisabled(
  configPath = codexConfigTomlPath(),
): boolean {
  const table = getTable(readToml(configPath), CODEX_PLUGIN_TABLE);
  return table.some((line) => /^\s*enabled\s*=\s*false\s*(?:#.*)?$/.test(line));
}

export function writeCodexMemoryMcpConfig(
  memoryDir: string,
  configPath = codexConfigTomlPath(),
): void {
  const content = readToml(configPath);
  writeToml(
    configPath,
    replaceTable(content, CODEX_MEMORY_MCP_TABLE, [
      'command = "npx"',
      `args = ["-y", "coding-friend-cli", "mcp-serve", ${tomlString(memoryDir)}]`,
    ]),
  );
}

export function writeCodexAgentLimits(
  configPath = codexConfigTomlPath(),
): void {
  const content = readToml(configPath);
  writeToml(
    configPath,
    upsertTableKey(content, "agents", "max_depth", "max_depth = 2"),
  );
}

export function trustCodexProject(
  projectPath = process.cwd(),
  configPath = codexConfigTomlPath(),
): void {
  const tableName = `projects.${tomlString(projectPath)}`;
  const content = readToml(configPath);
  writeToml(
    configPath,
    upsertTableKey(
      content,
      tableName,
      "trust_level",
      'trust_level = "trusted"',
    ),
  );
}

export function generatedCodexAgentsDir(repoRoot = process.cwd()): string {
  return resolve(repoRoot, "plugin-codex", "agents");
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10));
  const right = b.split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function latestCodexInstalledPluginDir(
  pluginRoot = codexInstalledPluginsPath(),
): string | null {
  const directManifest = join(pluginRoot, ".codex-plugin", "plugin.json");
  if (existsSync(directManifest)) return pluginRoot;
  if (!existsSync(pluginRoot)) return null;

  const versions = readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((version) =>
      existsSync(join(pluginRoot, version, ".codex-plugin", "plugin.json")),
    )
    .sort(compareVersions)
    .reverse();

  return versions[0] ? join(pluginRoot, versions[0]) : null;
}

export function getCodexInstalledVersion(
  pluginRoot = codexInstalledPluginsPath(),
): string | null {
  const pluginDir = latestCodexInstalledPluginDir(pluginRoot);
  if (!pluginDir) return null;
  try {
    const manifest = JSON.parse(
      readFileSync(join(pluginDir, ".codex-plugin", "plugin.json"), "utf8"),
    ) as { version?: string };
    return manifest.version ?? basename(pluginDir);
  } catch {
    return basename(pluginDir);
  }
}

export function findCodexAgentSourceDir(
  repoRoot = process.cwd(),
): string | null {
  const generated = generatedCodexAgentsDir(repoRoot);
  if (existsSync(generated)) return generated;

  const installedPluginDir = latestCodexInstalledPluginDir();
  const installedAgents = installedPluginDir
    ? join(installedPluginDir, "agents")
    : null;
  return installedAgents && existsSync(installedAgents)
    ? installedAgents
    : null;
}

export function deployCodexAgents(
  sourceDir: string,
  targetDir = codexAgentsDir(),
): number {
  if (!existsSync(sourceDir)) return 0;
  mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".toml")) continue;
    copyFileSync(join(sourceDir, entry.name), join(targetDir, entry.name));
    copied += 1;
  }
  return copied;
}
