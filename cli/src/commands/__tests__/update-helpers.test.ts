import { describe, it, expect } from "vitest";
import { semverCompare } from "../update.js";

describe("semverCompare", () => {
  it("returns 0 for equal versions", () => {
    expect(semverCompare("1.0.0", "1.0.0")).toBe(0);
    expect(semverCompare("0.2.0", "0.2.0")).toBe(0);
  });

  it("returns 1 when first is greater (major)", () => {
    expect(semverCompare("2.0.0", "1.0.0")).toBe(1);
  });

  it("returns -1 when first is lesser (major)", () => {
    expect(semverCompare("1.0.0", "2.0.0")).toBe(-1);
  });

  it("compares minor versions correctly", () => {
    expect(semverCompare("1.2.0", "1.1.0")).toBe(1);
    expect(semverCompare("1.1.0", "1.2.0")).toBe(-1);
  });

  it("compares patch versions correctly", () => {
    expect(semverCompare("1.0.2", "1.0.1")).toBe(1);
    expect(semverCompare("1.0.1", "1.0.2")).toBe(-1);
  });

  it("handles mixed version differences", () => {
    expect(semverCompare("1.2.3", "1.2.4")).toBe(-1);
    expect(semverCompare("0.9.9", "1.0.0")).toBe(-1);
    expect(semverCompare("2.0.0", "1.9.9")).toBe(1);
  });
});
