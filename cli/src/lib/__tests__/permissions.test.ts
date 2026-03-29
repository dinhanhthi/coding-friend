import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { readJson } from "../json.js";
import {
  PERMISSION_RULES,
  STATIC_RULES,
  getExistingRules,
  getMissingRules,
  buildLearnDirRules,
  buildPluginScriptRules,
  getAllRules,
  applyPermissions,
  groupByCategory,
  cleanupStalePluginRules,
  extractTag,
  auditDangerousRules,
  stripDangerousRules,
  DANGEROUS_RULE_PATTERNS,
} from "../permissions.js";
import type { PermissionRule, DangerousRuleMatch } from "../permissions.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-permissions-test-${randomUUID()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("PERMISSION_RULES", () => {
  it("has no duplicate rules", () => {
    const ruleStrings = PERMISSION_RULES.map((r) => r.rule);
    const unique = new Set(ruleStrings);
    expect(unique.size).toBe(ruleStrings.length);
  });

  it("every rule has required fields", () => {
    for (const rule of PERMISSION_RULES) {
      expect(rule.rule).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(typeof rule.recommended).toBe("boolean");
    }
  });
});

describe("getExistingRules", () => {
  it("returns allow array from settings.json", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: { allow: ["Bash(git add *)", "WebSearch"] },
      }),
    );
    expect(getExistingRules(file)).toEqual(["Bash(git add *)", "WebSearch"]);
  });

  it("returns empty array when file does not exist", () => {
    expect(getExistingRules(join(testDir, "nonexistent.json"))).toEqual([]);
  });

  it("returns empty array when permissions.allow is missing", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(file, JSON.stringify({ other: "data" }));
    expect(getExistingRules(file)).toEqual([]);
  });

  it("returns empty array when permissions is empty object", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(file, JSON.stringify({ permissions: {} }));
    expect(getExistingRules(file)).toEqual([]);
  });
});

describe("getMissingRules", () => {
  const rules: PermissionRule[] = [
    { rule: "A", description: "", category: "c", recommended: true },
    { rule: "B", description: "", category: "c", recommended: true },
    { rule: "C", description: "", category: "c", recommended: true },
  ];

  it("returns all rules when none exist", () => {
    expect(getMissingRules([], rules)).toEqual(rules);
  });

  it("filters out rules already in existing", () => {
    expect(getMissingRules(["A", "C"], rules)).toEqual([rules[1]]);
  });

  it("returns empty array when all rules exist", () => {
    expect(getMissingRules(["A", "B", "C"], rules)).toEqual([]);
  });
});

describe("buildLearnDirRules", () => {
  it("generates 3 rules without autoCommit", () => {
    const rules = buildLearnDirRules("~/notes", false);
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.rule)).toEqual([
      "Read(~/notes/**)",
      "Edit(~/notes/**)",
      "Write(~/notes/**)",
    ]);
  });

  it("generates 5 rules with autoCommit", () => {
    const rules = buildLearnDirRules("~/notes", true);
    expect(rules).toHaveLength(5);
    expect(rules[3].rule).toBe("Bash(cd ~/notes && git add *)");
    expect(rules[4].rule).toBe("Bash(cd ~/notes && git commit *)");
  });

  it("all rules have category 'External Learn Directory'", () => {
    const rules = buildLearnDirRules("~/docs", true);
    for (const r of rules) {
      expect(r.category).toBe("External Learn Directory");
    }
  });

  it("quotes paths with spaces in autoCommit rules", () => {
    const rules = buildLearnDirRules("~/my notes/learn", true);
    expect(rules[3].rule).toBe('Bash(cd "~/my notes/learn" && git add *)');
    expect(rules[4].rule).toBe('Bash(cd "~/my notes/learn" && git commit *)');
  });

  it("does not quote paths without spaces", () => {
    const rules = buildLearnDirRules("~/notes", true);
    expect(rules[3].rule).toBe("Bash(cd ~/notes && git add *)");
  });
});

describe("getMissingRules + buildLearnDirRules integration", () => {
  it("returns only missing learn dir rules when some already exist", () => {
    const learnRules = buildLearnDirRules("~/notes", true);
    const existing = [learnRules[0].rule, learnRules[2].rule]; // Read + Write
    const missing = getMissingRules(existing, learnRules);
    expect(missing).toHaveLength(3);
    expect(missing.map((r) => r.rule)).toEqual([
      "Edit(~/notes/**)",
      "Bash(cd ~/notes && git add *)",
      "Bash(cd ~/notes && git commit *)",
    ]);
  });

  it("returns empty when all learn dir rules already exist", () => {
    const learnRules = buildLearnDirRules("~/notes", false);
    const existing = learnRules.map((r) => r.rule);
    expect(getMissingRules(existing, learnRules)).toEqual([]);
  });
});

