import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { deflateSync, inflateSync } from "zlib";
import { newId } from "../store.js";
import {
  blobHash,
  checkCommitFidelity,
  commitPaths,
  computeFingerprint,
  diffSnapshots,
  fingerprintEquals,
  gitObjectFormat,
  gitRun,
  makeChefHooksDir,
  readSymbolicHead,
  resolveBranchHead,
  snapshotRepoGuard,
  snapshotSteering,
  validateCommitPath,
  type ChefFingerprint,
  type GitCtx,
} from "../chef-git.js";

/**
 * Security tests for chef-git on scratch repos laced with traps: a
 * core.fsmonitor command, core.hooksPath pointing at hostile hooks, hooks
 * in .git/hooks, filter.evil clean/smudge, diff.evil textconv, gpg.program.
 * Every trap touches a marker file in marks/; afterEach asserts none fired.
 */

let root: string;
let home: string;
let marksDir: string;
let realGit: string;
let hooksDir: string;
let neutralCwd: string;
let chefId: string;
let repoSeq = 0;
let wakeSeq = 0;

const HOSTILE_HOOKS = [
  "pre-commit",
  "post-commit",
  "commit-msg",
  "prepare-commit-msg",
  "post-index-change",
  "reference-transaction",
  "post-checkout",
  "pre-auto-gc",
  "post-rewrite",
];

interface Repo {
  dir: string;
  ctx: GitCtx;
  head: string;
  plan: string;
}

function marks(): string[] {
  return readdirSync(marksDir);
}

function writeExec(file: string, body: string): void {
  writeFileSync(file, body, { mode: 0o755 });
  chmodSync(file, 0o755);
}

/** git outside CF (fixture setup and checks): explicit env, traps off. */
function plainRaw(
  dir: string,
  args: string[],
  input?: string,
  extraEnv: Record<string, string> = {},
): string {
  const r = spawnSync(
    realGit,
    [
      "-C",
      dir,
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      ...args,
    ],
    {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: home,
        GIT_CONFIG_NOSYSTEM: "1",
        ...extraEnv,
      },
      input: input ?? "",
    },
  );
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  }
  return r.stdout.toString("utf-8");
}

function plain(dir: string, ...args: string[]): string {
  return plainRaw(dir, args).trim();
}

/**
 * New dirty scratch repo: committed clean, then hostile config and hooks
 * installed, then the working tree is changed (modify, delete, add, mode,
 * ignored file, nested AGENTS.md).
 */
function mkRepo(opts: { filterAttr?: boolean; gpgSign?: boolean } = {}): Repo {
  const dir = join(root, "repos", `r${++repoSeq}`);
  mkdirSync(dir, { recursive: true });
  plain(dir, "init", "-q", "-b", "main");
  for (const d of ["src", "docs/plans/p", "sub"]) {
    mkdirSync(join(dir, d), { recursive: true });
  }
  writeFileSync(join(dir, "src/a.txt"), "a\n");
  writeFileSync(join(dir, "src/b.txt"), "b\n");
  writeFileSync(join(dir, "src/del.txt"), "del\n");
  writeExec(join(dir, "run.sh"), "#!/bin/sh\necho x\n");
  writeFileSync(join(dir, "CLAUDE.md"), "root\n");
  writeFileSync(join(dir, "docs/plans/p/README.md"), "plan\n");
  writeFileSync(join(dir, "sub/AGENTS.md"), "nested\n");
  writeFileSync(join(dir, ".gitignore"), "docs/plans/\nignored.log\n");
  writeFileSync(
    join(dir, ".gitattributes"),
    opts.filterAttr ? "* filter=evil diff=evil\n" : "*.bin binary\n",
  );
  plain(dir, "add", "-A");
  plain(dir, "commit", "-q", "-m", "init");
  const bin = join(root, "bin");
  appendFileSync(
    join(dir, ".git/config"),
    [
      "[core]",
      `\tfsmonitor = ${bin}/fsmon`,
      `\thooksPath = ${root}/evilhooks`,
      '[filter "evil"]',
      `\tclean = ${bin}/clean`,
      `\tsmudge = ${bin}/smudge`,
      "\trequired = true",
      '[diff "evil"]',
      `\ttextconv = ${bin}/textconv`,
      "[gpg]",
      `\tprogram = ${bin}/gpg`,
      "[commit]",
      `\tgpgSign = ${opts.gpgSign ? "true" : "false"}`,
      "",
    ].join("\n"),
  );
  for (const h of [
    "pre-commit",
    "post-index-change",
    "reference-transaction",
    "post-commit",
  ]) {
    copyFileSync(join(root, "evilhooks", h), join(dir, ".git/hooks", h));
    chmodSync(join(dir, ".git/hooks", h), 0o755);
  }
  appendFileSync(join(dir, "src/a.txt"), "a2\n");
  unlinkSync(join(dir, "src/del.txt"));
  writeFileSync(join(dir, "src/new.txt"), "new\n");
  writeFileSync(join(dir, "ignored.log"), "ig\n");
  chmodSync(join(dir, "src/b.txt"), 0o755);
  appendFileSync(join(dir, "sub/AGENTS.md"), "nested2\n");
  const ctx: GitCtx = {
    gitBin: realGit,
    gitDir: join(dir, ".git"),
    checkout: dir,
    hooksDir,
    neutralCwd,
  };
  return {
    dir,
    ctx,
    head: plain(dir, "rev-parse", "refs/heads/main"),
    plan: join(dir, "docs/plans/p"),
  };
}

function commit(
  r: Repo,
  paths: string[],
  fp: ChefFingerprint,
  extra: { message?: string; ctx?: GitCtx } = {},
) {
  return commitPaths({
    ctx: extra.ctx ?? r.ctx,
    id: chefId,
    n: ++wakeSeq,
    paths,
    message: extra.message ?? "chef: update",
    expectedHead: r.head,
    branch: "main",
    gateFingerprint: fp,
    steering: { planDir: r.plan },
  });
}

