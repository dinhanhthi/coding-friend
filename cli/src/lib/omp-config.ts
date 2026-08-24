// OMP agent format (verified 2026-08-24 from https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/task/agents.ts parseAgent): systemPrompt lives in the markdown body. Frontmatter requires name + description. User agents: ~/.omp/agent/agents/*.md (non-recursive). Reference: https://github.com/can1357/oh-my-pi/blob/main/docs/task-agent-discovery.md
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";

import { compareVersions } from "./host.js";
import { readJson, writeJson } from "./json.js";
import {
  ompConfigYmlPath,
  ompExtensionsDir,
  ompMcpJsonPath,
  ompProjectAgentsDir,
  ompProjectConfigYmlPath,
  ompProjectExtensionsDir,
  ompUserAgentsDir,
  pluginCachePath,
} from "./paths.js";

export { checkOmpVersion } from "./host.js";

export type OmpScope = "user" | "project";

export interface OmpMcpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface OmpMcpJson {
  mcpServers: Record<string, OmpMcpServer>;
  disabledServers?: string[];
}

const EXTENSION_SHIM = "coding-friend.ts";
const MANAGED_START = "# coding-friend-managed";
const MANAGED_END = "# end coding-friend-managed";
const KEPT_MODELS = new Set(["haiku", "sonnet", "opus"]);

const FALLBACK_CF_AGENT_NAMES = [
  "cf-explorer",
  "cf-implementer",
  "cf-planner",
  "cf-reviewer",
  "cf-reviewer-plan",
  "cf-reviewer-quality",
  "cf-reviewer-reducer",
  "cf-reviewer-rules",
  "cf-reviewer-security",
  "cf-reviewer-tests",
  "cf-writer",
  "cf-writer-deep",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function agentsDirForScope(scope: OmpScope): string {
  return scope === "user" ? ompUserAgentsDir() : ompProjectAgentsDir();
}

function extensionsDirForScope(scope: OmpScope): string {
  return scope === "user" ? ompExtensionsDir() : ompProjectExtensionsDir();
}

function configYmlForScope(scope: OmpScope): string {
  return scope === "user" ? ompConfigYmlPath() : ompProjectConfigYmlPath();
}

function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: normalized };
  }

  const frontmatter: Record<string, string> = {};
  const lines = match[1].split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const simple = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!simple) continue;

    const [, key, rawValue = ""] = simple;
    if (rawValue === ">") {
      const folded: string[] = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        index += 1;
        folded.push(lines[index].trim());
      }
      frontmatter[key] = folded.join(" ").replace(/\s+/g, " ").trim();
    } else {
      frontmatter[key] = rawValue.trim();
    }
  }

  return {
    frontmatter,
    body: normalized.slice(match[0].length),
  };
}

