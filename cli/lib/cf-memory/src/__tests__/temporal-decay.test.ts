import { describe, it, expect } from "vitest";
import { applyTemporalDecay } from "../lib/temporal-decay.js";

describe("applyTemporalDecay()", () => {
  it("keeps ~100% of score for today's date", () => {
    const today = new Date().toISOString().split("T")[0];
    const result = applyTemporalDecay(10, today);
    // Should be very close to original score
    expect(result).toBeGreaterThan(9.9);
    expect(result).toBeLessThanOrEqual(10);
  });

  it("decays score for 90-day-old memories", () => {
    const date90ago = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const result = applyTemporalDecay(10, date90ago);
    // 0.7 + 0.3 * exp(-1) ≈ 0.7 + 0.3 * 0.368 ≈ 0.81
    expect(result).toBeGreaterThan(7.5);
    expect(result).toBeLessThan(8.5);
  });

  it("keeps at least 70% of score for very old memories", () => {
    const result = applyTemporalDecay(10, "2020-01-01");
    // 0.7 + 0.3 * exp(-very_large) ≈ 0.7
    expect(result).toBeGreaterThanOrEqual(6.9);
    expect(result).toBeLessThan(7.2);
  });

  it("boosts score based on access count", () => {
    const today = new Date().toISOString().split("T")[0];
    const withoutAccess = applyTemporalDecay(10, today);
    const withAccess = applyTemporalDecay(10, today, 5);
    expect(withAccess).toBeGreaterThan(withoutAccess);
  });

  it("caps access boost at 10", () => {
    const today = new Date().toISOString().split("T")[0];
    const at10 = applyTemporalDecay(10, today, 10);
    const at100 = applyTemporalDecay(10, today, 100);
    expect(at10).toBe(at100);
  });

  it("handles zero score", () => {
    const result = applyTemporalDecay(0, "2026-01-01");
    expect(result).toBe(0);
  });

  it("handles negative score (BM25 negated)", () => {
    const today = new Date().toISOString().split("T")[0];
    const result = applyTemporalDecay(-5, today);
    expect(result).toBeLessThan(0);
  });
});