describe("applyPermissions", () => {
  it("adds new rules to empty settings", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(file, JSON.stringify({ permissions: {} }));

    applyPermissions(file, ["Bash(git add *)", "WebSearch"], []);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["Bash(git add *)", "WebSearch"]);
  });

  it("removes rules from existing settings", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: { allow: ["A", "B", "C"] },
      }),
    );

    applyPermissions(file, [], ["B"]);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["A", "C"]);
  });

  it("adds and removes in one operation", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: { allow: ["A", "B"] },
      }),
    );

    applyPermissions(file, ["C"], ["A"]);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["B", "C"]);
  });

  it("does not create duplicates when adding existing rules", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: { allow: ["A"] },
      }),
    );

    applyPermissions(file, ["A", "B"], []);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["A", "B"]);
  });

  it("creates settings file when it does not exist", () => {
    const file = join(testDir, "new-settings.json");

    applyPermissions(file, ["Bash(git add *)"], []);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["Bash(git add *)"]);
  });

  it("preserves other settings keys", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        theme: "dark",
        permissions: { allow: ["A"], deny: ["X"] },
      }),
    );

    applyPermissions(file, ["B"], []);

    const result = readJson<Record<string, unknown>>(file);
    expect((result as Record<string, unknown>).theme).toBe("dark");
    const perms = result?.permissions as { allow: string[]; deny: string[] };
    expect(perms.deny).toEqual(["X"]);
    expect(perms.allow).toEqual(["A", "B"]);
  });

  it("is idempotent — running twice produces same result", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(file, JSON.stringify({ permissions: {} }));

    applyPermissions(file, ["A", "B"], []);
    applyPermissions(file, ["A", "B"], []);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["A", "B"]);
  });
});

describe("groupByCategory", () => {
  it("groups rules by category", () => {
    const rules: PermissionRule[] = [
      { rule: "A", description: "", category: "Git", recommended: true },
      { rule: "B", description: "", category: "Core", recommended: true },
      { rule: "C", description: "", category: "Git", recommended: true },
    ];

    const groups = groupByCategory(rules);
    expect(groups.size).toBe(2);
    expect(groups.get("Git")).toHaveLength(2);
    expect(groups.get("Core")).toHaveLength(1);
  });

  it("returns empty map for empty input", () => {
    expect(groupByCategory([])).toEqual(new Map());
  });
});

describe("STATIC_RULES", () => {
  it("has no duplicate rules", () => {
    const ruleStrings = STATIC_RULES.map((r) => r.rule);
    const unique = new Set(ruleStrings);
    expect(unique.size).toBe(ruleStrings.length);
  });

  it("does not contain plugin cache paths", () => {
    for (const rule of STATIC_RULES) {
      expect(rule.rule).not.toContain(".claude/plugins/cache");
    }
  });

  it("uses space-star syntax, not colon-star", () => {
    for (const rule of STATIC_RULES) {
      if (rule.rule.startsWith("Bash(")) {
        expect(rule.rule).not.toMatch(/:\*\)$/);
      }
    }
  });

  it("includes MCP memory tools", () => {
    const mcpRules = STATIC_RULES.filter((r) =>
      r.rule.startsWith("mcp__coding-friend-memory__"),
    );
    expect(mcpRules.length).toBeGreaterThanOrEqual(6);
  });

  it("includes compound cd+git rules for read-only git commands", () => {
    const compoundGitRules = STATIC_RULES.filter((r) =>
      r.rule.startsWith("Bash(cd * && git "),
    );
    const expectedCmds = [
      "Bash(cd * && git status *)",
      "Bash(cd * && git diff *)",
      "Bash(cd * && git log *)",
      "Bash(cd * && git branch *)",
      "Bash(cd * && git rev-parse *)",
    ];
    for (const cmd of expectedCmds) {
      expect(compoundGitRules.map((r) => r.rule)).toContain(cmd);
    }
    expect(compoundGitRules).toHaveLength(expectedCmds.length);
  });

  it("compound cd+git rules are all in Git category and recommended", () => {
    const compoundGitRules = STATIC_RULES.filter((r) =>
      r.rule.startsWith("Bash(cd * && git "),
    );
    for (const rule of compoundGitRules) {
      expect(rule.category).toBe("Git");
      expect(rule.recommended).toBe(true);
    }
  });

  it("compound cd+git rules do not include write operations", () => {
    const compoundGitRules = STATIC_RULES.filter((r) =>
      r.rule.startsWith("Bash(cd * && git "),
    );
    const writeCommands = ["add", "commit", "push", "pull", "reset"];
    for (const rule of compoundGitRules) {
      for (const cmd of writeCommands) {
        expect(rule.rule).not.toContain(`git ${cmd}`);
      }
    }
  });
});

