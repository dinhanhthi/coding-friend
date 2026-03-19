import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { readJson, writeJson } from "./json.js";
import { pluginCachePath } from "./paths.js";

export interface PermissionRule {
  rule: string;
  description: string;
  category: string;
  recommended: boolean;
}

// ─── Tier 1: Static rules (path-independent, always stable) ────────

export const STATIC_RULES: PermissionRule[] = [
  // Core Utilities (hooks & infrastructure)
  {
    rule: "Bash(cat *)",
    description:
      "[read-only] Read file contents · Used by: session-init hook, skills",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(grep *)",
    description:
      "[read-only] Search file contents · Used by: session-init hook, skills",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(sed *)",
    description: "[modify] Text transformation · Used by: session-init hook",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(tr *)",
    description:
      "[read-only] Character translation · Used by: session-init hook",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(wc *)",
    description:
      "[read-only] Count lines/words · Used by: cf-verification, skills",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(mkdir *)",
    description:
      "[write] Create directories · Used by: docs folder setup, /tmp/coding-friend",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(find *)",
    description: "[read-only] Find files · Used by: /cf-learn list-learn-files",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(ls *)",
    description:
      "[read-only] List files · Used by: statusline hook, session-init hook",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(jq *)",
    description:
      "[read-only] Parse JSON · Used by: statusline hook, session-init hook, memory-capture hook",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(date *)",
    description: "[read-only] Format timestamps · Used by: statusline hook",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(pwd)",
    description:
      "[read-only] Get current directory · Used by: session-init hook, /cf-learn",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(stat *)",
    description:
      "[read-only] File stats · Used by: statusline hook cache check",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(node -e *)",
    description:
      "[execute] Run inline Node.js · Used by: memory-capture hook JSON parsing",
    category: "Core Utilities",
    recommended: true,
  },
  {
    rule: "Bash(touch /tmp/coding-friend/*)",
    description:
      "[write] Create temp marker files · Used by: /cf-review mark-reviewed",
    category: "Core Utilities",
    recommended: true,
  },

  // Git Operations
  {
    rule: "Bash(git status *)",
    description:
      "[read-only] Check working tree status · Used by: /cf-commit, /cf-review, cf-verification",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git diff *)",
    description:
      "[read-only] View file changes · Used by: /cf-commit, /cf-review, cf-verification",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git log *)",
    description:
      "[read-only] View commit history · Used by: /cf-commit, /cf-review, cf-sys-debug",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git branch *)",
    description:
      "[read-only] List/manage branches · Used by: /cf-ship, cf-sys-debug",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git rev-parse *)",
    description:
      "[read-only] Check git repo state · Used by: hooks, /cf-commit",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git add *)",
    description:
      "[modify] Stage files for commit · Used by: /cf-commit, /cf-ship",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git reset HEAD *)",
    description: "[modify] Unstage files · Used by: /cf-commit",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git commit *)",
    description: "[modify] Create commits · Used by: /cf-commit, /cf-ship",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git push *)",
    description: "[remote] Push commits to remote · Used by: /cf-ship",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git pull *)",
    description: "[remote] Pull changes from remote · Used by: /cf-ship",
    category: "Git",
    recommended: true,
  },

  // GitHub CLI
  {
    rule: "Bash(gh pr *)",
    description: "[remote] Manage GitHub pull requests · Used by: /cf-ship",
    category: "GitHub CLI",
    recommended: true,
  },

  // Testing & Build
  {
    rule: "Bash(npm test *)",
    description:
      "[execute] Run test suites · Used by: cf-verification, /cf-fix, cf-tdd",
    category: "Testing & Build",
    recommended: true,
  },
  {
    rule: "Bash(npm run *)",
    description:
      "[execute] Run npm scripts (build, lint, format) · Used by: cf-verification, /cf-commit",
    category: "Testing & Build",
    recommended: true,
  },
  {
    rule: "Bash(npx *)",
    description:
      "[execute] Run npx commands (eslint, tsc) · Used by: cf-verification",
    category: "Testing & Build",
    recommended: true,
  },

  // MCP Memory Tools
  {
    rule: "mcp__coding-friend-memory__memory_search",
    description:
      "[read-only] Search project memories · Used by: cf-explorer agent, all skills",
    category: "MCP Memory",
    recommended: true,
  },
  {
    rule: "mcp__coding-friend-memory__memory_list",
    description: "[read-only] List all memories · Used by: /cf-scan",
    category: "MCP Memory",
    recommended: true,
  },
  {
    rule: "mcp__coding-friend-memory__memory_retrieve",
    description: "[read-only] Get a specific memory by ID · Used by: skills",
    category: "MCP Memory",
    recommended: true,
  },
  {
    rule: "mcp__coding-friend-memory__memory_store",
    description:
      "[write] Create new memory · Used by: /cf-remember, /cf-scan, /cf-ask",
    category: "MCP Memory",
    recommended: true,
  },
  {
    rule: "mcp__coding-friend-memory__memory_update",
    description:
      "[modify] Update existing memory · Used by: /cf-remember, /cf-scan",
    category: "MCP Memory",
    recommended: true,
  },
  {
    rule: "mcp__coding-friend-memory__memory_delete",
    description: "[modify] Delete a memory · Used by: /cf-scan",
    category: "MCP Memory",
    recommended: true,
  },

  // Web & Research
  {
    rule: "WebSearch",
    description: "[network] Perform web searches · Used by: /cf-research",
    category: "Web & Research",
    recommended: false,
  },
  {
    rule: "WebFetch(domain:*)",
    description:
      "[network] Fetch content from web pages · Used by: /cf-research",
    category: "Web & Research",
    recommended: false,
  },
];

