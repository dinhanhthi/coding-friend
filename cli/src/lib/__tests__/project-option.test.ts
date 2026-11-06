import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { useProjectDir } from "../project-option.js";
import { configGetCommand } from "../../commands/config-subcommands.js";

const origCwd = process.cwd();
let tmp: string;
let repo: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    stdio: "ignore",
  });
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-project-option-")));
  repo = join(tmp, "repo");
  mkdirSync(join(repo, "sub"), { recursive: true });
  git(repo, "init", "-q");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  git(repo, "worktree", "add", "-q", join(tmp, "wt"));
  mkdirSync(join(tmp, "wt", "sub"));
});

afterEach(() => {
  process.chdir(origCwd);
  vi.restoreAllMocks();
  process.exitCode = undefined;
  rmSync(tmp, { recursive: true, force: true });
});

describe("useProjectDir", () => {
  it.each([
    ["a subdir", "repo/sub"],
    ["a linked worktree", "wt/sub"],
  ])("resolves %s to the main repo root and chdirs there", (_, rel) => {
    process.chdir(tmp);
    const root = useProjectDir(rel);
    expect(root).toBe(repo);
    expect(process.cwd()).toBe(repo);
  });

  it("config get --json with a missing dir prints one NOT_FOUND envelope", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "error").mockImplementation((...args) => {
      stderr.push(args.join(" "));
    });

    await configGetCommand(undefined, {
      json: true,
      projectDir: join(tmp, "nope"),
    });

    expect(stdout).toHaveLength(1);
    const env = JSON.parse(stdout[0]);
    expect(env).toMatchObject({
      ok: false,
      data: null,
      error: { code: "NOT_FOUND" },
    });
    expect(env.error.message).not.toMatch(/\n\s+at /);
    expect(stderr.join("\n")).not.toMatch(/\n\s+at /);
    expect(process.cwd()).toBe(origCwd);
  });
});
