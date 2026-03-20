import { readJson } from "./json.js";
import { localConfigPath, globalConfigPath, resolvePath } from "./paths.js";
import { CodingFriendConfig, DEFAULT_CONFIG } from "../types.js";

/**
 * Deep merge two plain objects. Local values override global at every nesting
 * level, but sibling keys from global are preserved (not dropped).
 */
function deepMerge<T extends Record<string, unknown>>(base: T, override: T): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
    const baseVal = result[key];
    const overVal = override[key];
    if (
      baseVal &&
      overVal &&
      typeof baseVal === "object" &&
      typeof overVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else {
      result[key] = overVal;
    }
  }
  return result as T;
}

/**
 * Load merged config: local deep-merges over global, both deep-merge over defaults.
 */
export function loadConfig(): CodingFriendConfig {
  const global = readJson<CodingFriendConfig>(globalConfigPath());
  const local = readJson<CodingFriendConfig>(localConfigPath());
  const base = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    (global ?? {}) as Record<string, unknown>,
  );
  return deepMerge(
    base,
    (local ?? {}) as Record<string, unknown>,
  ) as CodingFriendConfig;
}

/**
 * Resolve the docs directory for learn commands.
 * Priority: explicit arg > config learn.outputDir > default docs/learn
 */
export function resolveDocsDir(explicitPath?: string): string {
  if (explicitPath) {
    return resolvePath(explicitPath);
  }

  const local = readJson<CodingFriendConfig>(localConfigPath());
  if (local?.learn?.outputDir) {
    return resolvePath(local.learn.outputDir);
  }

  const global = readJson<CodingFriendConfig>(globalConfigPath());
  if (global?.learn?.outputDir) {
    return resolvePath(global.learn.outputDir);
  }

  return resolvePath("docs/learn");
}

/**
 * Resolve the docs directory for memory commands.
 * Priority: explicit arg > config.docsDir + "/memory" > default "docs/memory"
 */
export function resolveMemoryDir(explicitPath?: string): string {
  if (explicitPath) {
    return resolvePath(explicitPath);
  }

  const config = loadConfig();

  if (config.docsDir) {
    return resolvePath(`${config.docsDir}/memory`);
  }

  return resolvePath("docs/memory");
}