// ─── Tier 2: Path-dependent rules (plugin scripts) ─────────────────

const PLUGIN_CACHE_GLOB =
  "~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/*";

/** Plugin script paths relative to plugin root. */
const PLUGIN_SCRIPTS: Array<{ path: string; description: string }> = [
  {
    path: "lib/load-custom-guide.sh",
    description: "[execute] Load custom skill guides · Used by: all skills",
  },
  {
    path: "skills/cf-commit/scripts/analyze-changes.sh",
    description:
      "[execute] Analyze git changes for commit · Used by: /cf-commit",
  },
  {
    path: "skills/cf-commit/scripts/scan-secrets.sh",
    description:
      "[execute] Scan staged changes for secrets · Used by: /cf-commit",
  },
  {
    path: "skills/cf-review/scripts/gather-diff.sh",
    description: "[execute] Gather diff for review · Used by: /cf-review",
  },
  {
    path: "skills/cf-review/scripts/assess-changes.sh",
    description:
      "[execute] Assess change size/sensitivity · Used by: /cf-review",
  },
  {
    path: "skills/cf-review/scripts/mark-reviewed.sh",
    description: "[execute] Mark review as complete · Used by: /cf-review",
  },
  {
    path: "skills/cf-learn/scripts/list-learn-files.sh",
    description: "[execute] List existing learn files · Used by: /cf-learn",
  },
  {
    path: "skills/cf-session/scripts/detect-session.sh",
    description: "[execute] Detect current session · Used by: /cf-session",
  },
  {
    path: "skills/cf-session/scripts/save-session.sh",
    description: "[execute] Save session state · Used by: /cf-session",
  },
];

/**
 * Build Tier 2 permission rules for plugin scripts.
 * - 'glob' mode: uses wildcard * for version segment (stable across updates)
 * - 'concrete' mode: uses actual plugin path (fallback if glob matching has bugs)
 */
export function buildPluginScriptRules(
  mode: "glob" | "concrete",
  pluginPath?: string,
): PermissionRule[] {
  const base =
    mode === "concrete" && pluginPath ? pluginPath : PLUGIN_CACHE_GLOB;

  const rules: PermissionRule[] = PLUGIN_SCRIPTS.map((script) => ({
    rule: `Bash(bash ${base}/${script.path} *)`,
    description: script.description,
    category: "Plugin Scripts",
    recommended: true,
  }));

  // Read access to plugin files and user global config
  rules.push({
    rule: `Read(~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/**)`,
    description: "[read-only] Read plugin files · Used by: hooks, agents",
    category: "Plugin Scripts",
    recommended: true,
  });
  rules.push({
    rule: "Read(~/.coding-friend/**)",
    description:
      "[read-only] Read user global config · Used by: session-init hook, /cf-learn",
    category: "Plugin Scripts",
    recommended: true,
  });

  return rules;
}

/**
 * Get all permission rules: Tier 1 (static) + Tier 2 (plugin scripts).
 */
export function getAllRules(
  pluginScriptMode: "glob" | "concrete" = "glob",
  pluginPath?: string,
): PermissionRule[] {
  return [
    ...STATIC_RULES,
    ...buildPluginScriptRules(pluginScriptMode, pluginPath),
  ];
}

/** Backward-compatible alias — returns all rules with glob-mode plugin paths. */
export const PERMISSION_RULES: PermissionRule[] = getAllRules("glob");

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Read existing permission rules from a Claude settings.json file.
 */
export function getExistingRules(settingsPath: string): string[] {
  const settings = readJson<Record<string, unknown>>(settingsPath);
  if (!settings) return [];
  const permissions = settings.permissions as { allow?: string[] } | undefined;
  return permissions?.allow ?? [];
}

