import { existsSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { compareVersions } from "./host.js";
import { pluginCachePath } from "./paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve path to a lib package (learn-host, learn-mcp, or cf-memory).
 * Lives at cli/lib/<name> in both development and production.
 */
export function getLibPath(
  name: "learn-host" | "learn-mcp" | "cf-memory",
): string {
  // Production (bundled): __dirname = dist/ → ../lib/<name>
  const bundled = join(__dirname, "..", "lib", name);
  if (existsSync(bundled)) return bundled;

  // Development (tsx): __dirname = src/lib/ → ../../lib/<name>
  const dev = join(__dirname, "..", "..", "lib", name);
  if (existsSync(dev)) return dev;

  throw new Error(
    `Could not find lib/${name}. Ensure it exists in the CLI package.`,
  );
}

function existingOmpExtension(root: string): string | null {
  const nested = join(root, "plugin", "omp", "extension.ts");
  if (existsSync(nested)) return nested;
  const flat = join(root, "omp", "extension.ts");
  if (existsSync(flat)) return flat;
  return null;
}

function cachedOmpExtensionDirs(cacheRoot: string): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const versions = names
    .filter((name) => /^\d/.test(name))
    .sort(compareVersions)
    .reverse();
  const rest = names.filter((name) => !/^\d/.test(name));
  return [...versions, ...rest].map((name) => join(cacheRoot, name));
}

function cachedOmpExtension(): string | null {
  const cacheRoot = pluginCachePath();
  if (!existsSync(cacheRoot)) return null;

  const direct = existingOmpExtension(cacheRoot);
  if (direct) return direct;

  for (const dir of cachedOmpExtensionDirs(cacheRoot)) {
    const found = existingOmpExtension(dir);
    if (found) return found;
  }
  return null;
}

/**
 * Absolute path to plugin/omp/extension.ts: repo (cwd, then parent),
 * then the Claude plugin cache. Null when none of those files exist.
 */
export function getOmpExtensionPath(repoRoot = process.cwd()): string | null {
  const root = resolve(repoRoot);
  const fromCwd = existingOmpExtension(root);
  if (fromCwd) return fromCwd;

  const fromParent = existingOmpExtension(resolve(root, ".."));
  if (fromParent) return fromParent;

  return cachedOmpExtension();
}
