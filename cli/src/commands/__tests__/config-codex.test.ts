import { describe, it, expect } from "vitest";
import { buildCodexConfig } from "../config.js";

describe("buildCodexConfig", () => {
  it("returns enabled=true with all fields when user enables Codex", () => {
    const result = buildCodexConfig({
      enabled: true,
      modes: ["STANDARD", "DEEP"],
      effort: "medium",
    });
    expect(result).toEqual({
      enabled: true,
      modes: ["STANDARD", "DEEP"],
      effort: "medium",
    });
  });

  it("returns enabled=false when user disables Codex", () => {
    const result = buildCodexConfig({
      enabled: false,
      modes: ["STANDARD", "DEEP"],
      effort: "medium",
    });
    expect(result.enabled).toBe(false);
  });

  it("preserves non-default effort level", () => {
    const result = buildCodexConfig({
      enabled: true,
      modes: ["DEEP"],
      effort: "high",
    });
    expect(result.effort).toBe("high");
    expect(result.modes).toEqual(["DEEP"]);
  });

  it("returns minimal modes list when only QUICK selected", () => {
    const result = buildCodexConfig({
      enabled: true,
      modes: ["QUICK"],
      effort: "minimal",
    });
    expect(result.modes).toEqual(["QUICK"]);
    expect(result.effort).toBe("minimal");
  });

  it("preserves empty modes array when all modes deselected", () => {
    const result = buildCodexConfig({
      enabled: true,
      modes: [],
      effort: "medium",
    });
    expect(result.modes).toEqual([]);
  });

  it("effort field is typed as literal union, not widened to string", () => {
    const result = buildCodexConfig({
      enabled: true,
      modes: ["STANDARD"],
      effort: "high",
    });
    const effort: "minimal" | "low" | "medium" | "high" | "xhigh" =
      result.effort;
    expect(effort).toBe("high");
  });
});
