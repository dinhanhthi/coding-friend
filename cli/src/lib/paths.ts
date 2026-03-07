import { homedir } from "os";
import { resolve, join } from "path";

/**
 * Resolve a path that may be absolute, start with ~/, or be relative.
 * Relative paths are resolved from the given base (defaults to cwd).
 */
export function resolvePath(p: string, base: string = process.cwd()): string {
  if (p.startsWith("/")) return p;
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return resolve(base, p);
}

/** Path to local project config */
export function localConfigPath(): string {
  return resolve(process.cwd(), ".coding-friend", "config.json");
}

/** Path to global user config */
export function globalConfigPath(): string {
  return join(homedir(), ".coding-friend", "config.json");
}

/** Path to Claude settings */
export function claudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/** Path to installed plugins file */
export function installedPluginsPath(): string {
  return join(homedir(), ".claude", "plugins", "installed_plugins.json");
}

/** Plugin cache base path */
export function pluginCachePath(): string {
  return join(
    homedir(),
    ".claude",
    "plugins",
    "cache",
    "coding-friend-marketplace",
    "coding-friend",
  );
}

/** Path to dev mode state file */
export function devStatePath(): string {
  return join(homedir(), ".coding-friend", "dev-state.json");
}

/** Path to Claude known marketplaces */
export function knownMarketplacesPath(): string {
  return join(homedir(), ".claude", "plugins", "known_marketplaces.json");
}

/** Marketplace cache directory (parent of pluginCachePath) */
export function marketplaceCachePath(): string {
  return join(
    homedir(),
    ".claude",
    "plugins",
    "cache",
    "coding-friend-marketplace",
  );
}

/** Marketplace clone directory */
export function marketplaceClonePath(): string {
  return join(
    homedir(),
    ".claude",
    "plugins",
    "marketplaces",
    "coding-friend-marketplace",
  );
}

/** Global config directory (~/.coding-friend) */
export function globalConfigDir(): string {
  return join(homedir(), ".coding-friend");
}

/**
 * Encode an absolute project path to Claude Code's directory name format.
 * Claude Code stores sessions under ~/.claude/projects/<encodedPath>/
 * Encoding: replace all "/" with "-"
 * e.g. /Users/thi/git/foo → -Users-thi-git-foo
 */
export function encodeProjectPath(absolutePath: string): string {
  return absolutePath.replace(/\//g, "-");
}

/** Path to Claude Code's projects directory (~/.claude/projects) */
export function claudeProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

/** Path to a specific project's session directory (~/.claude/projects/<encodedPath>) */
export function claudeSessionDir(encodedPath: string): string {
  return join(claudeProjectsDir(), encodedPath);
}
