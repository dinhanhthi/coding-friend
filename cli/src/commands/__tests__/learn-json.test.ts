import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";

import {
  learnDeleteCommand,
  learnEditCommand,
  learnPushCommand,
  learnShowCommand,
} from "../learn.js";

describe("learn show|edit|delete --json", () => {
  let tmp: string;
  let repo: string;
  let note: string;

  function git(...args: string[]): string {
    return (
      execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf-8",
      }) as string
    ).trim();
  }

  function pipeStdin(body: string): void {
    vi.spyOn(process, "stdin", "get").mockReturnValue(
      Readable.from([Buffer.from(body)]) as unknown as typeof process.stdin,
    );
  }

  async function json(fn: () => Promise<void>) {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      await fn();
    } finally {
      vi.mocked(process.stdout.write).mockRestore();
    }
    expect(writes).toHaveLength(1);
    return JSON.parse(writes[0]);
  }

  beforeEach(() => {
    process.exitCode = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-learnjson-")));
    const home = join(tmp, "home");
    mkdirSync(join(home, ".coding-friend"), { recursive: true });
    // Keep the user's global git config (gpg signing, hooks) out of the test.
    writeFileSync(join(tmp, "gitconfig"), "");
    vi.stubEnv("HOME", home);
    vi.stubEnv("GIT_CONFIG_GLOBAL", join(tmp, "gitconfig"));
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");

    repo = join(tmp, "learn");
    note = join(repo, "concepts", "x.md");
    mkdirSync(join(repo, "concepts"), { recursive: true });
    writeFileSync(note, "---\ntitle: X\nupdated: 2020-01-01\n---\nold body\n");
    execFileSync("git", ["init", "-q", repo]);
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    git("add", "--", "concepts/x.md");
    git("commit", "-q", "-m", "init");
    writeFileSync(
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({ learn: { outputDir: repo, autoCommit: true } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("show then edit returns the envelope and commits the change", async () => {
    const shown = await json(() =>
      learnShowCommand("concepts/x", { json: true }),
    );
    expect(shown.data).toMatchObject({
      id: "concepts/x",
      path: note,
      frontmatter: { title: "X" },
      content: "old body\n",
    });

    pipeStdin("new body\n");
    const edited = await json(() =>
      learnEditCommand("concepts/x", {
        json: true,
        stdin: true,
        ifMatch: shown.data.sha256,
      }),
    );
    expect(edited).toMatchObject({ ok: true, error: null });
    expect(edited.data).toEqual({
      id: "concepts/x",
      path: note,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      mode: "git",
      committed: true,
    });
    expect(edited.data.sha256).not.toBe(shown.data.sha256);
    expect(git("log", "-1", "--format=%s")).toBe("learn: update concepts/x");
  });

  it("edit with an unchanged sha skips the commit", async () => {
    const first = (
      await json(() => learnShowCommand("concepts/x", { json: true }))
    ).data.sha256;
    pipeStdin("same body\n");
    const once = await json(() =>
      learnEditCommand("concepts/x", {
        json: true,
        stdin: true,
        ifMatch: first,
      }),
    );
    const commits = git("rev-list", "--count", "HEAD");

    pipeStdin("same body\n");
    const again = await json(() =>
      learnEditCommand("concepts/x", {
        json: true,
        stdin: true,
        ifMatch: once.data.sha256,
      }),
    );
    expect(again.data).toMatchObject({
      sha256: once.data.sha256,
      mode: "git",
      committed: false,
    });
    expect(again.data).not.toHaveProperty("commitError");
    expect(git("rev-list", "--count", "HEAD")).toBe(commits);
  });

  it("delete needs --yes in JSON mode, then deletes and commits", async () => {
    const refused = await json(() =>
      learnDeleteCommand("concepts/x", { json: true }),
    );
    expect(refused.ok).toBe(false);
    expect(refused.error.code).toBe("INTERACTIVE_REQUIRED");
    expect(existsSync(note)).toBe(true);

    process.exitCode = undefined;
    const env = await json(() =>
      learnDeleteCommand("concepts/x", { json: true, yes: true }),
    );
    expect(env.data).toEqual({
      id: "concepts/x",
      path: note,
      deleted: true,
      mode: "git",
      committed: true,
    });
    expect(existsSync(note)).toBe(false);
    expect(git("log", "-1", "--format=%s")).toBe("learn: delete concepts/x");
  });
});

describe("learn push", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("exits 0 in folder mode", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "cf-learnpush-")));
    vi.stubEnv("HOME", dir);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => {
      logs.push(a.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);
    process.exitCode = undefined;
    try {
      await learnPushCommand(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(logs.join("\n")).toContain("not applicable in folder mode");
  });
});
