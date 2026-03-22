import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { homedir } from "os";
import { encodeProjectPath, resolvePath } from "../paths.js";
import { remapProjectPath } from "../session.js";

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

// ─── remapProjectPath — Windows paths ───────────────────────────────

describe("remapProjectPath — Windows compatibility", () => {
  it("remaps Unix /Users/<name> paths", () => {
    const result = remapProjectPath("/Users/alice/git/foo", "/Users/bob");
    expect(result).toBe("/Users/bob/git/foo");
  });

  it("remaps Unix /home/<name> paths", () => {
    const result = remapProjectPath("/home/alice/git/foo", "/home/bob");
    expect(result).toBe("/home/bob/git/foo");
  });

  it("remaps Windows C:\\Users\\<name> paths", () => {
    const result = remapProjectPath(
      "C:\\Users\\alice\\git\\foo",
      "C:\\Users\\bob",
    );
    expect(result).toBe("C:\\Users\\bob\\git\\foo");
  });

  it("handles Windows path with only home dir (no trailing subpath)", () => {
    const result = remapProjectPath("C:\\Users\\alice", "C:\\Users\\bob");
    expect(result).toBe("C:\\Users\\bob");
  });

  it("returns non-matching paths unchanged", () => {
    expect(remapProjectPath("/opt/data", "/Users/bob")).toBe("/opt/data");
    expect(remapProjectPath("D:\\Data\\project", "/Users/bob")).toBe(
      "D:\\Data\\project",
    );
  });

  it("returns path unchanged when home is the same (Windows)", () => {
    const result = remapProjectPath(
      "C:\\Users\\alice\\git\\foo",
      "C:\\Users\\alice",
    );
    expect(result).toBe("C:\\Users\\alice\\git\\foo");
  });
});