function branchHead(r: Repo): string {
  return plain(r.dir, "rev-parse", "refs/heads/main");
}

/**
 * Shim git: the first time `sub` is the subcommand, run `action` (shell),
 * then exec the real git. Simulates a racing writer between two git calls.
 */
function shimGit(name: string, sub: string, action: string): string {
  const file = join(root, "bin", name);
  const flag = join(root, `${name}.done`);
  writeExec(
    file,
    [
      "#!/bin/sh",
      'for a in "$@"; do',
      `  if [ "$a" = "${sub}" ]; then`,
      `    if [ ! -e "${flag}" ]; then`,
      `      : > "${flag}"`,
      `      ${action}`,
      "    fi",
      "    break",
      "  fi",
      "done",
      `exec "${realGit}" "$@"`,
      "",
    ].join("\n"),
  );
  return file;
}

describe.skipIf(process.platform === "win32")("chef-git security", () => {
  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cf-chef-git-")));
    home = join(root, "home");
    marksDir = join(root, "marks");
    for (const d of [
      home,
      marksDir,
      join(root, "bin"),
      join(root, "evilhooks"),
    ]) {
      mkdirSync(d, { recursive: true });
    }
    writeFileSync(
      join(home, ".gitconfig"),
      "[user]\n\tname = Scratch\n\temail = scratch@example.com\n",
    );
    const which = spawnSync("sh", ["-c", "command -v git"]);
    realGit = which.stdout.toString().trim();
    if (!realGit.startsWith("/")) throw new Error("git not found");
    const bin = join(root, "bin");
    for (const h of HOSTILE_HOOKS) {
      writeExec(
        join(root, "evilhooks", h),
        `#!/bin/sh\ntouch "${marksDir}/hook-${h}"\ncat >/dev/null 2>&1 || true\n`,
      );
    }
    writeExec(join(bin, "fsmon"), `#!/bin/sh\ntouch "${marksDir}/fsmonitor"\n`);
    writeExec(
      join(bin, "clean"),
      `#!/bin/sh\ntouch "${marksDir}/filter-clean"\ncat\n`,
    );
    writeExec(
      join(bin, "smudge"),
      `#!/bin/sh\ntouch "${marksDir}/filter-smudge"\ncat\n`,
    );
    writeExec(
      join(bin, "textconv"),
      `#!/bin/sh\ntouch "${marksDir}/textconv"\ncat "$1"\n`,
    );
    writeExec(join(bin, "gpg"), `#!/bin/sh\ntouch "${marksDir}/gpg"\nexit 1\n`);

    vi.stubEnv("HOME", home);
    vi.stubEnv("CF_ORCHESTRATOR_DIR", join(root, "orch"));
    chefId = newId();
    const chefDir = join(root, "orch", "chefs", chefId);
    mkdirSync(chefDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(chefDir, "chef.json"), "{}");
    hooksDir = makeChefHooksDir(chefId);
    neutralCwd = join(chefDir, "private");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  afterEach(() => {
    const fired = marks();
    for (const m of fired) rmSync(join(marksDir, m));
    expect(fired).toEqual([]);
  });

  // ─── no git command reads the working tree ──────────────────────────

  it("the whole chain on a dirty hostile repo fires no hook, filter, fsmonitor, textconv or gpg", () => {
    const h = mkRepo({ filterAttr: true, gpgSign: true });
    const ctx = h.ctx;
    expect(resolveBranchHead(ctx, "main")).toBe(h.head);
    expect(readSymbolicHead(ctx)).toBe("refs/heads/main");
    expect(gitObjectFormat(ctx)).toBe("sha1");
    const fp = computeFingerprint(ctx, h.head);
    expect(Object.keys(fp.changed)).toContain("src/a.txt");
    snapshotRepoGuard(ctx);
    snapshotSteering(ctx, h.plan);
    const fid = checkCommitFidelity(ctx, h.head, [{ path: "src/a.txt" }]);
    expect(fid.join("\n")).toMatch(/filter attribute/);
    expect(commit(h, ["src/a.txt"], fp).kind).toBe("refused");

    // The plumbing commitPaths uses, run directly in the hostile repo.
    const run = (
      args: string[],
      extra: { input?: string; indexFile?: string } = {},
    ) => {
      const r = gitRun({ ...ctx, args, ...extra });
      expect(r.status, `${args[0]}: ${r.stderr}`).toBe(0);
      return r.stdout.toString("utf-8").trim();
    };
    run(["ls-files", "-s", "-z"]);
    run(["ls-files", "-o", "--exclude-standard", "-z"]);
    run(["ls-tree", "-r", "-z", h.head]);
    run(["cat-file", "-t", h.head]);
    run(["check-attr", "--stdin", "-z", "filter", "diff"], {
      input: "src/a.txt\0",
    });
    run(["config", "--list", "--show-origin", "--show-scope", "-z"]);
    const indexFile = join(neutralCwd, "chain-index");
    run(["read-tree", h.head], { indexFile });
    const blob = run(["hash-object", "-w", "--stdin", "--no-filters"], {
      input: "raw\n",
    });
    run(["update-index", "--add", "--cacheinfo", `100644,${blob},src/a.txt`], {
      indexFile,
    });
    run(["update-index", "--force-remove", "--", "src/b.txt"], { indexFile });
    const tree = run(["write-tree"], { indexFile });
    run(
      [
        "diff-index",
        "--cached",
        "--raw",
        "-z",
        "--no-ext-diff",
        "--no-textconv",
        h.head,
      ],
      { indexFile },
    );
    const c = run(
      ["commit-tree", tree, "-p", h.head, "--no-gpg-sign", "-F", "-"],
      {
        input: "raw\n",
      },
    );
    run([
      "update-ref",
      "--no-deref",
      "-m",
      "probe",
      "refs/heads/probe",
      c,
      "0".repeat(40),
    ]);
    unlinkSync(indexFile);
    expect(plain(h.dir, "cat-file", "commit", c)).not.toContain("gpgsig");
    expect(marks()).toEqual([]);
  });

  it("positive control: plain git status in the same repo does fire the traps", () => {
    const h = mkRepo({ filterAttr: true, gpgSign: true });
    spawnSync(realGit, ["-C", h.dir, "status", "--porcelain"], {
      env: { PATH: process.env.PATH ?? "", HOME: home },
    });
    const fired = marks();
    for (const m of fired) rmSync(join(marksDir, m));
    expect(fired.length).toBeGreaterThan(0);
  });

  // ─── gitRun hardening ───────────────────────────────────────────────

  it("gitRun refuses working-tree commands and off-allowlist flags before spawning", () => {
    const sha = "a".repeat(40);
    // A spawn of this binary would fail with GIT_FAILED (ENOENT), so
    // GIT_DENIED proves nothing was spawned.
    const ctx: GitCtx = {
      gitBin: join(root, "no-such-git"),
      gitDir: join(root, "x/.git"),
      checkout: join(root, "x"),
      hooksDir,
      neutralCwd,
    };
    const denied = [
      ["status"],
      ["diff"],
      ["add", "."],
      ["commit", "-m", "x"],
      ["stash"],
      ["checkout", "main"],
      ["rev-parse", "--verify", "HEAD"],
      ["cat-file", "-p", sha],
      ["cat-file", "--filters", sha],
      ["cat-file", "--textconv", sha],
      [
        "diff-index",
        "-p",
        "--cached",
        "-z",
        "--no-ext-diff",
        "--no-textconv",
        sha,
      ],
      [
        "diff-index",
        "--cached",
        "--name-only",
        "-z",
        "--no-ext-diff",
        "--no-textconv",
        "--textconv",
        sha,
      ],
      [
        "diff-index",
        "--cached",
        "--name-only",
        "-z",
        "--no-ext-diff",
        "--no-textconv",
        "--ext-diff",
        sha,
      ],
      ["diff-index", "--cached", "--name-only", "-z", "--no-ext-diff", sha],
      ["ls-files", "-m"],
      ["cat-file", "--batch-command"],
      ["cat-file", "--batch", sha],
    ];
    for (const args of denied) {
      expect(() => gitRun({ ...ctx, args }), args.join(" ")).toThrow(
        expect.objectContaining({ kind: "GIT_DENIED" }),
      );
    }
    expect(() =>
      gitRun({ ...ctx, args: ["cat-file", "--batch"], input: "HEAD:x\n" }),
    ).toThrow(expect.objectContaining({ kind: "GIT_DENIED" }));
    expect(() => gitRun({ ...ctx, args: ["ls-files", "-s", "-z"] })).toThrow(
      expect.objectContaining({ kind: "GIT_FAILED" }),
    );
  });

  it("gitRun passes no inherited GIT_* variable and runs in neutralCwd", () => {
    const log = join(root, "shim-env");
    const cwdLog = join(root, "shim-cwd");
    const shim = join(root, "bin", "envshim");
    const argvLog = join(root, "shim-argv");
    writeExec(
      shim,
      `#!/bin/sh\nenv > "${log}"\npwd -P > "${cwdLog}"\nprintf '%s\\n' "$@" > "${argvLog}"\n`,
    );
    const saved = { ...process.env };
    process.env.GIT_DIR = "/nonexistent";
    process.env.GIT_EXTERNAL_DIFF = join(root, "bin/textconv");
    process.env.GIT_SSH_COMMAND = `touch ${marksDir}/ssh`;
    try {
      const r = gitRun({
        gitBin: shim,
        gitDir: join(root, "x/.git"),
        checkout: join(root, "x"),
        hooksDir,
        neutralCwd,
        args: ["ls-files", "-s", "-z"],
      });
      expect(r.status).toBe(0);
    } finally {
      for (const k of ["GIT_DIR", "GIT_EXTERNAL_DIFF", "GIT_SSH_COMMAND"]) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
    const vars = readFileSync(log, "utf-8")
      .split("\n")
      .filter((l) => l.startsWith("GIT_"))
      .sort();
    expect(vars).toEqual([
      "GIT_CONFIG_NOSYSTEM=1",
      "GIT_NO_LAZY_FETCH=1",
      "GIT_NO_REPLACE_OBJECTS=1",
      "GIT_OPTIONAL_LOCKS=0",
      "GIT_TERMINAL_PROMPT=0",
    ]);
    expect(readFileSync(cwdLog, "utf-8").trim()).toBe(realpathSync(neutralCwd));
    // commit-graph / multi-pack-index are read without content checks; a
    // forged commit-graph (chunked file with a trailing checksum) is not
    // cheap to craft here, so the test asserts git is told to ignore them.
    const argv = readFileSync(argvLog, "utf-8").split("\n");
    for (const kv of [
      "core.fsmonitor=false",
      "core.commitGraph=false",
      "core.multiPackIndex=false",
      "gc.auto=0",
      "core.untrackedCache=false",
      "core.splitIndex=false",
      "core.sparseCheckout=false",
    ]) {
      expect(argv[argv.indexOf(kv) - 1], kv).toBe("-c");
    }
  });

  // ─── TOCTOU and ref races ───────────────────────────────────────────

  it("content changed after the gate: mismatch, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    appendFileSync(join(r.dir, "src/a.txt"), "sneaky\n");
    const res = commit(r, ["src/a.txt"], fp);
    expect(res).toMatchObject({ kind: "mismatch" });
    expect(branchHead(r)).toBe(r.head);
  });

  it("mode changed after the gate: mismatch, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    chmodSync(join(r.dir, "src/a.txt"), 0o755);
    const res = commit(r, ["src/a.txt"], fp);
    expect(res).toMatchObject({ kind: "mismatch" });
    expect(branchHead(r)).toBe(r.head);
  });

  it("parent dir swapped to a symlink during commitPaths: mismatch, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    // The swap happens after path validation (at symbolic-ref) and before
    // the gated read.
    const gitBin = shimGit(
      "swapshim",
      "symbolic-ref",
      `mv "${r.dir}/src" "${r.dir}/src-real" && ln -s "${r.dir}/src-real" "${r.dir}/src"`,
    );
    const res = commit(r, ["src/a.txt"], fp, { ctx: { ...r.ctx, gitBin } });
    expect(res).toMatchObject({
      kind: "mismatch",
      reason: expect.stringMatching(/no longer a real directory/),
    });
    expect(branchHead(r)).toBe(r.head);
  });

  it("hash-object returning another sha: mismatch, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const gitBin = shimGit(
      "hashshim",
      "hash-object",
      `cat >/dev/null; echo ${"0".repeat(40)}; exit 0`,
    );
    const res = commit(r, ["src/a.txt"], fp, { ctx: { ...r.ctx, gitBin } });
    expect(res).toMatchObject({
      kind: "mismatch",
      reason: expect.stringMatching(/another sha/),
    });
    expect(branchHead(r)).toBe(r.head);
  });

  it("branch ref moved during commitPaths: compare-and-swap fails, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const other = plainRaw(
      r.dir,
      ["commit-tree", `${r.head}^{tree}`, "-p", r.head],
      "user\n",
    ).trim();
    const gitBin = shimGit(
      "refshim",
      "commit-tree",
      `"${realGit}" --git-dir="${r.ctx.gitDir}" -c core.hooksPath=/dev/null update-ref refs/heads/main ${other}`,
    );
    const res = commit(r, ["src/a.txt"], fp, { ctx: { ...r.ctx, gitBin } });
    expect(res).toMatchObject({
      kind: "mismatch",
      reason: expect.stringMatching(/compare-and-swap failed/),
    });
    expect(branchHead(r)).toBe(other);
  });

  it("HEAD on another branch: no commit on either branch", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    plain(r.dir, "update-ref", "refs/heads/other", r.head);
    plain(r.dir, "symbolic-ref", "HEAD", "refs/heads/other");
    const res = commit(r, ["src/a.txt"], fp);
    expect(res).toMatchObject({
      kind: "mismatch",
      reason: expect.stringMatching(/HEAD does not point to refs\/heads\/main/),
    });
    expect(branchHead(r)).toBe(r.head);
    expect(plain(r.dir, "rev-parse", "refs/heads/other")).toBe(r.head);
  });

  it("HEAD moved to another branch right before update-ref: committed-index-sync-failed, real index untouched", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const before = plain(r.dir, "ls-files", "-s", "src/a.txt");
    const gitBin = shimGit(
      "headmoveshim",
      "update-ref",
      `"${realGit}" --git-dir="${r.ctx.gitDir}" -c core.hooksPath=/dev/null symbolic-ref HEAD refs/heads/other`,
    );
    const res = commit(r, ["src/a.txt"], fp, { ctx: { ...r.ctx, gitBin } });
    expect(res).toMatchObject({
      kind: "committed-index-sync-failed",
      error: expect.stringMatching(
        /HEAD no longer points to refs\/heads\/main/,
      ),
    });
    if (res.kind !== "committed-index-sync-failed") return;
    expect(branchHead(r)).toBe(res.commit);
    expect(plain(r.dir, "ls-files", "-s", "src/a.txt")).toBe(before);
  });

  it("git crashing on the symbolic-ref recheck after update-ref: committed-index-sync-failed, no throw", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const gitBin = join(root, "bin", "postcasshim");
    const landed = join(root, "postcasshim.landed");
    writeExec(
      gitBin,
      [
        "#!/bin/sh",
        'for a in "$@"; do',
        '  case "$a" in',
        `    update-ref) "${realGit}" "$@"; s=$?; : > "${landed}"; exit $s ;;`,
        `    symbolic-ref) [ -e "${landed}" ] && kill -KILL $$; break ;;`,
        "  esac",
        "done",
        `exec "${realGit}" "$@"`,
        "",
      ].join("\n"),
    );
    const res = commit(r, ["src/a.txt"], fp, { ctx: { ...r.ctx, gitBin } });
    expect(res).toMatchObject({
      kind: "committed-index-sync-failed",
      error: expect.stringMatching(/symbolic-ref did not complete/),
    });
    if (res.kind !== "committed-index-sync-failed") return;
    expect(branchHead(r)).toBe(res.commit);
  });

  it("branch ref swapped away and back between read-tree and update-ref: commit holds only the listed paths", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const blob = plainRaw(
      r.dir,
      ["hash-object", "-w", "--stdin"],
      "x\n",
    ).trim();
    const otherTree = plainRaw(
      r.dir,
      ["mktree"],
      `100644 blob ${blob}\tonly.txt\n`,
    ).trim();
    const other = plainRaw(
      r.dir,
      ["commit-tree", otherTree, "-p", r.head],
      "other\n",
    ).trim();
    const upd = `"${realGit}" --git-dir="${r.ctx.gitDir}" -c core.hooksPath=/dev/null update-ref refs/heads/main`;
    const gitBin = shimGit(
      "swapbackshim",
      "hash-object",
      `${upd} ${other} && ${upd} ${r.head}`,
    );
    const res = commit(r, ["src/a.txt"], fp, { ctx: { ...r.ctx, gitBin } });
    expect(res.kind).toBe("committed");
    if (res.kind !== "committed") return;
    expect(res.parent).toBe(r.head);
    expect(branchHead(r)).toBe(res.commit);
    expect(
      plain(
        r.dir,
        "diff-tree",
        "--no-renames",
        "-r",
        "--name-only",
        r.head,
        res.commit,
      ),
    ).toBe("src/a.txt");
    expect(plain(r.dir, "ls-tree", res.commit, "only.txt")).toBe("");
  });

  // ─── object store tampering ─────────────────────────────────────────

  function looseObject(r: Repo, sha: string): string {
    return join(r.ctx.gitDir, "objects", sha.slice(0, 2), sha.slice(2));
  }

  it("a pre-planted loose blob named sha(C) holding other bytes: refused, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const sha = blobHash(readFileSync(join(r.dir, "src/a.txt")), "sha1");
    expect(fp.changed["src/a.txt"]).toEqual({ mode: "100644", hash: sha });
    const planted = Buffer.from("planted\n");
    mkdirSync(join(r.ctx.gitDir, "objects", sha.slice(0, 2)), {
      recursive: true,
    });
    writeFileSync(
      looseObject(r, sha),
      deflateSync(
        Buffer.concat([Buffer.from(`blob ${planted.length}\0`), planted]),
      ),
    );
    const res = commit(r, ["src/a.txt"], fp);
    expect(res).toMatchObject({
      kind: "refused",
      reasons: [expect.stringMatching(/object store tampered/)],
    });
    expect(branchHead(r)).toBe(r.head);
  });

  it("a forged base tree planted in a pack: fingerprint throws OBJECT_MISMATCH, commit refused", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const t = plain(r.dir, "rev-parse", `${r.head}^{tree}`);
    const f = join(root, "forge", `f${repoSeq}`);
    mkdirSync(f, { recursive: true });
    plain(f, "init", "-q");
    const evil = plainRaw(f, ["hash-object", "-w", "--stdin"], "evil\n").trim();
    const d = plainRaw(f, ["mktree"], `100644 blob ${evil}\tevil.txt\n`).trim();
    // The forged tree's bytes stored loose under the real tree's name; the
    // pack-objects .idx then names those bytes by the requested sha.
    const raw = inflateSync(
      readFileSync(join(f, ".git/objects", d.slice(0, 2), d.slice(2))),
    );
    mkdirSync(join(f, ".git/objects", t.slice(0, 2)), { recursive: true });
    writeFileSync(
      join(f, ".git/objects", t.slice(0, 2), t.slice(2)),
      deflateSync(raw),
    );
    plainRaw(f, ["pack-objects", join(f, "forged")], `${t}\n`);
    for (const name of readdirSync(f).filter((n) => n.startsWith("forged-"))) {
      copyFileSync(join(f, name), join(r.ctx.gitDir, "objects/pack", name));
    }
    rmSync(looseObject(r, t));
    // git hands out the forged bytes for the real tree name.
    expect(plainRaw(r.dir, ["cat-file", "--batch"], `${t}\n`)).toContain(
      "evil.txt",
    );
    expect(() => computeFingerprint(r.ctx, r.head)).toThrow(
      expect.objectContaining({ kind: "OBJECT_MISMATCH" }),
    );
    const res = commit(r, ["src/a.txt"], fp);
    expect(res).toMatchObject({
      kind: "refused",
      reasons: [expect.stringMatching(/object store tampered/)],
    });
    expect(branchHead(r)).toBe(r.head);
  });

  /** Replace the loose object `sha` with `type` + `body` (not hashing to it). */
  function plantLoose(r: Repo, sha: string, type: string, body: Buffer): void {
    const file = looseObject(r, sha);
    mkdirSync(join(r.ctx.gitDir, "objects", sha.slice(0, 2)), {
      recursive: true,
    });
    rmSync(file, { force: true });
    writeFileSync(
      file,
      deflateSync(
        Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body]),
      ),
    );
  }

  it("a forged tree pre-planted under the sha write-tree will produce: refused, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const baseTree = plain(r.dir, "rev-parse", `${r.head}^{tree}`);
    const blob = blobHash(readFileSync(join(r.dir, "src/a.txt")), "sha1");
    const env = { GIT_INDEX_FILE: join(root, `scratch-index-${repoSeq}`) };
    plainRaw(r.dir, ["read-tree", baseTree], undefined, env);
    plainRaw(
      r.dir,
      ["update-index", "--add", "--cacheinfo", `100644,${blob},src/a.txt`],
      undefined,
      env,
    );
    const tree = plainRaw(
      r.dir,
      ["write-tree", "--missing-ok"],
      undefined,
      env,
    ).trim();
    const evil = plainRaw(r.dir, ["hash-object", "-w", "--stdin"], "evil\n");
    plantLoose(
      r,
      tree,
      "tree",
      Buffer.concat([
        Buffer.from("100644 evil.txt\0"),
        Buffer.from(evil.trim(), "hex"),
      ]),
    );
    expect(plainRaw(r.dir, ["cat-file", "--batch"], `${tree}\n`)).toContain(
      "evil.txt",
    );
    const res = commit(r, ["src/a.txt"], fp);
    expect(res).toMatchObject({
      kind: "refused",
      reasons: [expect.stringMatching(/object store tampered/)],
    });
    expect(branchHead(r)).toBe(r.head);
  });

  it("commit-tree's commit swapped for a forged object: refused, no commit", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const baseTree = plain(r.dir, "rev-parse", `${r.head}^{tree}`);
    const body = Buffer.from(
      [
        `tree ${baseTree}`,
        `parent ${r.head}`,
        "author X <x@example.com> 0 +0000",
        "committer X <x@example.com> 0 +0000",
        "",
        "chef: update",
        "",
      ].join("\n"),
    );
    const forged = join(root, `forged-commit-${repoSeq}`);
    writeFileSync(
      forged,
      deflateSync(
        Buffer.concat([Buffer.from(`commit ${body.length}\0`), body]),
      ),
    );
    const objects = join(r.ctx.gitDir, "objects");
    const gitBin = join(root, "bin", "commitswapshim");
    writeExec(
      gitBin,
      [
        "#!/bin/sh",
        'for a in "$@"; do',
        '  if [ "$a" = "commit-tree" ]; then',
        `    out=$("${realGit}" "$@") || exit $?`,
        `    o="${objects}/$(printf %s "$out" | cut -c1-2)/$(printf %s "$out" | cut -c3-)"`,
        `    rm -f "$o" && cp "${forged}" "$o" || exit 1`,
        `    printf '%s\\n' "$out"`,
        "    exit 0",
        "  fi",
        "done",
        `exec "${realGit}" "$@"`,
        "",
      ].join("\n"),
    );
    const res = commit(r, ["src/a.txt"], fp, { ctx: { ...r.ctx, gitBin } });
    expect(res).toMatchObject({
      kind: "refused",
      reasons: [expect.stringMatching(/object store tampered/)],
    });
    expect(branchHead(r)).toBe(r.head);
  });

  // ─── happy commit ───────────────────────────────────────────────────

  it("commits exactly the listed paths (tree, parent, message, deletion) and syncs the index", () => {
    const r = mkRepo();
    const fp = computeFingerprint(r.ctx, r.head);
    const paths = [
      "src/a.txt",
      "src/b.txt",
      "src/del.txt",
      "src/new.txt",
      "sub/AGENTS.md",
    ];
    expect(Object.keys(fp.changed).sort()).toEqual(paths);
    expect(fp.changed["src/del.txt"]).toBe("deleted");
    const res = commit(r, paths, fp, { message: "chef: update src" });
    expect(res.kind).toBe("committed");
    if (res.kind !== "committed") return;
    expect(branchHead(r)).toBe(res.commit);
    const raw = plainRaw(r.dir, ["cat-file", "commit", res.commit]);
    const [headers, body] = raw.split("\n\n");
    expect(
      headers.split("\n").filter((l) => !/^(author|committer) /.test(l)),
    ).toEqual([`tree ${res.tree}`, `parent ${r.head}`]);
    expect(body).toBe("chef: update src\n");
    expect(
      plain(
        r.dir,
        "diff-tree",
        "--no-renames",
        "-r",
        "--name-only",
        r.head,
        res.commit,
      )
        .split("\n")
        .sort(),
    ).toEqual(paths);
    expect(plain(r.dir, "ls-tree", res.commit, "src/del.txt")).toBe("");
    expect(plain(r.dir, "ls-tree", res.commit, "src/b.txt")).toMatch(
      /^100755 /,
    );
    expect(plain(r.dir, "write-tree")).toBe(res.tree);
    expect(computeFingerprint(r.ctx, res.commit).changed).toEqual({});
  });

  it("fingerprints and commits a symlink as a 120000 entry of its target bytes", () => {
    const r = mkRepo();
    symlinkSync("a.txt", join(r.dir, "src/link"));
    const fp = computeFingerprint(r.ctx, r.head);
    const hash = blobHash(Buffer.from("a.txt"), "sha1");
    expect(fp.changed["src/link"]).toEqual({ mode: "120000", hash });
    const res = commit(r, ["src/link"], fp);
    expect(res.kind).toBe("committed");
    if (res.kind !== "committed") return;
    expect(plain(r.dir, "ls-tree", res.commit, "src/link")).toBe(
      `120000 blob ${hash}\tsrc/link`,
    );
    expect(plainRaw(r.dir, ["cat-file", "blob", hash])).toBe("a.txt");
  });

  // ─── refusals ───────────────────────────────────────────────────────

  it("refuses a path with a filter attribute", () => {
    const r = mkRepo();
    writeFileSync(join(r.dir, ".gitattributes"), "src/a.txt filter=evil\n");
    const res = commit(r, ["src/a.txt"], computeFingerprint(r.ctx, r.head));
    expect(res).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(res)).toMatch(/filter attribute/);
    expect(branchHead(r)).toBe(r.head);
  });

  it("refuses CRLF content when core.autocrlf converts", () => {
    const r = mkRepo();
    plain(r.dir, "config", "core.autocrlf", "true");
    writeFileSync(join(r.dir, "src/crlf.txt"), "a\r\nb\r\n");
    const res = commit(r, ["src/crlf.txt"], computeFingerprint(r.ctx, r.head));
    expect(res).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(res)).toMatch(/CRLF/);
  });

  it("refuses CRLF content when an eol attribute converts", () => {
    const r = mkRepo();
    writeFileSync(join(r.dir, ".gitattributes"), "*.txt eol=crlf\n");
    writeFileSync(join(r.dir, "src/crlf.txt"), "a\r\nb\r\n");
    const res = commit(r, ["src/crlf.txt"], computeFingerprint(r.ctx, r.head));
    expect(res).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(res)).toMatch(/CRLF/);
  });

  it("refuses when commit.gpgSign is true", () => {
    const r = mkRepo({ gpgSign: true });
    const res = commit(r, ["src/a.txt"], computeFingerprint(r.ctx, r.head));
    expect(res).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(res)).toMatch(/gpgSign/);
    expect(branchHead(r)).toBe(r.head);
  });

  it("refuses a gitlink path", () => {
    const r = mkRepo();
    plain(
      r.dir,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${r.head},mod`,
    );
    expect(
      checkCommitFidelity(r.ctx, r.head, [{ path: "mod" }]).join("\n"),
    ).toMatch(/gitlink/);
    const res = commit(r, ["mod"], computeFingerprint(r.ctx, r.head));
    expect(res).toEqual({
      kind: "refused",
      reasons: ["mod: gitlink/submodule"],
    });
    expect(branchHead(r)).toBe(r.head);
  });

  it("refuses a path whose only change is in the index", () => {
    const r = mkRepo();
    plain(r.dir, "add", "src/a.txt");
    writeFileSync(join(r.dir, "src/a.txt"), "a\n");
    const fp = computeFingerprint(r.ctx, r.head);
    expect(fp.changed).toHaveProperty(["src/a.txt"]);
    const res = commit(r, ["src/a.txt"], fp);
    expect(res).toEqual({
      kind: "refused",
      reasons: [
        "src/a.txt: only the index differs from HEAD (the working tree matches HEAD)",
      ],
    });
    expect(branchHead(r)).toBe(r.head);
  });

  it.each([
    ["../x", /normalised/],
    [".git/x", /under \.git/],
    [".GIT/x", /under \.git/],
    ["CLAUDE.md", /steering/],
    ["AGENTS.md", /steering/],
    [".gitmodules", /steering/],
    ["docs/plans/p/README.md", /steering/],
    ["src/.gitattributes", /steering/],
  ])("validateCommitPath refuses %s", (p, why) => {
    const r = join(root, "vc");
    expect(
      validateCommitPath(r, p, { planDir: join(r, "docs/plans/p") }),
    ).toMatch(why);
  });

  it("validateCommitPath refuses a path through a symlink escaping the checkout", () => {
    const r = mkRepo();
    const outside = join(root, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "x"), "x");
    symlinkSync(outside, join(r.dir, "esc"));
    expect(validateCommitPath(r.dir, "esc/x", { planDir: r.plan })).toMatch(
      /symlink/,
    );
  });

  it("planDir is compared by realpath; a planDir at or outside the checkout throws INVALID", () => {
    const r = mkRepo();
    const alias = join(root, `alias-r${repoSeq}`);
    symlinkSync(r.dir, alias);
    const plan = "docs/plans/p/README.md";
    expect(
      validateCommitPath(r.dir, plan, { planDir: join(alias, "docs/plans/p") }),
    ).toMatch(/steering/);
    expect(validateCommitPath(alias, plan, { planDir: r.plan })).toMatch(
      /steering/,
    );
    for (const planDir of [r.dir, alias, join(root, "elsewhere")]) {
      expect(
        () => validateCommitPath(r.dir, "src/a.txt", { planDir }),
        planDir,
      ).toThrow(expect.objectContaining({ kind: "INVALID" }));
    }
    expect(() => snapshotSteering(r.ctx, alias)).toThrow(
      expect.objectContaining({ kind: "INVALID" }),
    );
    // A hooks dir outside the checkout is skipped, not an error.
    expect(
      validateCommitPath(r.dir, "src/a.txt", {
        planDir: r.plan,
        hooksPath: join(root, "evilhooks"),
      }),
    ).toBeNull();
  });

  it("commitPaths refuses a multi-line message", () => {
    const r = mkRepo();
    const res = commit(r, ["src/a.txt"], computeFingerprint(r.ctx, r.head), {
      message: "chef: one\ntwo",
    });
    expect(res).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(res)).toMatch(/message:/);
  });

  it("commitPaths refuses a changed steering path", () => {
    const r = mkRepo();
    writeFileSync(join(r.dir, "CLAUDE.md"), "rewritten\n");
    const fp = computeFingerprint(r.ctx, r.head);
    expect(fp.changed).toHaveProperty(["CLAUDE.md"]);
    const res = commit(r, ["CLAUDE.md"], fp);
    expect(res).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(res)).toMatch(/steering path/);
    expect(branchHead(r)).toBe(r.head);
  });

  // ─── fingerprint ────────────────────────────────────────────────────

  it.each([
    ["content", (d: string) => writeFileSync(join(d, "src/a.txt"), "other\n")],
    ["delete", (d: string) => unlinkSync(join(d, "CLAUDE.md"))],
    ["mode", (d: string) => chmodSync(join(d, "run.sh"), 0o644)],
    ["untracked", (d: string) => writeFileSync(join(d, "src/u.txt"), "u\n")],
  ])("fingerprint detects a %s change", (_name, mutate) => {
    const r = mkRepo();
    const before = computeFingerprint(r.ctx, r.head);
    mutate(r.dir);
    expect(fingerprintEquals(before, computeFingerprint(r.ctx, r.head))).toBe(
      false,
    );
  });

  it("fingerprint ignores a change to an ignored file", () => {
    const r = mkRepo();
    const before = computeFingerprint(r.ctx, r.head);
    writeFileSync(join(r.dir, "ignored.log"), "changed\n");
    expect(fingerprintEquals(before, computeFingerprint(r.ctx, r.head))).toBe(
      true,
    );
  });

  it("fingerprint over its cap throws FINGERPRINT_OVER_CAP", () => {
    const r = mkRepo();
    expect(() =>
      computeFingerprint(r.ctx, r.head, { maxFiles: 2, maxBytes: 1e9 }),
    ).toThrow(expect.objectContaining({ kind: "FINGERPRINT_OVER_CAP" }));
    expect(() =>
      computeFingerprint(r.ctx, r.head, { maxFiles: 1e5, maxBytes: 5 }),
    ).toThrow(expect.objectContaining({ kind: "FINGERPRINT_OVER_CAP" }));
  });

  // ─── snapshots ──────────────────────────────────────────────────────

  function guardDiff(r: Repo, mutate: () => void): string[] {
    const before = snapshotRepoGuard(r.ctx);
    mutate();
    return diffSnapshots(before, snapshotRepoGuard(r.ctx));
  }

  function steeringDiff(r: Repo, mutate: () => void): string[] {
    const before = snapshotSteering(r.ctx, r.plan);
    mutate();
    return diffSnapshots(before, snapshotSteering(r.ctx, r.plan));
  }

  it("two repo-guard snapshots with different ctx.hooksDir diff to []", () => {
    const r = mkRepo();
    const otherHooks = join(root, "otherhooks");
    mkdirSync(otherHooks, { recursive: true, mode: 0o700 });
    expect(
      diffSnapshots(
        snapshotRepoGuard(r.ctx),
        snapshotRepoGuard({ ...r.ctx, hooksDir: otherHooks }),
      ),
    ).toEqual([]);
  });

  it("repo guard reports a .git/config change", () => {
    const r = mkRepo();
    expect(
      guardDiff(r, () =>
        appendFileSync(join(r.dir, ".git/config"), "[core]\n\tfoo = bar\n"),
      ),
    ).toEqual(["config"]);
  });

  it("repo guard reports a new hook", () => {
    const r = mkRepo();
    const hook = join(r.ctx.gitDir, "hooks", "post-merge");
    expect(guardDiff(r, () => writeExec(hook, "#!/bin/sh\n"))).toEqual([
      `hooks:${r.ctx.gitDir}/hooks/post-merge`,
    ]);
  });

  it("repo guard reports a .git/info/exclude change", () => {
    const r = mkRepo();
    mkdirSync(join(r.dir, ".git/info"), { recursive: true });
    expect(
      guardDiff(r, () =>
        appendFileSync(join(r.dir, ".git/info/exclude"), "src/hidden.txt\n"),
      ),
    ).toEqual(["<git>/info/exclude"]);
  });

  it("repo guard reports a planted commondir file", () => {
    const r = mkRepo();
    expect(
      guardDiff(r, () => writeFileSync(join(r.ctx.gitDir, "commondir"), ".\n")),
    ).toEqual(["<gitdir>/commondir"]);
  });

  it("steering reports root CLAUDE.md even when it is ignored", () => {
    const r = mkRepo();
    plain(r.dir, "rm", "-q", "--cached", "CLAUDE.md");
    appendFileSync(join(r.dir, ".gitignore"), "CLAUDE.md\n");
    expect(
      steeringDiff(r, () =>
        writeFileSync(join(r.dir, "CLAUDE.md"), "changed\n"),
      ),
    ).toEqual(["CLAUDE.md"]);
  });

  it("steering reports a .gitattributes change", () => {
    const r = mkRepo();
    expect(
      steeringDiff(r, () =>
        writeFileSync(join(r.dir, ".gitattributes"), "* text\n"),
      ),
    ).toEqual([".gitattributes"]);
  });

  it("steering reports a change in the (gitignored) plan dir", () => {
    const r = mkRepo();
    expect(
      steeringDiff(r, () => writeFileSync(join(r.plan, "new.md"), "n\n")),
    ).toEqual(["docs/plans/p/new.md"]);
  });

  it("steering ignores .claude/settings.local.json and .claude/worktrees", () => {
    const r = mkRepo();
    expect(
      steeringDiff(r, () => {
        mkdirSync(join(r.dir, ".claude/worktrees"), { recursive: true });
        writeFileSync(join(r.dir, ".claude/settings.local.json"), "{}");
        writeFileSync(join(r.dir, ".claude/worktrees/x"), "x");
      }),
    ).toEqual([]);
  });

  it("nested CLAUDE.md/AGENTS.md are not steering and stay committable", () => {
    const r = mkRepo();
    expect(Object.keys(snapshotSteering(r.ctx, r.plan))).not.toContain(
      "sub/AGENTS.md",
    );
    expect(
      steeringDiff(r, () => {
        writeFileSync(join(r.dir, "sub/CLAUDE.md"), "nested\n");
        appendFileSync(join(r.dir, "sub/AGENTS.md"), "more\n");
      }),
    ).toEqual([]);
    for (const p of ["sub/CLAUDE.md", "sub/AGENTS.md"]) {
      expect(validateCommitPath(r.dir, p, { planDir: r.plan })).toBeNull();
    }
  });

  it("steering skips node_modules and nested git repos but not other subdirs", () => {
    const r = mkRepo();
    const vendor = join(r.dir, "vendor");
    mkdirSync(vendor);
    plain(vendor, "init", "-q");
    mkdirSync(join(r.dir, "node_modules/pkg"), { recursive: true });
    expect(
      steeringDiff(r, () => {
        writeFileSync(
          join(r.dir, "node_modules/pkg/.gitattributes"),
          "* text\n",
        );
        writeFileSync(join(vendor, ".gitattributes"), "* text\n");
        writeFileSync(join(r.dir, "src/.gitattributes"), "* text\n");
      }),
    ).toEqual(["src/.gitattributes"]);
  });

  it("a planted .git or node_modules never hides the plan or hooks dir", () => {
    const r = mkRepo();
    mkdirSync(join(r.dir, "docs/.git"));
    mkdirSync(join(r.plan, ".git"));
    mkdirSync(join(r.dir, ".githooks/node_modules"), { recursive: true });
    expect(
      steeringDiff(r, () => {
        writeFileSync(join(r.plan, "new.md"), "n\n");
        writeFileSync(join(r.dir, ".githooks/node_modules/x"), "x\n");
      }),
    ).toEqual([".githooks/node_modules/x", "docs/plans/p/new.md"]);
  });

  it("steering over its cap throws STEERING_OVER_CAP", () => {
    const r = mkRepo();
    expect(() =>
      snapshotSteering(r.ctx, r.plan, {
        maxFiles: 1,
        maxBytes: 1e9,
        maxEntries: 1e6,
      }),
    ).toThrow(expect.objectContaining({ kind: "STEERING_OVER_CAP" }));
  });
});
