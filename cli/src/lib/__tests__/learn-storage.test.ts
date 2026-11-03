import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Spy on the spawn helper while keeping real behavior, so real git runs and
// every argv is recorded.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

import { commitLearnChange, learnStatus } from "../learn-storage.js";

const spawned = vi.mocked(execFileSync);

let tmp: string;
const savedEnv = { ...process.env };

function git(cwd: string, ...args: string[]): string {
  return (
    execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }) as string
  ).trim();
}

function gitWrites(): string[][] {
  return spawned.mock.calls
    .filter(([cmd]) => cmd === "git")
    .map(([, args]) => (args ?? []) as string[])
    .filter((args) =>
      args.some((a) => ["add", "commit", "push", "init"].includes(a)),
    );
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-learn-storage-")));
  // Keep the user's global git config (gpg signing, hooks) out of the test.
  const emptyCfg = join(tmp, "gitconfig");
  writeFileSync(emptyCfg, "");
  process.env.GIT_CONFIG_GLOBAL = emptyCfg;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

afterEach(() => {
  process.env = { ...savedEnv };
  rmSync(tmp, { recursive: true, force: true });
  spawned.mockClear();
});

describe("learn storage", () => {
  it("folder mode never runs git add, commit or push", () => {
    writeFileSync(join(tmp, "note.md"), "# note\n");
    const status = learnStatus({ learn: { outputDir: tmp, autoCommit: true } });
    expect(status.mode).toBe("folder");
    expect(status.git).toBeNull();

    spawned.mockClear();
    const result = commitLearnChange(
      status,
      join(tmp, "note.md"),
      "update",
      "concepts/note",
    );
    expect(result.committed).toBe(false);
    expect(gitWrites()).toEqual([]);
  });

  it("git mode with autoCommit commits only the edited file", () => {
    const repo = join(tmp, "learn");
    execFileSync("git", ["init", "-q", repo]);
    git(repo, "config", "user.name", "Test");
    git(repo, "config", "user.email", "test@example.com");
    writeFileSync(join(repo, "a.md"), "a1\n");
    writeFileSync(join(repo, "b.md"), "b1\n");
    git(repo, "add", "--", "a.md", "b.md");
    git(repo, "commit", "-q", "-m", "init");
    writeFileSync(join(repo, "a.md"), "a2\n");
    writeFileSync(join(repo, "b.md"), "b2\n");

    const status = learnStatus({
      learn: { outputDir: repo, autoCommit: true },
    });
    expect(status.mode).toBe("git");
    expect(status.git).toEqual({ root: repo, isRoot: true, hasOrigin: false });

    const result = commitLearnChange(
      status,
      join(repo, "a.md"),
      "update",
      "concepts/a",
    );
    expect(result).toEqual({ committed: true });
    expect(
      git(repo, "log", "-1", "--format=%s", "--name-only")
        .split("\n")
        .filter(Boolean),
    ).toEqual(["learn: update concepts/a", "a.md"]);
    expect(git(repo, "status", "--porcelain")).toBe("M b.md");
  });
});
