import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectTier, createBackendForTier, TIERS } from "../lib/tier.js";
import { MarkdownBackend } from "../backends/markdown.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-tier-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("detectTier()", () => {
  it("returns Tier 3 (markdown) when no daemon is running", async () => {
    const tier = await detectTier();
    // Without a daemon running, should detect Tier 3
    expect(tier.name).toBe("markdown");
    expect(tier.number).toBe(3);
    expect(tier.label).toContain("Tier 3");
  });

  it("respects config override to markdown", async () => {
    const tier = await detectTier("markdown");
    expect(tier.name).toBe("markdown");
  });

  it("respects config override to lite", async () => {
    const tier = await detectTier("lite");
    expect(tier.name).toBe("lite");
    expect(tier.number).toBe(2);
  });

  it("respects config override to full", async () => {
    const tier = await detectTier("full");
    expect(tier.name).toBe("full");
    expect(tier.number).toBe(1);
  });

  it("auto mode defaults to markdown when daemon not running", async () => {
    const tier = await detectTier("auto");
    expect(tier.name).toBe("markdown");
  });
});

describe("createBackendForTier()", () => {
  it("creates MarkdownBackend for markdown tier", async () => {
    const { backend, tier } = await createBackendForTier(testDir, "markdown");
    expect(tier.name).toBe("markdown");
    expect(backend).toBeInstanceOf(MarkdownBackend);
    await backend.close();
  });

  it("falls back to MarkdownBackend when daemon not available for lite tier", async () => {
    const { backend, tier } = await createBackendForTier(testDir, "auto");
    // Since no daemon is running, should fall back to markdown
    expect(tier.name).toBe("markdown");
    expect(backend).toBeInstanceOf(MarkdownBackend);
    await backend.close();
  });

  it("full tier currently falls back to markdown", async () => {
    // Phase 3 will implement full tier — for now it falls back
    const { backend, tier } = await createBackendForTier(testDir, "full");
    expect(tier.name).toBe("markdown");
    expect(backend).toBeInstanceOf(MarkdownBackend);
    await backend.close();
  });
});

describe("TIERS constant", () => {
  it("has all 3 tier definitions", () => {
    expect(Object.keys(TIERS)).toHaveLength(3);
    expect(TIERS.full.number).toBe(1);
    expect(TIERS.lite.number).toBe(2);
    expect(TIERS.markdown.number).toBe(3);
  });

  it("each tier has name, label, and number", () => {
    for (const tier of Object.values(TIERS)) {
      expect(tier.name).toBeTruthy();
      expect(tier.label).toBeTruthy();
      expect(tier.number).toBeGreaterThanOrEqual(1);
      expect(tier.number).toBeLessThanOrEqual(3);
    }
  });
});
