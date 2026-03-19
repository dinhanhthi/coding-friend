import { homedir } from "os";
import { readJson, writeJson } from "./json.js";

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

// ─── Tier 2: Plugin rules (version-independent) ────────────────────

/** Tilde path for Read rules (Read expands ~ automatically). */
const PLUGIN_CACHE_TILDE =
  "~/.claude/plugins/cache/coding-friend-marketplace/coding-friend";

/**
 * Build Tier 2 permission rules for plugin scripts.
 * Uses two Bash rules (unquoted + quoted paths) to cover all plugin scripts
 * across all versions, so permissions survive automatic plugin updates.
 *
 * Claude Code may invoke scripts with or without quotes around the path
 * (e.g. `bash /path/script.sh` vs `bash "/path/script.sh"`), and the
 * permission matcher treats quotes as literal characters — so both
 * variants need their own rule.
 *
 * Bash rules use absolute path because ~ is NOT expanded in Bash() rules.
 * Read rules use ~ because Read() rules DO expand ~ (gitignore spec).
 */
export function buildPluginScriptRules(): PermissionRule[] {
  // Bash rules require absolute path — ~ is not expanded for Bash()
  const absBase = `${homedir()}/.claude/plugins/cache/coding-friend-marketplace/coding-friend`;

  return [
    {
      rule: `Bash(bash ${absBase}/*)`,
      description:
        "[execute] Run Coding Friend plugin scripts (unquoted) · Used by: all skills",
      category: "Plugin Scripts",
      recommended: true,
    },
    {
      rule: `Bash(bash "${absBase}/*)`,
      description:
        "[execute] Run Coding Friend plugin scripts (quoted) · Used by: all skills",
      category: "Plugin Scripts",
      recommended: true,
    },
    {
      rule: `Read(${PLUGIN_CACHE_TILDE}/**)`,
      description: "[read-only] Read plugin files · Used by: hooks, agents",
      category: "Plugin Scripts",
      recommended: true,
    },
    {
      rule: "Read(~/.coding-friend/**)",
      description:
        "[read-only] Read user global config · Used by: session-init hook, /cf-learn",
      category: "Plugin Scripts",
      recommended: true,
    },
  ];
}

/**
 * Get all permission rules: Tier 1 (static) + Tier 2 (plugin scripts).
 */
export function getAllRules(): PermissionRule[] {
  return [...STATIC_RULES, ...buildPluginScriptRules()];
}

/** Backward-compatible alias. */
export const PERMISSION_RULES: PermissionRule[] = getAllRules();

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

// ─── Migration ──────────────────────────────────────────────────────

/** Pattern that identifies old per-script plugin-path permissions. */
const OLD_PLUGIN_PATH_PATTERN =
  "/.claude/plugins/cache/coding-friend-marketplace/coding-friend/";

/**
 * Remove stale old-format per-script plugin rules from a settings file.
 * Old rules had individual paths like ".../coding-friend/0.11.1/lib/load-custom-guide.sh *"
 * or glob "*\/" in the middle. The new format uses a single wide rule.
 * Returns the count of removed rules, or 0 if none found.
 */
export function cleanupStalePluginRules(settingsPath: string): number {
  const existing = getExistingRules(settingsPath);
  const currentRules = new Set(getAllRules().map((r) => r.rule));

  // Find old plugin-path rules that are NOT in the current rule set
  const stale = existing.filter(
    (r) => r.includes(OLD_PLUGIN_PATH_PATTERN) && !currentRules.has(r),
  );

  if (stale.length === 0) return 0;

  applyPermissions(settingsPath, [], stale);
  return stale.length;
}

// ─── Shared UI helpers ──────────────────────────────────────────────

/**
 * Log the warning about the wide plugin script permission pattern.
 * Shared between permission.ts and init.ts to keep the text consistent.
 */
export function logPluginScriptWarning(
  log: { warn: (msg: string) => void; dim: (msg: string) => void },
  chalk: { bold: (s: string) => string },
): void {
  log.warn(
    `Plugin script rules use ${chalk.bold("wide patterns")} that allow executing any script in the Coding Friend plugin cache.`,
  );
  log.dim(
    "This is scoped to Coding Friend only and survives plugin updates automatically.",
  );
}
