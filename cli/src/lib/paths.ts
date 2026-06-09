import { homedir } from "os";
import { resolve, join, isAbsolute } from "path";

const CODEX_MARKETPLACE_NAME = "coding-friend-marketplace";
const CODEX_PLUGIN_NAME = "coding-friend";

/**
 * Resolve a path that may be absolute, start with ~/, or be relative.
 * Relative paths are resolved from the given base (defaults to cwd).
 */
export function resolvePath(p: string, base: string = process.cwd()): string {
  if (isAbsolute(p)) return p;
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

/**
 * Resolve Claude Code's global config directory.
 * Honors CLAUDE_CONFIG_DIR (a single directory, default ~/.claude). Read fresh on every call —
 * never cached — so it only affects sessions launched with the env var set.
 * Returns the config dir ITSELF: settings.json, plugins/, projects/, .credentials.json, and the
 * in-.claude .mcp.json all live directly under it. NOTE: the HOME-level ~/.claude.json file is
 * intentionally NOT relocated by this helper (per Claude Code docs it stays at ~/.claude.json).
 *
 * Resolution rule: tilde-expands a leading `~` and otherwise uses the value verbatim (no cwd
 * anchoring for relative paths). Intentionally mirrors the Phase 3 bash `cf_claude_dir()` helper
 * so all CF surfaces resolve the var identically.
 */
export function claudeConfigDir(): string {
  const env = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (!env) return join(homedir(), ".claude");
  if (env === "~") return homedir();
  if (env.startsWith("~/")) return join(homedir(), env.slice(2));
  return env; // absolute used as-is; relative left as-is (undocumented, matches the bash helper)
}

/** Path to Claude global settings */
export function claudeSettingsPath(): string {
  return join(claudeConfigDir(), "settings.json");
}

/** Path to Claude project settings (<project>/.claude/settings.json) */
export function claudeProjectSettingsPath(): string {
  return resolve(process.cwd(), ".claude", "settings.json");
}

/** Path to Claude project-local settings (<project>/.claude/settings.local.json) */
export function claudeLocalSettingsPath(): string {
  return resolve(process.cwd(), ".claude", "settings.local.json");
}

/** Path to installed plugins file */
export function installedPluginsPath(): string {
  return join(claudeConfigDir(), "plugins", "installed_plugins.json");
}

/** Plugin cache base path */
export function pluginCachePath(): string {
  return join(
    claudeConfigDir(),
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
  return join(claudeConfigDir(), "plugins", "known_marketplaces.json");
}

/** Marketplace cache directory (parent of pluginCachePath) */
export function marketplaceCachePath(): string {
  return join(
    claudeConfigDir(),
    "plugins",
    "cache",
    "coding-friend-marketplace",
  );
}

/** Marketplace clone directory */
export function marketplaceClonePath(): string {
  return join(
    claudeConfigDir(),
    "plugins",
    "marketplaces",
    "coding-friend-marketplace",
  );
}

/** Global config directory (~/.coding-friend) */
export function globalConfigDir(): string {
  return join(homedir(), ".coding-friend");
}

/** Memory dependencies directory (~/.coding-friend/memory) */
export function memoryDepsDir(): string {
  return join(homedir(), ".coding-friend", "memory");
}

/**
 * Encode an absolute project path to Claude Code's directory name format.
 * Claude Code stores sessions under ~/.claude/projects/<encodedPath>/
 * Encoding: replace all path separators ("/" and "\") and colons with "-"
 * e.g. /Users/thi/git/foo → -Users-thi-git-foo
 * e.g. C:\Users\thi\git\foo → C--Users-thi-git-foo
 */
export function encodeProjectPath(absolutePath: string): string {
  return absolutePath.replace(/[\\/:]/g, "-");
}

/** Path to Claude Code's projects directory (~/.claude/projects) */
export function claudeProjectsDir(): string {
  return join(claudeConfigDir(), "projects");
}

/** Path to a specific project's session directory (~/.claude/projects/<encodedPath>) */
export function claudeSessionDir(encodedPath: string): string {
  return join(claudeProjectsDir(), encodedPath);
}

/**
 * Resolve Codex's global config directory.
 * Honors CODEX_HOME (default ~/.codex), matching Codex CLI's own config lookup.
 */
export function codexConfigDir(): string {
  const env = process.env.CODEX_HOME?.trim();
  if (!env) return join(homedir(), ".codex");
  if (env === "~") return homedir();
  if (env.startsWith("~/")) return join(homedir(), env.slice(2));
  return env;
}

/** Path to Codex global config.toml */
export function codexConfigTomlPath(): string {
  return join(codexConfigDir(), "config.toml");
}

/** Codex plugin cache directory */
export function codexPluginsCacheDir(): string {
  return join(codexConfigDir(), "plugins", "cache");
}

/** Codex Coding Friend installed plugin cache directory */
export function codexInstalledPluginsPath(): string {
  return join(codexPluginsCacheDir(), CODEX_MARKETPLACE_NAME, CODEX_PLUGIN_NAME);
}

/** Codex marketplace clone/snapshot directory */
export function codexMarketplaceClonePath(): string {
  return join(
    codexConfigDir(),
    "plugins",
    "marketplaces",
    CODEX_MARKETPLACE_NAME,
  );
}

/** Codex sessions directory */
export function codexProjectsDir(): string {
  return join(codexConfigDir(), "sessions");
}

/** Codex session directory for a date: ~/.codex/sessions/YYYY/MM/DD */
export function codexSessionDir(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return join(codexProjectsDir(), year, month, day);
}

/** Repo-local Codex marketplace file */
export function codexLocalMarketplacePath(): string {
  return resolve(process.cwd(), ".agents", "plugins", "marketplace.json");
}

/** Personal Codex agents directory */
export function codexAgentsDir(): string {
  return join(codexConfigDir(), "agents");
}
