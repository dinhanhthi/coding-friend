import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../exec.js", () => ({
  run: vi.fn(),
}));

import { run } from "../exec.js";
import { resolveMainRepoRoot } from "../project-root.js";

const mockRun = vi.mocked(run);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("resolveMainRepoRoot", () => {
  it("returns baseDir when in main worktree (git-common-dir returns '.git')", () => {
    mockRun.mockReturnValue(".git");

    const result = resolveMainRepoRoot("/Users/x/repo");

    expect(mockRun).toHaveBeenCalledWith("git", [
      "-C",
      "/Users/x/repo",
      "rev-parse",
      "--git-common-dir",
    ]);
    expect(result).toBe("/Users/x/repo");
  });

  it("returns main repo root when in linked worktree (git-common-dir returns absolute path ending in /.git)", () => {
    mockRun.mockReturnValue("/Users/x/repo/.git");

    const result = resolveMainRepoRoot("/Users/x/repo-worktree");

    expect(result).toBe("/Users/x/repo");
  });

  it("returns baseDir when not in a git repo (git fails)", () => {
    mockRun.mockReturnValue(null);

    const result = resolveMainRepoRoot("/Users/x/not-a-repo");

    expect(result).toBe("/Users/x/not-a-repo");
  });

  it("falls back to show-toplevel when git-common-dir does not end in /.git", () => {
    mockRun
      .mockReturnValueOnce("/some/weird/path") // git-common-dir
      .mockReturnValueOnce("/Users/x/repo"); // git show-toplevel

    const result = resolveMainRepoRoot("/Users/x/repo-worktree");

    expect(mockRun).toHaveBeenCalledTimes(2);
    expect(mockRun).toHaveBeenNthCalledWith(2, "git", [
      "-C",
      "/Users/x/repo-worktree",
      "rev-parse",
      "--show-toplevel",
    ]);
    expect(result).toBe("/Users/x/repo");
  });

  it("returns baseDir when git-common-dir has no /.git suffix and show-toplevel also fails", () => {
    mockRun
      .mockReturnValueOnce("/some/weird/path") // git-common-dir
      .mockReturnValueOnce(null); // git show-toplevel fails

    const result = resolveMainRepoRoot("/Users/x/repo");

    expect(result).toBe("/Users/x/repo");
  });
});
