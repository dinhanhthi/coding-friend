import { readJson } from "./json.js";
import { localConfigPath, globalConfigPath, resolvePath } from "./paths.js";
import { CodingFriendConfig, DEFAULT_CONFIG } from "../types.js";

/**
 * Load merged config: local overrides global at top-level key level.
 */
export function loadConfig(): CodingFriendConfig {
  const global = readJson<CodingFriendConfig>(globalConfigPath());
  const local = readJson<CodingFriendConfig>(localConfigPath());
  return { ...DEFAULT_CONFIG, ...global, ...local };
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
 * Priority: explicit arg > config.memory.docsDir > config.docsDir + "/memory" > default "docs/memory"
 */
export function resolveMemoryDir(explicitPath?: string): string {
  if (explicitPath) {
    return resolvePath(explicitPath);
  }

  const config = loadConfig();

  if (config.memory?.docsDir) {
    return resolvePath(config.memory.docsDir);
  }

  if (config.docsDir) {
    return resolvePath(`${config.docsDir}/memory`);
  }

  return resolvePath("docs/memory");
}