describe("buildPluginScriptRules", () => {
  it("returns version-independent rules with absolute path for Bash", () => {
    const rules = buildPluginScriptRules();
    expect(rules.length).toBe(4); // 2 Bash (unquoted + quoted) + 1 Read plugin + 1 Read config
    const bashRules = rules.filter((r) => r.rule.startsWith("Bash("));
    expect(bashRules).toHaveLength(2);

    // Unquoted rule: Bash(bash /absolute/path/*)
    const unquoted = bashRules[0];
    expect(unquoted.rule).toContain("coding-friend-marketplace/coding-friend");
    expect(unquoted.rule).not.toContain("~");
    expect(unquoted.rule).toMatch(/^Bash\(bash \//); // starts with absolute path
    expect(unquoted.rule).toMatch(/\/\*\)$/); // ends with /*)
    expect(unquoted.rule).not.toMatch(/\/\d+\.\d+\.\d+\//);

    // Quoted rule: Bash(bash "/absolute/path/*)
    const quoted = bashRules[1];
    expect(quoted.rule).toContain("coding-friend-marketplace/coding-friend");
    expect(quoted.rule).not.toContain("~");
    expect(quoted.rule).toMatch(/^Bash\(bash "\//); // starts with bash "/
    expect(quoted.rule).toMatch(/\/\*\)$/); // ends with /*)
    expect(quoted.rule).not.toMatch(/\/\d+\.\d+\.\d+\//);
  });

  it("Read rules use tilde path (Read expands ~)", () => {
    const rules = buildPluginScriptRules();
    const readRules = rules.filter((r) => r.rule.startsWith("Read("));
    for (const rule of readRules) {
      expect(rule.rule).toContain("~");
      expect(rule.rule).not.toMatch(/^Read\(\/Users\//);
    }
  });

  it("all rules have category Plugin Scripts", () => {
    const rules = buildPluginScriptRules();
    for (const rule of rules) {
      expect(rule.category).toBe("Plugin Scripts");
    }
  });

  it("includes Read rules for plugin files and global config", () => {
    const rules = buildPluginScriptRules();
    const readRules = rules.filter((r) => r.rule.startsWith("Read("));
    expect(readRules).toHaveLength(2);
    expect(
      readRules.some((r) => r.rule.includes("coding-friend-marketplace")),
    ).toBe(true);
    expect(readRules.some((r) => r.rule.includes(".coding-friend"))).toBe(true);
  });
});

describe("getAllRules", () => {
  it("always includes static rules", () => {
    const all = getAllRules();
    const staticRules = all.filter((r) => r.category !== "Plugin Scripts");
    expect(staticRules.length).toBe(STATIC_RULES.length);
  });

  it("includes plugin rules", () => {
    const all = getAllRules();
    const pluginRules = all.filter((r) => r.category === "Plugin Scripts");
    expect(pluginRules.length).toBe(4);
    expect(all.length).toBe(STATIC_RULES.length + pluginRules.length);
  });

  it("has no duplicate rules across tiers", () => {
    const all = getAllRules();
    const ruleStrings = all.map((r) => r.rule);
    const unique = new Set(ruleStrings);
    expect(unique.size).toBe(ruleStrings.length);
  });
});

describe("cleanupStalePluginRules", () => {
  it("removes old per-script plugin rules", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: {
          allow: [
            "Bash(git status *)",
            "Bash(bash /home/user/.claude/plugins/cache/coding-friend-marketplace/coding-friend/0.11.1/lib/load-custom-guide.sh *)",
            "Bash(bash /home/user/.claude/plugins/cache/coding-friend-marketplace/coding-friend/*/skills/cf-commit/scripts/analyze-changes.sh *)",
          ],
        },
      }),
    );

    const removed = cleanupStalePluginRules(file);
    expect(removed).toBe(2);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toContain("Bash(git status *)");
    expect(allow).toHaveLength(1);
  });

  it("preserves current managed rules", () => {
    const currentRules = getAllRules();
    const pluginRule = currentRules.find(
      (r) => r.category === "Plugin Scripts" && r.rule.startsWith("Bash("),
    );

    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: {
          allow: [pluginRule!.rule, "Bash(git status *)"],
        },
      }),
    );

    const removed = cleanupStalePluginRules(file);
    expect(removed).toBe(0);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toHaveLength(2);
  });

  it("returns 0 when no stale rules exist", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: { allow: ["Bash(git status *)", "WebSearch"] },
      }),
    );

    expect(cleanupStalePluginRules(file)).toBe(0);
  });

  it("returns 0 for non-existent file", () => {
    expect(cleanupStalePluginRules(join(testDir, "nope.json"))).toBe(0);
  });
});

