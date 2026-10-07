import { existsSync, realpathSync } from "fs";
import { resolve } from "path";
import { readJson, writeJsonAtomic } from "./json.js";
import { CliError } from "./output.js";
import { projectsRegistryPath } from "./paths.js";

export interface ProjectEntry {
  path: string;
  hosts: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface Registry {
  schemaVersion: 1;
  projects: ProjectEntry[];
}

export type ListedProject = ProjectEntry & { exists: boolean };

function isEntry(v: unknown): v is ProjectEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.path === "string" &&
    Array.isArray(e.hosts) &&
    e.hosts.every((h) => typeof h === "string") &&
    typeof e.firstSeen === "string" &&
    typeof e.lastSeen === "string"
  );
}

function isRegistry(v: unknown): v is Registry {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.schemaVersion === 1 &&
    Array.isArray(r.projects) &&
    r.projects.every(isEntry)
  );
}

/** Absolute path, resolved through symlinks when it exists (/tmp vs /private/tmp). */
export function canonicalProjectPath(p: string): string {
  const abs = resolve(p);
  return existsSync(abs) ? realpathSync(abs) : abs;
}

/** Read the registry. Never throws: missing → empty, corrupt → empty + warning. */
export function readRegistry(): { registry: Registry; warning?: string } {
  const file = projectsRegistryPath();
  const empty: Registry = { schemaVersion: 1, projects: [] };
  if (!existsSync(file)) return { registry: empty };
  const data = readJson<unknown>(file);
  if (!isRegistry(data)) {
    return {
      registry: empty,
      warning: `Ignoring unreadable project registry at ${file}`,
    };
  }
  return { registry: data };
}

/** Read for a write: an unreadable (not missing) registry is never overwritten. */
function readRegistryForWrite(): Registry {
  const { registry, warning } = readRegistry();
  if (warning) {
    throw new CliError(
      "INVALID_VALUE",
      `${warning}; refusing to overwrite it — fix or delete the file first`,
    );
  }
  return registry;
}

/** Add a project or refresh it: merge hosts, keep firstSeen, bump lastSeen. */
export function upsertProject(path: string, host?: string): ProjectEntry {
  const registry = readRegistryForWrite();
  const canonical = canonicalProjectPath(path);
  const now = new Date().toISOString();
  let entry = registry.projects.find((p) => p.path === canonical);
  if (!entry) {
    entry = { path: canonical, hosts: [], firstSeen: now, lastSeen: now };
    registry.projects.push(entry);
  }
  if (host && !entry.hosts.includes(host)) entry.hosts.push(host);
  entry.lastSeen = now;
  writeJsonAtomic(projectsRegistryPath(), registry);
  return entry;
}

/** Remove a project. Returns false when it was not registered. */
export function removeProject(path: string): boolean {
  const registry = readRegistryForWrite();
  const canonical = canonicalProjectPath(path);
  const before = registry.projects.length;
  registry.projects = registry.projects.filter((p) => p.path !== canonical);
  if (registry.projects.length === before) return false;
  writeJsonAtomic(projectsRegistryPath(), registry);
  return true;
}

/** List projects with a computed (never persisted) `exists` flag. */
export function listProjects(): {
  projects: ListedProject[];
  warning?: string;
} {
  const { registry, warning } = readRegistry();
  const projects = registry.projects.map((p) => ({
    ...p,
    exists: existsSync(p.path),
  }));
  return warning ? { projects, warning } : { projects };
}
