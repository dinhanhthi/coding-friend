import { readJson, writeJson } from "./json.js";

export interface PermissionRule {
  rule: string;
  description: string;
  category: string;
  recommended: boolean;
}

// ─── Static permission rules (all skills/agents/hooks) ─────────────

export const PERMISSION_RULES: PermissionRule[] = [
  // Core (hooks & infrastructure)
  {
    rule: "Bash(cat:*)",
    description:
      "[read-only] Read file contents (⚠ system-wide scope, project boundary enforced by Claude Code) · Used by: session-init hook",
    category: "Core",
    recommended: true,
  },
  {
    rule: "Bash(grep:*)",
    description:
      "[read-only] Search file contents (⚠ system-wide scope, project boundary enforced by Claude Code) · Used by: session-init hook, skills",
    category: "Core",
    recommended: true,
  },
  {
    rule: "Bash(sed:*)",
    description: "[modify] Text transformation · Used by: session-init hook",
    category: "Core",
    recommended: true,
  },
  {
    rule: "Bash(tr:*)",
    description:
      "[read-only] Character translation · Used by: session-init hook",
    category: "Core",
    recommended: true,
  },
  {
    rule: "Bash(wc:*)",
    description:
      "[read-only] Count lines/words · Used by: cf-verification, skills",
    category: "Core",
    recommended: true,
  },
  {
    rule: "Bash(mkdir:*)",
    description: "[write] Create directories · Used by: docs folder setup",
    category: "Core",
    recommended: true,
  },

  // Git Operations
  {
    rule: "Bash(git add:*)",
    description:
      "[modify] Stage files for commit · Used by: /cf-commit, /cf-ship",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git commit:*)",
    description: "[modify] Create commits · Used by: /cf-commit, /cf-ship",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git status:*)",
    description:
      "[read-only] Check working tree status · Used by: /cf-commit, /cf-review, cf-verification",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git diff:*)",
    description:
      "[read-only] View file changes · Used by: /cf-commit, /cf-review, cf-verification",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git log:*)",
    description:
      "[read-only] View commit history · Used by: /cf-commit, /cf-review, cf-sys-debug",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git push:*)",
    description: "[remote] Push commits to remote · Used by: /cf-ship",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(git pull:*)",
    description: "[remote] Pull changes from remote · Used by: /cf-ship",
    category: "Git",
    recommended: true,
  },
  {
    rule: "Bash(gh pr create:*)",
    description: "[remote] Create GitHub pull requests · Used by: /cf-ship",
    category: "Git",
    recommended: true,
  },

  // Testing & Build
  {
    rule: "Bash(npm test:*)",
    description:
      "[execute] Run test suites · Used by: cf-verification, /cf-fix, cf-tdd",
    category: "Testing & Build",
    recommended: true,
  },
  {
    rule: "Bash(npm run:*)",
    description:
      "[execute] Run npm scripts (build, lint, format) · Used by: cf-verification",
    category: "Testing & Build",
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
      rule: `Bash(cd ${quoted} && git add:*)`,
      description:
        "[modify] Stage learning docs for commit · Used by: /cf-learn auto-commit",
      category: "External Learn Directory",
      recommended: true,
    });
    rules.push({
      rule: `Bash(cd ${quoted} && git commit:*)`,
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