describe("extractTag", () => {
  it("extracts [read-only] tag from description", () => {
    expect(
      extractTag("[read-only] Check working tree status · Used by: /cf-commit"),
    ).toBe("[read-only]");
  });

  it("extracts [modify] tag", () => {
    expect(
      extractTag("[modify] Stage files for commit · Used by: /cf-commit"),
    ).toBe("[modify]");
  });

  it("extracts [remote] tag", () => {
    expect(
      extractTag("[remote] Push commits to remote · Used by: /cf-ship"),
    ).toBe("[remote]");
  });

  it("extracts [execute] tag", () => {
    expect(extractTag("[execute] Run test suites · Used by: cf-tdd")).toBe(
      "[execute]",
    );
  });

  it("extracts [network] tag", () => {
    expect(
      extractTag("[network] Perform web searches · Used by: /cf-research"),
    ).toBe("[network]");
  });

  it("extracts [write] tag", () => {
    expect(
      extractTag("[write] Create directories · Used by: docs folder setup"),
    ).toBe("[write]");
  });

  it("returns null for description without tag", () => {
    expect(extractTag("Some description without a tag")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractTag("")).toBeNull();
  });

  it("every STATIC_RULES description has a valid tag", () => {
    for (const rule of STATIC_RULES) {
      const tag = extractTag(rule.description);
      expect(tag).not.toBeNull();
    }
  });
});

describe("DANGEROUS_RULE_PATTERNS", () => {
  it("is a non-empty array of pattern/reason pairs", () => {
    expect(DANGEROUS_RULE_PATTERNS.length).toBeGreaterThan(0);
    for (const entry of DANGEROUS_RULE_PATTERNS) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("auditDangerousRules", () => {
  it("detects Bash(*)", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ permissions: { allow: ["Bash(*)"] } }),
    );
    const result = auditDangerousRules(settingsPath);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("Bash(*)");
    expect(result[0].reason).toContain("any shell command");
  });

  it("detects Bash(python*)", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ permissions: { allow: ["Bash(python*)"] } }),
    );
    const result = auditDangerousRules(settingsPath);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("Bash(python*)");
  });

  it("detects Bash(node*)", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ permissions: { allow: ["Bash(node*)"] } }),
    );
    const result = auditDangerousRules(settingsPath);
    expect(result).toHaveLength(1);
  });

  it("detects Agent(*)", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ permissions: { allow: ["Agent(*)"] } }),
    );
    const result = auditDangerousRules(settingsPath);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("subagent");
  });

  it("does NOT flag narrow rules like Bash(npm test *)", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        permissions: { allow: ["Bash(npm test *)", "Bash(git status *)"] },
      }),
    );
    const result = auditDangerousRules(settingsPath);
    expect(result).toHaveLength(0);
  });

  it("does NOT flag Bash(bash /specific/path/*)", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        permissions: {
          allow: ["Bash(bash /home/.claude/plugins/cache/*)"],
        },
      }),
    );
    const result = auditDangerousRules(settingsPath);
    expect(result).toHaveLength(0);
  });

  it("detects multiple dangerous rules", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        permissions: {
          allow: ["Bash(*)", "Bash(python*)", "Bash(npm test *)"],
        },
      }),
    );
    const result = auditDangerousRules(settingsPath);
    expect(result).toHaveLength(2);
  });

  it("returns empty for missing file", () => {
    const result = auditDangerousRules(join(testDir, "nonexistent.json"));
    expect(result).toHaveLength(0);
  });
});

describe("stripDangerousRules", () => {
  it("removes dangerous rules and returns count", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        permissions: { allow: ["Bash(*)", "Bash(npm test *)", "Read"] },
      }),
    );
    const count = stripDangerousRules(settingsPath);
    expect(count).toBe(1);
    // Verify the rule was removed
    const remaining = getExistingRules(settingsPath);
    expect(remaining).toContain("Bash(npm test *)");
    expect(remaining).toContain("Read");
    expect(remaining).not.toContain("Bash(*)");
  });

  it("returns 0 when no dangerous rules", () => {
    const settingsPath = join(testDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ permissions: { allow: ["Bash(npm test *)"] } }),
    );
    expect(stripDangerousRules(settingsPath)).toBe(0);
  });
});
