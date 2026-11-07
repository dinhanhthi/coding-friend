import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { homedir } from "os";
import { encodeProjectPath, resolvePath } from "../paths.js";

// ─── encodeProjectPath ──────────────────────────────────────────────

describe("encodeProjectPath — Windows compatibility", () => {
  it("handles Unix paths (forward slashes)", () => {
    expect(encodeProjectPath("/Users/alice/git/foo")).toBe(
      "-Users-alice-git-foo",
    );
  });

  it("handles Windows paths (backslashes)", () => {
    expect(encodeProjectPath("C:\\Users\\alice\\git\\foo")).toBe(
      "C--Users-alice-git-foo",
    );
  });

  it("handles mixed separators", () => {
    expect(encodeProjectPath("C:\\Users\\alice/git/foo")).toBe(
      "C--Users-alice-git-foo",
    );
  });
});

// ─── resolvePath — Windows absolute paths ───────────────────────────

describe("resolvePath — Windows compatibility", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("returns Unix absolute paths unchanged", () => {
    expect(resolvePath("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("still expands ~/", () => {
    expect(resolvePath("~/projects")).toBe(join(homedir(), "projects"));
  });
});
