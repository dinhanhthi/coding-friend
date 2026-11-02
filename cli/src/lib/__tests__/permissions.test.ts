import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  resolveMarketplacePluginRoot,
  extractTag,
} from "../permissions.js";
import type { PermissionRule } from "../permissions.js";

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

  // The /cf-review scope snapshot is written by the main agent and read by
  // background reviewers. A missing rule here means a background subagent can
  // block on an invisible permission prompt (see the 128-minute stall bug).
  it("covers the cf-review snapshot dir for mkdir, read and write", () => {
    const rules = PERMISSION_RULES.map((r) => r.rule);
    for (const expected of [
      "Bash(mkdir -p /tmp/coding-friend/review/*)",
      "Read(//tmp/coding-friend/review/**)",
      "Edit(//tmp/coding-friend/review/**)",
    ]) {
      expect(rules).toContain(expected);
    }
  });

  it("snapshot rules share the existing /tmp/coding-friend prefix", () => {
    const snapshotRules = PERMISSION_RULES.filter((r) =>
      r.rule.includes("/tmp/coding-friend/review/"),
    );
    expect(snapshotRules.length).toBe(3);
    // A single leading slash anchors at the settings source, not the
    // filesystem root — file rules must use "//" to reach the real /tmp.
    for (const rule of snapshotRules.filter(
      (r) => !r.rule.startsWith("Bash("),
    )) {
      expect(rule.rule).toContain("(//tmp/coding-friend/review/");
    }
    for (const rule of snapshotRules) {
      expect(rule.recommended).toBe(true);
      expect(extractTag(rule.description)).toMatch(
        /^\[(read-only|write|modify)\]$/,
      );
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
  it("generates 2 rules without autoCommit", () => {
    const rules = buildLearnDirRules("~/notes", false);
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.rule)).toEqual([
      "Read(~/notes/**)",
      "Edit(~/notes/**)",
    ]);
  });

  it("strips trailing slashes from the learn path", () => {
    const rules = buildLearnDirRules("~/notes/", true);
    expect(rules.map((r) => r.rule)).toEqual([
      "Read(~/notes/**)",
      "Edit(~/notes/**)",
      "Bash(cd ~/notes && git add *)",
      "Bash(cd ~/notes && git commit *)",
    ]);
  });

  it("generates 4 rules with autoCommit", () => {
    const rules = buildLearnDirRules("~/notes", true);
    expect(rules).toHaveLength(4);
    expect(rules[2].rule).toBe("Bash(cd ~/notes && git add *)");
    expect(rules[3].rule).toBe("Bash(cd ~/notes && git commit *)");
  });

  it("all rules have category 'External Learn Directory'", () => {
    const rules = buildLearnDirRules("~/docs", true);
    for (const r of rules) {
      expect(r.category).toBe("External Learn Directory");
    }
  });

  it("quotes paths with spaces in autoCommit rules", () => {
    const rules = buildLearnDirRules("~/my notes/learn", true);
    expect(rules[2].rule).toBe('Bash(cd "~/my notes/learn" && git add *)');
    expect(rules[3].rule).toBe('Bash(cd "~/my notes/learn" && git commit *)');
  });

  it("does not quote paths without spaces", () => {
    const rules = buildLearnDirRules("~/notes", true);
    expect(rules[2].rule).toBe("Bash(cd ~/notes && git add *)");
  });
});

