import { describe, expect, it } from "vitest";

import { inProject } from "./project-filter";

describe("inProject", () => {
  it("matches the project path itself and paths under it", () => {
    expect(inProject("/a/b", "/a/b")).toBe(true);
    expect(inProject("/a/b/sub/dir", "/a/b")).toBe(true);
  });

  it("rejects a sibling that only shares the prefix", () => {
    expect(inProject("/a/bc", "/a/b")).toBe(false);
    expect(inProject("/a", "/a/b")).toBe(false);
  });

  it("ignores a trailing slash on the project path", () => {
    expect(inProject("/a/b", "/a/b/")).toBe(true);
    expect(inProject("/a/b/sub", "/a/b/")).toBe(true);
    expect(inProject("/a/bc", "/a/b/")).toBe(false);
  });
});
