import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  parseDateFromName,
  olderThanDays,
  matchesRange,
  getEffectiveDate,
  readPlanStatus,
  isDonePlan,
} from "../clean.js";

// ─── parseDateFromName ─────────────────────────────────────────────────────

describe("parseDateFromName", () => {
  it("parses valid YYYY-MM-DD prefix", () => {
    const d = parseDateFromName("2024-03-15-some-plan.md");
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString().startsWith("2024-03-15")).toBe(true);
  });

  it("parses bare YYYY-MM-DD name (no suffix)", () => {
    const d = parseDateFromName("2024-01-01");
    expect(d).not.toBeNull();
  });

  it("returns null when no date prefix", () => {
    expect(parseDateFromName("my-feature-plan.md")).toBeNull();
    expect(parseDateFromName("README.md")).toBeNull();
    expect(parseDateFromName("abc123.json")).toBeNull();
  });

  it("returns null for invalid calendar date (month 13)", () => {
    expect(parseDateFromName("2024-13-99-plan.md")).toBeNull();
  });

  it("returns null for zero-month date", () => {
    expect(parseDateFromName("2024-00-01-plan.md")).toBeNull();
  });

  it("returns null for UUIDs that don't start with a date", () => {
    expect(
      parseDateFromName("0e1f0818-69c5-4be7-9bbc-e417110ed06e"),
    ).toBeNull();
  });
});

// ─── olderThanDays ──────────────────────────────────────────────────────────

describe("olderThanDays", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  it("returns true when date is more than N days ago", () => {
    const date = new Date("2024-06-13T11:59:59.000Z"); // ~2 days + 1s ago
    expect(olderThanDays(date, 2, now)).toBe(true);
  });

  it("returns false when date is less than N days ago", () => {
    const date = new Date("2024-06-14T12:00:01.000Z"); // just under 1 day ago
    expect(olderThanDays(date, 1, now)).toBe(false);
  });

  it("returns false when date is exactly N days ago (strict >)", () => {
    const exactly1Day = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    expect(olderThanDays(exactly1Day, 1, now)).toBe(false);
  });

  it("returns true for 1-year-old file with 365-day threshold", () => {
    const date = new Date("2023-06-14T12:00:00.000Z");
    expect(olderThanDays(date, 365, now)).toBe(true);
  });

  it("returns false for future date", () => {
    const future = new Date("2025-01-01T00:00:00.000Z");
    expect(olderThanDays(future, 1, now)).toBe(false);
  });
});

// ─── matchesRange ──────────────────────────────────────────────────────────

describe("matchesRange", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");
  const fakeEntryPath = "/some/path/file.md";

  it('always returns true for range "all"', () => {
    expect(
      matchesRange(fakeEntryPath, "2099-01-01-future.md", "all", null, now),
    ).toBe(true);
    expect(matchesRange(fakeEntryPath, "no-date.md", "all", null, now)).toBe(
      true,
    );
  });

  it("matches more_than_1_day correctly", () => {
    const old = "2024-06-10-old.md";
    const fresh = "2024-06-15-fresh.md";
    expect(matchesRange(fakeEntryPath, old, "more_than_1_day", null, now)).toBe(
      true,
    );
    expect(
      matchesRange(fakeEntryPath, fresh, "more_than_1_day", null, now),
    ).toBe(false);
  });

  it("matches more_than_1_week correctly", () => {
    expect(
      matchesRange(
        fakeEntryPath,
        "2024-06-07-old.md",
        "more_than_1_week",
        null,
        now,
      ),
    ).toBe(true);
    expect(
      matchesRange(
        fakeEntryPath,
        "2024-06-14-recent.md",
        "more_than_1_week",
        null,
        now,
      ),
    ).toBe(false);
  });

  it("matches before_date correctly", () => {
    const cutoff = new Date("2024-06-01T00:00:00.000Z");
    expect(
      matchesRange(
        fakeEntryPath,
        "2024-05-31-old.md",
        "before_date",
        cutoff,
        now,
      ),
    ).toBe(true);
    expect(
      matchesRange(
        fakeEntryPath,
        "2024-06-01-same.md",
        "before_date",
        cutoff,
        now,
      ),
    ).toBe(false);
    expect(
      matchesRange(
        fakeEntryPath,
        "2024-06-10-new.md",
        "before_date",
        cutoff,
        now,
      ),
    ).toBe(false);
  });

  it("returns false for before_date when cutoff is null", () => {
    expect(
      matchesRange(
        fakeEntryPath,
        "2024-01-01-old.md",
        "before_date",
        null,
        now,
      ),
    ).toBe(false);
  });
});

// ─── getEffectiveDate fallback ─────────────────────────────────────────────

describe("getEffectiveDate", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "cf-clean-test-"));
  });

  afterEach(() => {
    // cleanup handled by OS tmpdir rotation; no rmSync to avoid recursive issues
  });

  it("uses date from filename when YYYY-MM-DD prefix is present", () => {
    const filePath = join(testDir, "2024-03-10-plan.md");
    writeFileSync(filePath, "content");
    const d = getEffectiveDate(filePath, "2024-03-10-plan.md");
    expect(d.toISOString().startsWith("2024-03-10")).toBe(true);
  });

  it("falls back to mtime when no date prefix", () => {
    const filePath = join(testDir, "no-date-file.md");
    writeFileSync(filePath, "content");
    const d = getEffectiveDate(filePath, "no-date-file.md");
    // mtime should be close to now (within 5s)
    expect(Math.abs(d.getTime() - Date.now())).toBeLessThan(5000);
  });

  it("returns epoch (Date(0)) for non-existent path with no date prefix", () => {
    const d = getEffectiveDate("/does/not/exist/file.md", "no-date.md");
    expect(d.getTime()).toBe(0);
  });
});

