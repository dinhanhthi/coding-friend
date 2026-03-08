import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { readJson } from "../json.js";
import {
  PERMISSION_RULES,
  getExistingRules,
  getMissingRules,
  buildLearnDirRules,
  applyPermissions,
  groupByCategory,
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
});

describe("getExistingRules", () => {
  it("returns allow array from settings.json", () => {
    const file = join(testDir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        permissions: { allow: ["Bash(git add:*)", "WebSearch"] },
      }),
    );
    expect(getExistingRules(file)).toEqual(["Bash(git add:*)", "WebSearch"]);
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
    expect(rules[3].rule).toBe("Bash(cd ~/notes && git add:*)");
    expect(rules[4].rule).toBe("Bash(cd ~/notes && git commit:*)");
  });

  it("all rules have category 'External Learn Directory'", () => {
    const rules = buildLearnDirRules("~/docs", true);
    for (const r of rules) {
      expect(r.category).toBe("External Learn Directory");
    }
  });

  it("quotes paths with spaces in autoCommit rules", () => {
    const rules = buildLearnDirRules("~/my notes/learn", true);
    expect(rules[3].rule).toBe('Bash(cd "~/my notes/learn" && git add:*)');
    expect(rules[4].rule).toBe('Bash(cd "~/my notes/learn" && git commit:*)');
  });

  it("does not quote paths without spaces", () => {
    const rules = buildLearnDirRules("~/notes", true);
    expect(rules[3].rule).toBe("Bash(cd ~/notes && git add:*)");
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
      "Bash(cd ~/notes && git add:*)",
      "Bash(cd ~/notes && git commit:*)",
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

    applyPermissions(file, ["Bash(git add:*)", "WebSearch"], []);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["Bash(git add:*)", "WebSearch"]);
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

    applyPermissions(file, ["Bash(git add:*)"], []);

    const result = readJson<Record<string, unknown>>(file);
    const allow = (result?.permissions as { allow: string[] }).allow;
    expect(allow).toEqual(["Bash(git add:*)"]);
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
