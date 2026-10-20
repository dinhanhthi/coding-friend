import { describe, it, expect, vi } from "vitest";

vi.mock("../../exec.js", () => ({
  commandExists: () => true,
  run: () => "codex-cli 999.0.0",
}));

import { eligibleProviders } from "../providers/eligible.js";

describe("eligibleProviders", () => {
  it("excludes codex outside a git checkout", () => {
    expect(eligibleProviders(false)).toEqual(["claude"]);
    expect(eligibleProviders(true)).toEqual(["claude", "codex"]);
  });
});