// ─── readPlanStatus / isDonePlan ───────────────────────────────────────────

describe("readPlanStatus / isDonePlan", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "cf-clean-status-"));
  });

  const writePlanFolder = (slug: string, frontmatter: string) => {
    const folder = join(testDir, slug);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "README.md"), frontmatter);
    return folder;
  };

  it("reads status from a plan folder's README.md frontmatter", () => {
    const folder = writePlanFolder(
      "2024-06-01-done-plan",
      "---\nslug: 2024-06-01-done-plan\nstatus: done\n---\n\n# Plan\n",
    );
    expect(readPlanStatus(folder, true)).toBe("done");
    expect(isDonePlan(folder, true)).toBe(true);
  });

  it("reads status from a legacy single .md file", () => {
    const file = join(testDir, "2024-06-01-legacy.md");
    writeFileSync(file, "---\nstatus: done\n---\n\n# Plan\n");
    expect(readPlanStatus(file, false)).toBe("done");
    expect(isDonePlan(file, false)).toBe(true);
  });

  it("ignores a trailing inline # comment on the status line", () => {
    const folder = writePlanFolder(
      "2024-06-01-comment",
      "---\nstatus: done # machine-readable: in-progress | done | failed\n---\n\n# Plan\n",
    );
    expect(readPlanStatus(folder, true)).toBe("done");
    expect(isDonePlan(folder, true)).toBe(true);
  });

  it("lowercase-normalizes the status value", () => {
    const folder = writePlanFolder(
      "2024-06-01-upper",
      "---\nstatus: DONE\n---\n\n# Plan\n",
    );
    expect(readPlanStatus(folder, true)).toBe("done");
    expect(isDonePlan(folder, true)).toBe(true);
  });

  it("is not done for in-progress or failed plans", () => {
    const inProgress = writePlanFolder(
      "2024-06-01-wip",
      "---\nstatus: in-progress\n---\n\n# Plan\n",
    );
    const failed = writePlanFolder(
      "2024-06-01-failed",
      "---\nstatus: failed\n---\n\n# Plan\n",
    );
    expect(isDonePlan(inProgress, true)).toBe(false);
    expect(isDonePlan(failed, true)).toBe(false);
  });

  it("fails safe (not done) when status frontmatter is missing", () => {
    const folder = writePlanFolder(
      "2024-06-01-nostatus",
      "---\nslug: 2024-06-01-nostatus\nauto: false\n---\n\n# Plan\n",
    );
    expect(readPlanStatus(folder, true)).toBeNull();
    expect(isDonePlan(folder, true)).toBe(false);
  });

  it("fails safe when there is no frontmatter block at all", () => {
    const folder = writePlanFolder("2024-06-01-plain", "# Plan\n\nstatus: done\n");
    expect(readPlanStatus(folder, true)).toBeNull();
    expect(isDonePlan(folder, true)).toBe(false);
  });

  it("fails safe when README.md is missing from the folder", () => {
    const folder = join(testDir, "2024-06-01-empty");
    mkdirSync(folder, { recursive: true });
    expect(readPlanStatus(folder, true)).toBeNull();
    expect(isDonePlan(folder, true)).toBe(false);
  });

  it("ignores a status: line outside the frontmatter block", () => {
    const folder = writePlanFolder(
      "2024-06-01-body",
      "---\nstatus: in-progress\n---\n\n# Plan\n\nstatus: done\n",
    );
    expect(readPlanStatus(folder, true)).toBe("in-progress");
    expect(isDonePlan(folder, true)).toBe(false);
  });

  it("returns null for non-md files", () => {
    const file = join(testDir, "notes.txt");
    writeFileSync(file, "---\nstatus: done\n---\n");
    expect(readPlanStatus(file, false)).toBeNull();
  });
});

// ─── deleteMatchingEntries integration ────────────────────────────────────

describe("deleteMatchingEntries — integration via matchesRange + real fs", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "cf-clean-integ-"));
  });

  it("deletable files are correctly identified by date", () => {
    const now = new Date("2024-06-15T12:00:00.000Z");

    // File older than 1 week → should match "more_than_1_week"
    const oldFile = "2024-06-01-old.md";
    // File from today → should NOT match
    const newFile = "2024-06-15-new.md";

    expect(
      matchesRange(
        join(testDir, oldFile),
        oldFile,
        "more_than_1_week",
        null,
        now,
      ),
    ).toBe(true);
    expect(
      matchesRange(
        join(testDir, newFile),
        newFile,
        "more_than_1_week",
        null,
        now,
      ),
    ).toBe(false);
  });

  it("range=all matches every entry regardless of date", () => {
    const now = new Date();
    const futureName = "2099-01-01-far-future.md";
    expect(
      matchesRange(join(testDir, futureName), futureName, "all", null, now),
    ).toBe(true);
  });

  it("UUID-named files (no date prefix) fall back to mtime", () => {
    const uuid = "0e1f0818-69c5-4be7-9bbc-e417110ed06e";
    const filePath = join(testDir, uuid);
    mkdirSync(filePath, { recursive: true });

    // mtime is just now, so it should NOT match "more_than_1_year"
    const now = new Date();
    expect(matchesRange(filePath, uuid, "more_than_1_year", null, now)).toBe(
      false,
    );
  });
});
