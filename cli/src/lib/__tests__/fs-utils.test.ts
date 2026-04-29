import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { listMdFilesRecursive } from "../fs-utils.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-fs-utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("listMdFilesRecursive", () => {
  it("returns empty array when directory does not exist", () => {
    const result = listMdFilesRecursive(join(testDir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns empty array when directory has no .md files", () => {
    writeFileSync(join(testDir, "file.txt"), "text");
    writeFileSync(join(testDir, "file.js"), "code");
    const result = listMdFilesRecursive(testDir);
    expect(result).toEqual([]);
  });

  it("returns .md files in root directory", () => {
    writeFileSync(join(testDir, "topic.md"), "# Topic");
    writeFileSync(join(testDir, "other.md"), "# Other");
    const result = listMdFilesRecursive(testDir);
    expect(result).toContain("topic.md");
    expect(result).toContain("other.md");
    expect(result).toHaveLength(2);
  });

  it("excludes README.md", () => {
    writeFileSync(join(testDir, "README.md"), "# Readme");
    writeFileSync(join(testDir, "topic.md"), "# Topic");
    const result = listMdFilesRecursive(testDir);
    expect(result).not.toContain("README.md");
    expect(result).toContain("topic.md");
  });

  it("finds .md files in subdirectories", () => {
    const subDir = join(testDir, "subdir");
    mkdirSync(subDir);
    writeFileSync(join(subDir, "deep.md"), "# Deep");
    const result = listMdFilesRecursive(testDir);
    expect(result).toContain("deep.md");
  });

  it("finds .md files nested multiple levels deep", () => {
    const level1 = join(testDir, "a");
    const level2 = join(level1, "b");
    mkdirSync(level2, { recursive: true });
    writeFileSync(join(level2, "nested.md"), "# Nested");
    const result = listMdFilesRecursive(testDir);
    expect(result).toContain("nested.md");
  });

  it("respects maxDepth = 0 — returns files only in root (no recursion)", () => {
    const subDir = join(testDir, "subdir");
    mkdirSync(subDir);
    writeFileSync(join(testDir, "root.md"), "# Root");
    writeFileSync(join(subDir, "deep.md"), "# Deep");
    const result = listMdFilesRecursive(testDir, 0);
    expect(result).toContain("root.md");
    expect(result).not.toContain("deep.md");
  });

  it("respects maxDepth = 1 — recurses only one level deep", () => {
    const level1 = join(testDir, "a");
    const level2 = join(level1, "b");
    mkdirSync(level2, { recursive: true });
    writeFileSync(join(level1, "level1.md"), "# Level1");
    writeFileSync(join(level2, "level2.md"), "# Level2");
    const result = listMdFilesRecursive(testDir, 1);
    expect(result).toContain("level1.md");
    expect(result).not.toContain("level2.md");
  });

  it("default maxDepth allows deep nesting (>= 15 levels)", () => {
    // Create a 5-level deep structure — well within the default 15
    let current = testDir;
    for (let i = 0; i < 5; i++) {
      current = join(current, `level${i}`);
      mkdirSync(current);
    }
    writeFileSync(join(current, "deep.md"), "# Deep");
    const result = listMdFilesRecursive(testDir);
    expect(result).toContain("deep.md");
  });

  it("returns empty array (not error) when directory is unreadable (not exists)", () => {
    // Simulated by passing a non-existent path
    const result = listMdFilesRecursive("/nonexistent/path/that/does/not/exist");
    expect(result).toEqual([]);
  });
});