function yamlScalar(value: string): string {
  if (/[:#\n]/.test(value) || value === "" || /["']/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function normalizeAgentBody(body: string): string {
  let text = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (text.startsWith("\n")) text = text.slice(1);
  if (text.endsWith("\n\n")) text = text.slice(0, -1);
  if (!text.endsWith("\n")) text += "\n";
  return text;
}

function isCfAgentFile(name: string): boolean {
  return /^cf-.*\.md$/.test(name);
}

function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          (entry.isFile() || entry.isSymbolicLink()) &&
          entry.name.endsWith(".md"),
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function addCfAgentNames(dir: string, names: Set<string>): void {
  for (const filename of listMdFiles(dir)) {
    if (!isCfAgentFile(filename)) continue;
    names.add(filename.slice(0, -3));
  }
}

function ourAgentNames(scope: OmpScope): string[] {
  const names = new Set<string>(FALLBACK_CF_AGENT_NAMES);
  const sourceDir = findOmpAgentSourceDir();
  if (sourceDir) addCfAgentNames(sourceDir, names);
  addCfAgentNames(agentsDirForScope(scope), names);
  return [...names].sort();
}

function repoPluginCandidate(repoRoot: string, ...parts: string[]): string {
  const direct = resolve(repoRoot, ...parts);
  const parent = resolve(repoRoot, "..", ...parts);
  if (existsSync(direct)) return direct;
  if (existsSync(parent)) return parent;
  if (existsSync(resolve(repoRoot, "..", "plugin", "agents"))) return parent;
  return direct;
}

function latestCachedPluginDir(
  cacheRoot = pluginCachePath(),
): string | null {
  if (!existsSync(cacheRoot)) return null;
  if (existsSync(join(cacheRoot, "agents"))) return cacheRoot;

  let dirs: string[] = [];
  try {
    dirs = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return null;
  }

  const versions = dirs
    .filter((name) => /^\d/.test(name))
    .sort(compareVersions)
    .reverse();
  if (versions[0]) return join(cacheRoot, versions[0]);

  const rest = [...dirs].sort(compareVersions).reverse();
  return rest[0] ? join(cacheRoot, rest[0]) : null;
}

function ensureNl(content: string): string {
  return content === "" || content.endsWith("\n") ? content : `${content}\n`;
}

function normalizeYml(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function findManagedRange(
  content: string,
): { start: number; end: number } | null {
  const markerStart = content.indexOf(MANAGED_START);
  const markerEnd = content.indexOf(MANAGED_END);
  if (markerStart === -1 || markerEnd === -1 || markerEnd < markerStart) {
    return null;
  }

  let start = markerStart;
  while (
    start > 0 &&
    (content[start - 1] === " " || content[start - 1] === "\t")
  ) {
    start -= 1;
  }

  let end = markerEnd + MANAGED_END.length;
  if (content[end] === "\n") end += 1;
  return { start, end };
}

function stripManagedBlock(content: string): string {
  const normalized = normalizeYml(content);
  const range = findManagedRange(normalized);
  if (!range) return ensureNl(normalized);

  const before = normalized.slice(0, range.start).replace(/\n+$/, "");
  const after = normalized.slice(range.end).replace(/^\n+/, "");
  if (!before && !after) return "";
  if (!after) return `${before}\n`;
  if (!before) return ensureNl(after);
  return ensureNl(`${before}\n\n${after}`);
}

function stripManagedBlocks(content: string): string {
  let current = normalizeYml(content);
  for (let i = 0; i < 16; i += 1) {
    const next = stripManagedBlock(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function isBlockTaskKey(line: string): boolean {
  return /^task:\s*(#.*)?$/.test(line);
}

function isTopLevelKey(line: string): boolean {
  return /^[A-Za-z0-9_-]+:(\s|$)/.test(line);
}

function mappingEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i += 1) {
    if (isTopLevelKey(lines[i])) return i;
  }
  return lines.length;
}

function mappingChildIndent(
  lines: string[],
  start: number,
  end: number,
): string {
  for (let i = start + 1; i < end; i += 1) {
    const match = lines[i].match(/^([ \t]+)\S/);
    if (match) return match[1];
  }
  return "  ";
}

function findChildKeyRange(
  lines: string[],
  mappingStart: number,
  mappingEndIdx: number,
  indent: string,
  key: string,
): { start: number; end: number } | null {
  const prefix = `${indent}${key}:`;
  for (let i = mappingStart + 1; i < mappingEndIdx; i += 1) {
    const line = lines[i];
    if (
      line !== prefix &&
      !line.startsWith(`${prefix} `) &&
      !line.startsWith(`${prefix}\t`)
    ) {
      continue;
    }

    let end = i + 1;
    while (end < mappingEndIdx) {
      const next = lines[end];
      if (next.trim() === "") break;
      const nextIndent = next.match(/^[ \t]*/)?.[0] ?? "";
      if (nextIndent.length <= indent.length) break;
      end += 1;
    }
    return { start: i, end };
  }
  return null;
}

function managedDisabledAgentsLine(names: string[]): string {
  return `disabledAgents: [${names.join(", ")}]`;
}

function managedDisabledAgentsBlock(names: string[]): string {
  return [
    MANAGED_START,
    "task:",
    `  ${managedDisabledAgentsLine(names)}`,
    MANAGED_END,
  ].join("\n");
}

function disabledAgentsLines(
  names: string[],
  indent: string,
  managed: boolean,
): string[] {
  const line = `${indent}${managedDisabledAgentsLine(names)}`;
  if (!managed) return [line];
  return [`${indent}${MANAGED_START}`, line, `${indent}${MANAGED_END}`];
}

function hasTopLevelTaskKey(lines: string[]): boolean {
  return lines.some((line) => /^task:(\s|$)/.test(line));
}

function parseYamlName(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFlowNameList(inside: string): string[] {
  if (!inside.trim()) return [];
  return inside.split(",").map(parseYamlName).filter(Boolean);
}

function parseDisabledAgentsAt(
  lines: string[],
  mappingStart: number,
  mappingEndIdx: number,
  indent: string,
): string[] {
  const range = findChildKeyRange(
    lines,
    mappingStart,
    mappingEndIdx,
    indent,
    "disabledAgents",
  );
  if (!range) return [];

  const flow = lines[range.start].match(
    /disabledAgents:\s*\[(.*)\]\s*(#.*)?$/,
  );
  if (flow) return parseFlowNameList(flow[1]);

  const names: string[] = [];
  for (let i = range.start + 1; i < range.end; i += 1) {
    const item = lines[i].match(/^\s*-\s+(.+?)\s*$/);
    if (item) names.push(parseYamlName(item[1]));
  }
  return names;
}

function readDisabledAgentNames(content: string): string[] {
  const lines = normalizeYml(content).split("\n");
  const taskIdx = lines.findIndex(isBlockTaskKey);
  if (taskIdx === -1) return [];
  const end = mappingEnd(lines, taskIdx);
  const indent = mappingChildIndent(lines, taskIdx, end);
  return parseDisabledAgentsAt(lines, taskIdx, end, indent);
}

function mergeAgentNames(existing: string[], ours: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const name of [...existing, ...ours]) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    merged.push(name);
  }
  return merged;
}

// Line editor for task.disabledAgents only — no YAML parser. Never emit a second top-level `task:`.
function writeDisabledAgents(
  content: string,
  names: string[],
  managed: boolean,
): string {
  const stripped = stripManagedBlocks(content);
  const trimmed = stripped.replace(/\n+$/, "");
  const lines = trimmed === "" ? [] : trimmed.split("\n");
  const taskIdx = lines.findIndex(isBlockTaskKey);

  if (taskIdx === -1) {
    if (hasTopLevelTaskKey(lines) || names.length === 0) {
      return ensureNl(stripped);
    }
    return `${trimmed}${trimmed ? "\n\n" : ""}${managedDisabledAgentsBlock(names)}\n`;
  }

  const end = mappingEnd(lines, taskIdx);
  const indent = mappingChildIndent(lines, taskIdx, end);
  const existing = findChildKeyRange(
    lines,
    taskIdx,
    end,
    indent,
    "disabledAgents",
  );

  if (names.length === 0) {
    if (existing) {
      lines.splice(existing.start, existing.end - existing.start);
    }
    return ensureNl(lines.join("\n"));
  }

  const next = disabledAgentsLines(names, indent, managed);
  if (existing) {
    lines.splice(existing.start, existing.end - existing.start, ...next);
  } else {
    lines.splice(taskIdx + 1, 0, ...next);
  }
  return ensureNl(lines.join("\n"));
}

function upsertDisabledAgents(content: string, ours: string[]): string {
  return writeDisabledAgents(
    content,
    mergeAgentNames(readDisabledAgentNames(content), ours),
    true,
  );
}

function removeOurDisabledAgents(content: string, ours: string[]): string {
  const oursSet = new Set(ours);
  const remaining = readDisabledAgentNames(content).filter(
    (name) => !oursSet.has(name),
  );
  return writeDisabledAgents(content, remaining, false);
}

function writeTextFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, ensureNl(content), "utf8");
}

export function readOmpMcpJson(
  filePath = ompMcpJsonPath(),
): OmpMcpJson | null {
  const data = readJson<Record<string, unknown>>(filePath);
  if (!data || !isPlainObject(data.mcpServers)) return null;
  return data as unknown as OmpMcpJson;
}

export function writeOmpMcpEntry(
  name: string,
  server: OmpMcpServer,
  filePath = ompMcpJsonPath(),
): void {
  const existing = readJson<Record<string, unknown>>(filePath);
  const data: Record<string, unknown> = isPlainObject(existing)
    ? { ...existing }
    : {};
  const mcpServers: Record<string, OmpMcpServer> = isPlainObject(
    data.mcpServers,
  )
    ? { ...(data.mcpServers as Record<string, OmpMcpServer>) }
    : {};
  mcpServers[name] = server;
  data.mcpServers = mcpServers;
  writeJson(filePath, data);
}

export function removeOmpMcpEntry(
  name: string,
  filePath = ompMcpJsonPath(),
): void {
  const existing = readJson<Record<string, unknown>>(filePath);
  if (!existing || !isPlainObject(existing.mcpServers)) return;
  const mcpServers = {
    ...(existing.mcpServers as Record<string, OmpMcpServer>),
  };
  if (!(name in mcpServers)) return;
  delete mcpServers[name];
  writeJson(filePath, { ...existing, mcpServers });
}

export function convertClaudeAgentToOmp(sourceMd: string): string {
  const { frontmatter, body } = parseFrontmatter(sourceMd);
  const name = frontmatter.name?.trim();
  const description = frontmatter.description ?? "";
  if (!name || !description.trim()) {
    throw new Error(
      "Agent markdown is missing required frontmatter name or description",
    );
  }

  const lines = [
    "---",
    `name: ${yamlScalar(name)}`,
    `description: ${JSON.stringify(description)}`,
  ];
  const model = frontmatter.model?.trim();
  if (model && KEPT_MODELS.has(model)) {
    lines.push(`model: ${model}`);
  }
  lines.push("---");

  return `${lines.join("\n")}\n\n${normalizeAgentBody(body)}`;
}

export function findOmpAgentSourceDir(
  repoRoot = process.cwd(),
): string | null {
  const repoAgents = repoPluginCandidate(repoRoot, "plugin", "agents");
  if (existsSync(repoAgents)) return repoAgents;

  const cached = latestCachedPluginDir();
  if (!cached) return null;
  const cachedAgents = join(cached, "agents");
  if (existsSync(cachedAgents)) return cachedAgents;
  const nested = join(cached, "plugin", "agents");
  return existsSync(nested) ? nested : null;
}

export function getOmpExtensionPath(repoRoot = process.cwd()): string {
  const repoPath = repoPluginCandidate(
    repoRoot,
    "plugin",
    "omp",
    "extension.ts",
  );
  if (existsSync(repoPath)) return repoPath;

  const cached = latestCachedPluginDir();
  if (cached) {
    const cachedPath = join(cached, "omp", "extension.ts");
    if (existsSync(cachedPath)) return cachedPath;
  }

  return repoPath;
}

export function deployOmpAgents(
  scope: OmpScope,
  options?: { dryRun?: boolean },
): { deployed: string[]; skipped: string[] } {
  const sourceDir = findOmpAgentSourceDir();
  const deployed: string[] = [];
  const skipped: string[] = [];
  if (!sourceDir) return { deployed, skipped };

  const files = listMdFiles(sourceDir);
  const dryRun = options?.dryRun === true;
  const targetDir = agentsDirForScope(scope);
  let printedFirst = false;

  if (!dryRun) mkdirSync(targetDir, { recursive: true });

  for (const filename of files) {
    let converted: string;
    try {
      converted = convertClaudeAgentToOmp(
        readFileSync(join(sourceDir, filename), "utf8"),
      );
    } catch {
      skipped.push(filename);
      continue;
    }

    if (dryRun) {
      if (!printedFirst) {
        console.log(converted);
        printedFirst = true;
      }
      skipped.push(filename);
      continue;
    }

    writeFileSync(join(targetDir, filename), converted, "utf8");
    deployed.push(filename);
  }

  return { deployed, skipped };
}

export function removeOmpAgents(scope: OmpScope): void {
  const targetDir = agentsDirForScope(scope);
  if (!existsSync(targetDir)) return;

  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (
      !(entry.isFile() || entry.isSymbolicLink()) ||
      !isCfAgentFile(entry.name)
    ) {
      continue;
    }
    rmSync(join(targetDir, entry.name));
  }
}

export function writeOmpExtensionEntry(
  scope: OmpScope,
  repoRoot = process.cwd(),
): void {
  const extensionPath = getOmpExtensionPath(repoRoot);
  const pluginRoot = dirname(dirname(extensionPath));
  const shim = [
    `// CODING_FRIEND_PLUGIN_ROOT=${pluginRoot}`,
    `export { default } from ${JSON.stringify(extensionPath)};`,
    "",
  ].join("\n");
  writeTextFile(join(extensionsDirForScope(scope), EXTENSION_SHIM), shim);
}

export function removeOmpExtensionEntry(scope: OmpScope): void {
  const filePath = join(extensionsDirForScope(scope), EXTENSION_SHIM);
  if (existsSync(filePath)) rmSync(filePath);
}

export function setOmpAgentEnabled(scope: OmpScope): boolean {
  const filePath = configYmlForScope(scope);
  if (!existsSync(filePath)) return false;
  const current = readFileSync(filePath, "utf8");
  const next = removeOurDisabledAgents(current, ourAgentNames(scope));
  if (next === current) return false;
  writeFileSync(filePath, next, "utf8");
  return true;
}

export function setOmpAgentDisabled(scope: OmpScope): void {
  const filePath = configYmlForScope(scope);
  const current = existsSync(filePath)
    ? readFileSync(filePath, "utf8")
    : "";
  writeTextFile(
    filePath,
    upsertDisabledAgents(current, ourAgentNames(scope)),
  );
}

export function isOmpAgentInstalled(scope: OmpScope): boolean {
  const dir = agentsDirForScope(scope);
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir, { withFileTypes: true }).some(
      (entry) =>
        (entry.isFile() || entry.isSymbolicLink()) &&
        isCfAgentFile(entry.name),
    );
  } catch {
    return false;
  }
}