describe("getMissingRules + buildLearnDirRules integration", () => {
  it("returns only missing learn dir rules when some already exist", () => {
    const learnRules = buildLearnDirRules("~/notes", true);
    const existing = [learnRules[0].rule, learnRules[2].rule]; // Read + git add
    const missing = getMissingRules(existing, learnRules);
    expect(missing).toHaveLength(2);
    expect(missing.map((r) => r.rule)).toEqual([
      "Edit(~/notes/**)",
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

  it("does NOT ship Bash(npx *) — too broad for the auto-approve threat model", () => {
    const ruleStrings = STATIC_RULES.map((r) => r.rule);
    expect(ruleStrings).not.toContain("Bash(npx *)");
  });

  it("ships narrow npx rules for safe, non-code-executing tools", () => {
    const ruleStrings = STATIC_RULES.map((r) => r.rule);
    expect(ruleStrings).toContain("Bash(npx tsc *)");
    expect(ruleStrings).toContain("Bash(npx prettier *)");
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
    const rules = buildPluginScriptRules(null);
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
    const rules = buildPluginScriptRules(null);
    const readRules = rules.filter((r) => r.rule.startsWith("Read("));
    for (const rule of readRules) {
      expect(rule.rule).toContain("~");
      expect(rule.rule).not.toMatch(/^Read\(\/Users\//);
    }
  });

  it("all rules have category Plugin Scripts", () => {
    const rules = buildPluginScriptRules(null);
    for (const rule of rules) {
      expect(rule.category).toBe("Plugin Scripts");
    }
  });

  it("includes Read rules for plugin files and global config", () => {
    const rules = buildPluginScriptRules(null);
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
    const all = getAllRules(null);
    const staticRules = all.filter((r) => r.category !== "Plugin Scripts");
    expect(staticRules.length).toBe(STATIC_RULES.length);
  });

  it("includes plugin rules", () => {
    const all = getAllRules(null);
    const pluginRules = all.filter((r) => r.category === "Plugin Scripts");
    expect(pluginRules.length).toBe(4);
    expect(all.length).toBe(STATIC_RULES.length + pluginRules.length);
  });

  it("has no duplicate rules across tiers", () => {
    const all = getAllRules("/repo/plugin");
    const ruleStrings = all.map((r) => r.rule);
    const unique = new Set(ruleStrings);
    expect(unique.size).toBe(ruleStrings.length);
  });
});

describe("buildPluginScriptRules — marketplace plugin root", () => {
  it("adds rules for the resolved plugin root", () => {
    const rules = buildPluginScriptRules("/Users/me/git/coding-friend/plugin");
    expect(rules.map((r) => r.rule)).toEqual(
      expect.arrayContaining([
        "Bash(bash /Users/me/git/coding-friend/plugin/*)",
        'Bash(bash "/Users/me/git/coding-friend/plugin/*)',
        "Read(/Users/me/git/coding-friend/plugin/**)",
      ]),
    );
  });

  it("keeps the cache rules alongside the resolved root", () => {
    const rules = buildPluginScriptRules("/repo/plugin");
    expect(
      rules.some((r) => r.rule.includes("plugins/cache/coding-friend")),
    ).toBe(true);
    expect(rules).toHaveLength(7);
  });

  it("emits only the cache rules when no marketplace is registered", () => {
    expect(buildPluginScriptRules(null)).toHaveLength(4);
  });
});

describe("resolveMarketplacePluginRoot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when the marketplace file is absent", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(testDir, "nope"));
    expect(resolveMarketplacePluginRoot()).toBeNull();
  });

  it("appends the plugin subdir to the marketplace installLocation", () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", testDir);
    mkdirSync(join(testDir, "plugins"), { recursive: true });
    writeFileSync(
      join(testDir, "plugins", "known_marketplaces.json"),
      JSON.stringify({
        "coding-friend-marketplace": {
          source: { source: "directory", path: "/Users/me/git/coding-friend" },
          installLocation: "/Users/me/git/coding-friend",
        },
      }),
    );

    expect(resolveMarketplacePluginRoot()).toBe(
      "/Users/me/git/coding-friend/plugin",
    );
  });
});

describe("cleanupStalePluginRules", () => {
  it("removes stale marketplace-path per-script rules", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: {
          allow: [
            'Bash(bash "/Users/me/.claude/plugins/marketplaces/coding-friend-marketplace/plugin/lib/load-custom-guide.sh" cf-tdd)',
            'Bash(bash "/Users/me/.claude/plugins/marketplaces/coding-friend-marketplace/plugin/skills/cf-review/scripts/gather-diff.sh")',
            "Bash(git status)",
          ],
        },
      }),
    );

    expect(cleanupStalePluginRules(file)).toBe(2);
    expect(getExistingRules(file)).toEqual(["Bash(git status)"]);
  });

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

  it("removes Write(path) rules that have a matching Edit(path)", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: {
          allow: [
            "Edit(//tmp/coding-friend/review/**)",
            "Write(//tmp/coding-friend/review/**)",
            "Edit(~/notes//**)",
            "Write(~/notes//**)",
            "Write(~/other/**)",
          ],
        },
      }),
    );

    expect(cleanupStalePluginRules(file)).toBe(2);
    expect(getExistingRules(file)).toEqual([
      "Edit(//tmp/coding-friend/review/**)",
      "Edit(~/notes//**)",
      "Write(~/other/**)",
    ]);
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
