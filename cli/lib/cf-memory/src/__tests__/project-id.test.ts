import { describe, it, expect } from "vitest";
import { projectId } from "../backends/sqlite/index.js";

describe("projectId", () => {
  it("strips /docs/memory suffix and encodes path", () => {
    expect(projectId("/Users/thi/git/coding-friend/docs/memory")).toBe(
      "-Users-thi-git-coding-friend",
    );
  });

  it("strips /memory suffix when docsDir is custom", () => {
    expect(projectId("/Users/thi/git/foo/memory")).toBe("-Users-thi-git-foo");
  });

  it("handles path without known suffix", () => {
    expect(projectId("/Users/thi/git/foo/custom-docs")).toBe(
      "-Users-thi-git-foo-custom-docs",
    );
  });

  it("strips trailing slash before encoding", () => {
    expect(projectId("/Users/thi/git/foo/docs/memory/")).toBe(
      projectId("/Users/thi/git/foo/docs/memory"),
    );
  });

  it("strips multiple trailing slashes", () => {
    expect(projectId("/Users/thi/git/foo/docs/memory///")).toBe(
      "-Users-thi-git-foo",
    );
  });

  it("produces same result with and without trailing slash", () => {
    const withSlash = projectId("/a/b/c/docs/memory/");
    const withoutSlash = projectId("/a/b/c/docs/memory");
    expect(withSlash).toBe(withoutSlash);
    expect(withSlash).toBe("-a-b-c");
  });

  it("handles deeply nested paths", () => {
    expect(projectId("/a/b/c/d/e/f/g")).toBe("-a-b-c-d-e-f-g");
  });
});
