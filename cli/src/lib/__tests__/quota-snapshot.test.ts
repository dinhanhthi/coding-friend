import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  quotaResetHint,
  readQuotaSnapshot,
  RESET_HINT_MAX_AGE_S,
  type QuotaSnapshot,
} from "../quota-snapshot.js";

const NOW = 1_762_340_000;
const CONFIG_DIR = "/Users/x/.claude";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cf-quota-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    provider: "claude",
    configDir: CONFIG_DIR,
    windows: {
      five_hour: { percentUsed: 69, resetsAt: NOW + 3600 },
      seven_day: { percentUsed: 53, resetsAt: NOW + 86_400 },
    },
    source: "statusline",
    measuredAt: NOW,
    ...overrides,
  };
}

function writeSnapshot(content: string): string {
  const file = join(dir, "claude.json");
  writeFileSync(file, content);
  return file;
}

function snap(
  windows: QuotaSnapshot["windows"],
  overrides: Partial<QuotaSnapshot> = {},
): QuotaSnapshot {
  return {
    schemaVersion: 1,
    provider: "claude",
    configDir: CONFIG_DIR,
    windows,
    source: "mod",
    measuredAt: NOW - 60,
    ...overrides,
  };
}

describe("readQuotaSnapshot", () => {
  it("reads schema v1, normalizes an ISO resetsAt and drops an invalid window", () => {
    const file = writeSnapshot(
      JSON.stringify(
        raw({
          windows: {
            five_hour: {
              percentUsed: 96,
              resetsAt: "2025-11-05T17:40:00.000Z",
            },
            seven_day: { percentUsed: "high", resetsAt: NOW },
          },
        }),
      ),
    );
    expect(readQuotaSnapshot(file)).toEqual({
      schemaVersion: 1,
      provider: "claude",
      configDir: CONFIG_DIR,
      windows: {
        five_hour: {
          percentUsed: 96,
          resetsAt: Date.parse("2025-11-05T17:40:00.000Z") / 1000,
        },
      },
      source: "statusline",
      measuredAt: NOW,
    });
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["wrong schemaVersion", JSON.stringify(raw({ schemaVersion: 2 }))],
    ["wrong provider", JSON.stringify(raw({ provider: "codex" }))],
    ["over 64 KiB", JSON.stringify(raw({ pad: "x".repeat(70 * 1024) }))],
  ])("returns null for a malformed file (%s)", (_name, content) => {
    expect(readQuotaSnapshot(writeSnapshot(content))).toBeNull();
  });

  it("refuses a symlink even to a valid snapshot", () => {
    const target = join(dir, "real.json");
    writeFileSync(target, JSON.stringify(raw()));
    const link = join(dir, "claude.json");
    symlinkSync(target, link);
    expect(readQuotaSnapshot(target)).not.toBeNull();
    expect(readQuotaSnapshot(link)).toBeNull();
  });
});

describe("quotaResetHint", () => {
  it("picks the latest resetsAt among windows at >= 95%", () => {
    const s = snap({
      five_hour: { percentUsed: 96, resetsAt: NOW + 3600 },
      seven_day: { percentUsed: 95, resetsAt: NOW + 86_400 },
    });
    expect(
      quotaResetHint(s, { configDir: "/Users/x/.claude/", now: NOW }),
    ).toEqual({
      provider: "claude",
      resetsAt: NOW + 86_400,
      measuredAt: NOW - 60,
    });
  });

  it.each<[string, QuotaSnapshot, string]>([
    [
      "configDir mismatch",
      snap({ five_hour: { percentUsed: 99, resetsAt: NOW + 3600 } }),
      "/Users/other/.claude",
    ],
    [
      "window under 95%",
      snap({ five_hour: { percentUsed: 94, resetsAt: NOW + 3600 } }),
      CONFIG_DIR,
    ],
    [
      "reset already past",
      snap({ five_hour: { percentUsed: 99, resetsAt: NOW } }),
      CONFIG_DIR,
    ],
    [
      "snapshot older than 6 h",
      snap(
        { five_hour: { percentUsed: 99, resetsAt: NOW + 3600 } },
        { measuredAt: NOW - RESET_HINT_MAX_AGE_S - 1 },
      ),
      CONFIG_DIR,
    ],
    [
      "resetsAt is far beyond the window period",
      snap({ five_hour: { percentUsed: 100, resetsAt: 999_999_999_999 } }),
      CONFIG_DIR,
    ],
    [
      "measuredAt is far in the future",
      snap(
        {
          five_hour: {
            percentUsed: 100,
            resetsAt: NOW + 10 * 365 * 86_400 + 3600,
          },
        },
        { measuredAt: NOW + 10 * 365 * 86_400 },
      ),
      CONFIG_DIR,
    ],
  ])("returns null when %s", (_name, s, configDir) => {
    expect(quotaResetHint(s, { configDir, now: NOW })).toBeNull();
  });
});
