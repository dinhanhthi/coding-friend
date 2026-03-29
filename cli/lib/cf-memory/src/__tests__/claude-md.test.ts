import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  syncToClaudeMd,
  removeFromClaudeMd,
  updateInClaudeMd,
  claudeMdPath,
  SECTION_HEADER,
} from "../lib/claude-md.js";

let testDir: string;
let claudeMdFile: string;
let counter = 0;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-claude-md-test-${Date.now()}-${++counter}`);
  mkdirSync(testDir, { recursive: true });
  claudeMdFile = join(testDir, "CLAUDE.md");
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("syncToClaudeMd", () => {
  it("creates CLAUDE.md with section if it does not exist", () => {
    syncToClaudeMd(
      testDir,
      "conventions/code-style",
      "Use 2-space indentation",
    );

    expect(existsSync(claudeMdFile)).toBe(true);
    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain(SECTION_HEADER);
    expect(content).toContain("Use 2-space indentation");
  });

  it("appends section to existing CLAUDE.md that has no memory section", () => {
    writeFileSync(claudeMdFile, "# My Project\n\nSome existing content.\n");

    syncToClaudeMd(
      testDir,
      "conventions/code-style",
      "Use 2-space indentation",
    );

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Some existing content.");
    expect(content).toContain(SECTION_HEADER);
    expect(content).toContain("Use 2-space indentation");
  });

  it("adds entry to existing memory section", () => {
    writeFileSync(
      claudeMdFile,
      `# My Project\n\n${SECTION_HEADER}\n\n- Use 2-space indentation\n`,
    );

    syncToClaudeMd(
      testDir,
      "conventions/naming",
      "Use camelCase for variables",
    );

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain("Use 2-space indentation");
    expect(content).toContain("Use camelCase for variables");
  });

  it("does not duplicate entries with same ID", () => {
    syncToClaudeMd(
      testDir,
      "conventions/code-style",
      "Use 2-space indentation",
    );
    syncToClaudeMd(
      testDir,
      "conventions/code-style",
      "Use 4-space indentation",
    );

    const content = readFileSync(claudeMdFile, "utf-8");
    // Should have the updated version, not both
    expect(content).toContain("Use 4-space indentation");
    expect(content).not.toContain("Use 2-space indentation");
  });

  it("stores entry with ID as HTML comment for tracking", () => {
    syncToClaudeMd(
      testDir,
      "conventions/code-style",
      "Use 2-space indentation",
    );

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain("<!-- cf:conventions/code-style -->");
  });

  it("handles multi-line description by taking first line only", () => {
    syncToClaudeMd(
      testDir,
      "conventions/style",
      "Line one\nLine two\nLine three",
    );

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain("Line one");
    // Multi-line content should be joined into a single bullet
    expect(content.split(SECTION_HEADER)[1]).not.toContain("\nLine two");
  });

  it("preserves content after the memory section", () => {
    writeFileSync(
      claudeMdFile,
      `# My Project\n\n${SECTION_HEADER}\n\n- Old entry <!-- cf:conventions/old -->\n\n## Other Section\n\nMore content.\n`,
    );

    syncToClaudeMd(testDir, "conventions/new-rule", "New convention");

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain("## Other Section");
    expect(content).toContain("More content.");
    expect(content).toContain("New convention");
  });
});

describe("removeFromClaudeMd", () => {
  it("removes an entry by ID", () => {
    syncToClaudeMd(
      testDir,
      "conventions/code-style",
      "Use 2-space indentation",
    );
    syncToClaudeMd(testDir, "conventions/naming", "Use camelCase");

    removeFromClaudeMd(testDir, "conventions/code-style");

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).not.toContain("Use 2-space indentation");
    expect(content).not.toContain("conventions/code-style");
    expect(content).toContain("Use camelCase");
  });

  it("does nothing if CLAUDE.md does not exist", () => {
    // Should not throw
    removeFromClaudeMd(testDir, "conventions/code-style");
    expect(existsSync(claudeMdFile)).toBe(false);
  });

  it("does nothing if ID is not found", () => {
    writeFileSync(
      claudeMdFile,
      `# Project\n\n${SECTION_HEADER}\n\n- Some entry <!-- cf:conventions/other -->\n`,
    );

    removeFromClaudeMd(testDir, "conventions/nonexistent");

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain("Some entry");
  });

  it("removes section header when last entry is removed", () => {
    syncToClaudeMd(testDir, "conventions/only-one", "The only convention");

    removeFromClaudeMd(testDir, "conventions/only-one");

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).not.toContain(SECTION_HEADER);
  });
});

describe("updateInClaudeMd", () => {
  it("updates the description of an existing entry", () => {
    syncToClaudeMd(testDir, "conventions/style", "Old style guide");

    updateInClaudeMd(testDir, "conventions/style", "New style guide");

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).toContain("New style guide");
    expect(content).not.toContain("Old style guide");
  });

  it("does nothing if ID is not found (no upsert)", () => {
    writeFileSync(claudeMdFile, "# Project\n");

    updateInClaudeMd(testDir, "conventions/nonexistent", "Something");

    const content = readFileSync(claudeMdFile, "utf-8");
    expect(content).not.toContain("Something");
  });

  it("does nothing if CLAUDE.md does not exist", () => {
    updateInClaudeMd(testDir, "conventions/style", "Something");
    expect(existsSync(claudeMdFile)).toBe(false);
  });
});

describe("claudeMdPath", () => {
  it("strips /docs/memory suffix to derive project root", () => {
    const docsDir = join(testDir, "docs", "memory");
    mkdirSync(docsDir, { recursive: true });

    const result = claudeMdPath(docsDir);
    expect(result).toBe(join(testDir, "CLAUDE.md"));
  });

  it("strips /memory suffix as fallback", () => {
    const docsDir = join(testDir, "memory");
    mkdirSync(docsDir, { recursive: true });

    const result = claudeMdPath(docsDir);
    expect(result).toBe(join(testDir, "CLAUDE.md"));
  });

  it("uses docsDir as-is when no known suffix matches", () => {
    const result = claudeMdPath(testDir);
    expect(result).toBe(join(testDir, "CLAUDE.md"));
  });
});

describe("syncToClaudeMd with realistic docsDir", () => {
  it("writes CLAUDE.md to project root when docsDir is docs/memory", () => {
    const docsDir = join(testDir, "docs", "memory");
    mkdirSync(docsDir, { recursive: true });

    syncToClaudeMd(docsDir, "conventions/style", "Use tabs");

    const expectedPath = join(testDir, "CLAUDE.md");
    expect(existsSync(expectedPath)).toBe(true);
    const content = readFileSync(expectedPath, "utf-8");
    expect(content).toContain("Use tabs");
    expect(content).toContain(SECTION_HEADER);
  });
});