/**
 * Return rules from `rules` that are not yet in `existing`.
 */
export function getMissingRules(
  existing: string[],
  rules: PermissionRule[],
): PermissionRule[] {
  return rules.filter((r) => !existing.includes(r.rule));
}

/**
 * Build dynamic permission rules for an external /cf-learn output directory.
 */
export function buildLearnDirRules(
  learnPath: string,
  autoCommit: boolean,
): PermissionRule[] {
  const rules: PermissionRule[] = [
    {
      rule: `Read(${learnPath}/**)`,
      description: "[read-only] Read learning docs · Used by: /cf-learn",
      category: "External Learn Directory",
      recommended: true,
    },
    {
      rule: `Edit(${learnPath}/**)`,
      description: "[modify] Edit learning docs · Used by: /cf-learn",
      category: "External Learn Directory",
      recommended: true,
    },
    {
      rule: `Write(${learnPath}/**)`,
      description: "[write] Write learning docs · Used by: /cf-learn",
      category: "External Learn Directory",
      recommended: true,
    },
  ];

  if (autoCommit) {
    const quoted = learnPath.includes(" ") ? `"${learnPath}"` : learnPath;
    rules.push({
      rule: `Bash(cd ${quoted} && git add *)`,
      description:
        "[modify] Stage learning docs for commit · Used by: /cf-learn auto-commit",
      category: "External Learn Directory",
      recommended: true,
    });
    rules.push({
      rule: `Bash(cd ${quoted} && git commit *)`,
      description:
        "[modify] Commit learning docs · Used by: /cf-learn auto-commit",
      category: "External Learn Directory",
      recommended: true,
    });
  }

  return rules;
}

/**
 * Apply permission changes to a Claude settings.json file.
 * Adds `toAdd` rules and removes `toRemove` rules.
 */
export function applyPermissions(
  settingsPath: string,
  toAdd: string[],
  toRemove: string[],
): void {
  const settings = readJson<Record<string, unknown>>(settingsPath) ?? {};
  const permissions = (settings.permissions ?? {}) as {
    allow?: string[];
    deny?: string[];
  };
  const existing = permissions.allow ?? [];

  // Remove first, then add (avoid duplicates)
  const afterRemove = existing.filter((r) => !toRemove.includes(r));
  const afterAdd = [
    ...afterRemove,
    ...toAdd.filter((r) => !afterRemove.includes(r)),
  ];

  permissions.allow = afterAdd;
  settings.permissions = permissions;
  writeJson(settingsPath, settings);
}

/**
 * Group permission rules by category for display.
 */
export function groupByCategory(
  rules: PermissionRule[],
): Map<string, PermissionRule[]> {
  const groups = new Map<string, PermissionRule[]>();
  for (const rule of rules) {
    const list = groups.get(rule.category) ?? [];
    list.push(rule);
    groups.set(rule.category, list);
  }
  return groups;
}

// ─── Plugin path detection ──────────────────────────────────────────

/** Pattern that identifies Coding Friend plugin-path permissions. */
const PLUGIN_PATH_PATTERN =
  "/.claude/plugins/cache/coding-friend-marketplace/coding-friend/";

/**
 * Detect the installed plugin version directory.
 * Returns the full path (e.g. ~/.claude/plugins/cache/.../0.11.1) or null.
 */
export function getInstalledPluginPath(): string | null {
  const base = pluginCachePath();
  if (!existsSync(base)) return null;

  const entries = readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => semverCompare(b, a)); // latest version first

  if (entries.length === 0) return null;
  return join(base, entries[0]);
}

/** Returns 1 if a > b, -1 if a < b, 0 if equal. */
function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Refresh Tier 2 (plugin-path) permissions in a settings file.
 * Replaces old versioned paths with current plugin path.
 * Returns count of updated rules, or null if no plugin rules found.
 */
export function refreshPluginPermissions(
  settingsPath: string,
): { updated: number } | null {
  const existing = getExistingRules(settingsPath);
  const pluginRules = existing.filter((r) => r.includes(PLUGIN_PATH_PATTERN));

  if (pluginRules.length === 0) return null;

  const pluginPath = getInstalledPluginPath();
  if (!pluginPath) return null;

  // Build new concrete rules
  const newRules = buildPluginScriptRules("concrete", pluginPath);
  const newRuleStrings = newRules.map((r) => r.rule);

  // Remove old plugin-path rules, add new ones
  applyPermissions(settingsPath, newRuleStrings, pluginRules);

  return { updated: newRuleStrings.length };
}
