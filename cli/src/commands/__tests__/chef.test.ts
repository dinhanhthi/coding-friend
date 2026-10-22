import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import { spawn, spawnSync } from "child_process";
import { EventEmitter } from "events";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PassThrough } from "stream";

const fake = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
}));

vi.mock("../../lib/config.js", async (importActual) => {
  const actual = await importActual<typeof import("../../lib/config.js")>();
  return { ...actual, loadConfig: vi.fn(() => fake.config) };
});

import {
  chefInboxCommand,
  chefResumeCommand,
  chefSayCommand,
  chefShowCommand,
  chefStartCommand,
  chefStatusCommand,
  chefStopCommand,
} from "../chef.js";
import type { notifyUser } from "../../lib/notify.js";
import {
  chefDir,
  chefsDir,
  chefStatus,
  claimWake,
  consecutiveRejectedWakes,
  listChefs,
  listCommits,
  listDecisions,
  listResumes,
  markClaimFailed,
  nextSeq,
  readChef,
  recordAsk,
  recordDecision,
  recordPause,
  recordWakeRunner,
} from "../../lib/orchestrator/chef-store.js";
import { collectTriggers } from "../../lib/orchestrator/chef-triggers.js";
import { runWake, type WakeOptions } from "../../lib/orchestrator/chef-wake.js";
import type { DispatchInput } from "../../lib/orchestrator/dispatch.js";
import {
  createTask,
  MAX_TEXT,
  recordDone,
  recordResult,
  recordRunner,
} from "../../lib/orchestrator/store.js";

/**
 * `cf chef` commands on scratch git repos with a scratch store, fake
 * claude/codex binaries (shell scripts printing a version and help), a git
 * shim logging argv, and fake chef processes for wakes. Never runs a real
 * provider, `cf task run` or the real coding-friend checkout.
 */

let root: string;
let realGit = "";

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "cf-chef-cmd-")));
  realGit = spawnSync("sh", ["-c", "command -v git"]).stdout.toString().trim();
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

let caseSeq = 0;
let dir: string;
let repo: string;
let bin: string;
let gitlog: string;
let home: string;
let stdout: string[];
let logged: string[];

/** Plain git outside CF (fixtures and checks). */
function plain(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    realGit,
    [
      "-C",
      cwd,
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      ...args,
    ],
    {
      env: { PATH: "/usr/bin:/bin", HOME: home, GIT_CONFIG_NOSYSTEM: "1" },
    },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.toString("utf-8").trim();
}

function script(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

function fakeClaude(
  path: string,
  version = "2.1.308 (Claude Code)",
  help = "  --safe-mode  Disable CLAUDE.md\n  --add-dir <dirs...>  More dirs",
): void {
  script(
    path,
    `case "$1" in --version) echo '${version}';; --help) printf '%s\\n' '${help}';; esac`,
  );
}

function fakeCodex(path: string, version = "codex-cli 0.161.0"): void {
  script(path, `case "$1" in --version) echo '${version}';; esac`);
}

function newRepo(name: string): string {
  const r = join(dir, name);
  mkdirSync(join(r, "src"), { recursive: true });
  mkdirSync(join(r, "docs/plans/p"), { recursive: true });
  mkdirSync(join(r, "docs/plans/q"), { recursive: true });
  plain(r, "init", "-q", "-b", "main");
  writeFileSync(join(r, "src/a.txt"), "a\n");
  writeFileSync(join(r, "CLAUDE.md"), "root\n");
  writeFileSync(join(r, "docs/plans/p/README.md"), "plan p\n");
  writeFileSync(join(r, "docs/plans/q/README.md"), "plan q\n");
  writeFileSync(join(r, ".gitignore"), "ignored/\n");
  plain(r, "add", "-A");
  plain(r, "commit", "-q", "-m", "init");
  return r;
}

beforeEach(() => {
  dir = join(root, `case-${++caseSeq}`);
  home = join(dir, "home");
  bin = join(dir, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin);
  writeFileSync(
    join(home, ".gitconfig"),
    "[user]\n\tname = Scratch\n\temail = scratch@example.com\n",
  );
  gitlog = join(dir, "git.log");
  script(
    join(bin, "git"),
    `printf '%s\\n' "$*" >> '${gitlog}'\nexec '${realGit}' "$@"`,
  );
  fakeClaude(join(bin, "claude"));
  fakeCodex(join(bin, "codex"));
  repo = newRepo("repo");
  fake.config = {};
  vi.stubEnv("HOME", home);
  vi.stubEnv("PATH", `${bin}:/usr/bin:/bin`);
  vi.stubEnv("CF_ORCHESTRATOR_DIR", join(dir, "orch"));
  vi.spyOn(process, "cwd").mockReturnValue(repo);
  stdout = [];
  logged = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    logged.push(a.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

/** Run a --json command, return its envelopes (one per line). */
async function envelopes(fn: () => Promise<void>) {
  stdout = [];
  await fn();
  return stdout
    .join("")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

async function json(fn: () => Promise<void>) {
  const all = await envelopes(fn);
  expect(all).toHaveLength(1);
  return all[0];
}

const start = (
  opts: { provider?: string; commit?: boolean } = {},
  plan = "docs/plans/p",
) =>
  json(() =>
    chefStartCommand(plan, { provider: "claude", json: true, ...opts }),
  );

function byCheckoutFiles(): string[] {
  const d = join(chefsDir(), "by-checkout");
  return existsSync(d) ? readdirSync(d) : [];
}

function expectNothingCreated(): void {
  expect(listChefs()).toEqual([]);
  expect(byCheckoutFiles()).toEqual([]);
}

// ─── start refusals ─────────────────────────────────────────────────────

describe.skipIf(process.platform === "win32")("cf chef start refusals", () => {
  it.each([
    [
      "a modified tracked file",
      () => appendFileSync(join(repo, "src/a.txt"), "x\n"),
    ],
    [
      "an untracked file",
      () => writeFileSync(join(repo, "src/new.txt"), "n\n"),
    ],
  ])("refuses a dirty checkout (%s) and creates nothing", async (_, dirty) => {
    dirty();
    const r = await start();
    expect(r).toMatchObject({
      contractVersion: 1,
      ok: false,
      error: { code: "USAGE" },
    });
    expect(r.error.message).toMatch(/not clean/);
    expectNothingCreated();
  });

  it("refuses a store inside the checkout", async () => {
    vi.stubEnv("CF_ORCHESTRATOR_DIR", join(repo, "ignored", "orch"));
    const r = await start();
    expect(r.error).toMatchObject({ code: "USAGE" });
    expect(r.error.message).toMatch(/inside the checkout/);
    expect(existsSync(join(repo, "ignored", "orch"))).toBe(false);
  });

  it("refuses a missing plan dir, and one whose realpath is outside the checkout", async () => {
    expect((await start({}, "docs/plans/missing")).error.code).toBe(
      "NOT_FOUND",
    );
    const outside = join(dir, "outside-plan");
    mkdirSync(outside);
    const r = await start({}, outside);
    expect(r.error.code).toBe("USAGE");
    expect(r.error.message).toMatch(/must be inside the checkout/);
    expect((await start({}, ".")).error.message).toMatch(
      /must be inside the checkout/,
    );
    expectNothingCreated();
  });

  it("refuses a second chef for the same checkout, even for another plan; of two parallel starts only one wins", async () => {
    const first = await start();
    expect(first.ok).toBe(true);
    const second = await start({}, "docs/plans/q");
    expect(second.error.code).toBe("LEASE_HELD");
    expect(listChefs()).toHaveLength(1);

    const other = newRepo("repo2");
    vi.mocked(process.cwd).mockReturnValue(other);
    const both = await envelopes(async () => {
      await Promise.all([
        chefStartCommand("docs/plans/p", { provider: "claude", json: true }),
        chefStartCommand("docs/plans/q", { provider: "codex", json: true }),
      ]);
    });
    expect(both.filter((e) => e.ok)).toHaveLength(1);
    expect(both.filter((e) => !e.ok)[0].error.code).toBe("LEASE_HELD");
    expect(listChefs().filter((c) => c.checkout === other)).toHaveLength(1);
  });

  it.each([
    ["claude", "2.1.200 (Claude Code)", /2\.1\.248 or newer/],
    ["codex", "codex-cli 0.160.0", /0\.161\.0 or newer/],
  ])("refuses a %s that is too old", async (provider, version, msg) => {
    if (provider === "claude") fakeClaude(join(bin, "claude"), version);
    else fakeCodex(join(bin, "codex"), version);
    const r = await start({ provider });
    expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(r.error.message).toMatch(msg);
    expectNothingCreated();
  });

  it("refuses a claude whose --help lacks --safe-mode", async () => {
    fakeClaude(join(bin, "claude"), undefined, "  --add-dir <dirs...>");
    const r = await start();
    expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(r.error.message).toMatch(/--safe-mode/);
    expectNothingCreated();
  });

  it("refuses a missing provider binary", async () => {
    rmSync(join(bin, "codex"));
    const r = await start({ provider: "codex" });
    expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(r.error.message).toMatch(/codex not found/);
  });

  it("refuses a binary that resolves inside the checkout, and a relative PATH entry", async () => {
    const inside = join(repo, "ignored", "bin");
    mkdirSync(inside, { recursive: true });
    fakeClaude(join(inside, "claude"));
    vi.stubEnv("PATH", `${inside}:${bin}:/usr/bin:/bin`);
    let r = await start();
    expect(r.error.code).toBe("USAGE");
    expect(r.error.message).toMatch(/claude resolves inside the checkout/);

    vi.stubEnv("PATH", `relbin:${bin}:/usr/bin:/bin`);
    r = await start();
    expect(r.error.message).toMatch(/relative entry/);
    vi.stubEnv("PATH", `${bin}::/usr/bin`);
    expect((await start()).error.message).toMatch(/relative entry/);
    expectNothingCreated();
  });

  it("refuses a git inside the checkout before spawning anything from it", async () => {
    const inside = join(repo, "ignored", "bin");
    mkdirSync(inside, { recursive: true });
    const marker = join(dir, "git-ran");
    script(join(inside, "git"), `touch '${marker}'\nexec '${realGit}' "$@"`);
    vi.stubEnv("PATH", `${inside}:${bin}:/usr/bin:/bin`);
    const r = await start();
    expect(r.error.code).toBe("USAGE");
    expect(r.error.message).toMatch(/git resolves inside the checkout/);
    expect(existsSync(marker)).toBe(false);
    expectNothingCreated();
  });

  it("refuses outside a git checkout", async () => {
    const outside = join(dir, "no-repo");
    mkdirSync(outside);
    vi.mocked(process.cwd).mockReturnValue(outside);
    const r = await start({}, join(repo, "docs/plans/p"));
    expect(r.error.code).toBe("USAGE");
    expect(r.error.message).toMatch(/must run inside a git checkout/);
    expectNothingCreated();
  });

  it("refuses a detached HEAD", async () => {
    plain(repo, "checkout", "-q", "--detach");
    const r = await start();
    expect(r.error.message).toMatch(/detached/);
    expectNothingCreated();
  });

  it("refuses when git has no identity for the chef's commits", async () => {
    vi.stubEnv("HOME", join(dir, "empty-home"));
    mkdirSync(join(dir, "empty-home"));
    const r = await start();
    expect(r.error.code).toBe("USAGE");
    expect(r.error.message).toMatch(/identity missing.*user\.name/);
    expectNothingCreated();
  });
});

// ─── start ──────────────────────────────────────────────────────────────

describe.skipIf(process.platform === "win32")("cf chef start", () => {
  it("writes chef.json: chef.* snapshot, hooks (absolute realpath), headAtStart from refs/heads/<branch>, startSeq 0, a start event; git only through hardened plumbing", async () => {
    mkdirSync(join(repo, ".githooks"));
    script(join(repo, ".githooks/pre-commit"), "touch marker");
    plain(repo, "add", "-A");
    plain(repo, "commit", "-q", "-m", "hooks");
    plain(repo, "config", "core.hooksPath", ".githooks");
    fake.config = {
      chef: { maxTasksPerWake: 1, schedule: ["09:30", undefined] },
      task: { waitMinutes: 10 },
    };

    const r = await start();
    expect(r).toMatchObject({ contractVersion: 1, ok: true, error: null });
    const id = r.data.chefId;
    const chef = readChef(id);
    expect(chef).toMatchObject({
      provider: "claude",
      planDir: join(repo, "docs/plans/p"),
      checkout: repo,
      isGitRepo: true,
      gitDir: realpathSync(join(repo, ".git")),
      branch: "main",
      headAtStart: plain(repo, "rev-parse", "refs/heads/main"),
      startSeq: 0,
      commit: true,
      limits: {
        minWakeMinutes: 5,
        maxWakesPerDay: 48,
        maxTasksPerWake: 1,
        maxConcurrentTasks: 2,
        schedule: ["09:30"],
        notify: true,
      },
      taskPolicy: { onQuota: "wait-then-switch", waitMinutes: 10 },
      binaries: {
        git: join(bin, "git"),
        claude: join(bin, "claude"),
        codex: join(bin, "codex"),
      },
      hooks: {
        hooksPath: realpathSync(join(repo, ".githooks")),
        files: ["pre-commit"],
      },
    });
    expect(chef.baseline).toMatchObject({
      fingerprint: { changed: {}, skipped: [] },
    });
    expect(Object.keys(chef.baseline.snapshot as object).sort()).toEqual([
      "repo",
      "steering",
    ]);
    expect(nextSeq(id)).toBe(1);
    expect(existsSync(join(chefDir(id), "events", "start.json"))).toBe(true);
    expect(r.data.hint).toMatch(/cf supervisor install/);

    const calls = readFileSync(gitlog, "utf-8").trim().split("\n");
    expect(
      calls.some((c) => c.endsWith("rev-parse --verify refs/heads/main")),
    ).toBe(true);
    for (const line of calls) {
      expect(line).toMatch(
        /^--git-dir=\S+ --work-tree=\S+ -c core\.hooksPath=/,
      );
      const a = line.split(" ");
      let i = 0;
      while (i < a.length && (a[i].startsWith("--") || a[i] === "-c")) {
        i += a[i] === "-c" ? 2 : 1;
      }
      expect([
        "rev-parse",
        "symbolic-ref",
        "ls-files",
        "ls-tree",
        "cat-file",
        "config",
      ]).toContain(a[i]);
      expect(a.slice(i).join(" ")).not.toBe("rev-parse HEAD");
    }
  });

  it("from a subdirectory of the checkout, finds the checkout root", async () => {
    vi.mocked(process.cwd).mockReturnValue(join(repo, "src"));
    const r = await start({}, "../docs/plans/p");
    expect(r.ok).toBe(true);
    expect(readChef(r.data.chefId)).toMatchObject({
      checkout: repo,
      planDir: join(repo, "docs/plans/p"),
    });
  });

  it("records an executable symlinked hook, not a non-executable one", async () => {
    const target = join(dir, "hook.sh");
    script(target, "true");
    const hooks = join(repo, ".git", "hooks");
    mkdirSync(hooks, { recursive: true });
    symlinkSync(target, join(hooks, "pre-commit"));
    writeFileSync(join(hooks, "post-commit"), "#!/bin/sh\n", { mode: 0o644 });
    chmodSync(join(hooks, "post-commit"), 0o644);
    const r = await start();
    expect(r.ok).toBe(true);
    expect(readChef(r.data.chefId).hooks).toMatchObject({
      hooksPath: null,
      files: ["pre-commit"],
    });
  });

  it("--no-commit records commit: false; commit.gpgSign is a warning, not a refusal", async () => {
    plain(repo, "config", "commit.gpgSign", "true");
    const r = await start({ commit: false });
    expect(r.ok).toBe(true);
    expect(readChef(r.data.chefId).commit).toBe(false);
    expect(r.data.warnings.join("\n")).toMatch(/gpgSign.*--no-commit/);
  });

  it("stop frees the checkout: start works again", async () => {
    const first = await start();
    expect((await start()).error.code).toBe("LEASE_HELD");
    const stop = await json(() =>
      chefStopCommand(first.data.chefId, { json: true }),
    );
    expect(stop).toMatchObject({ ok: true, data: { stopped: true } });
    expect(byCheckoutFiles()).toEqual([]);
    expect(
      (await json(() => chefStopCommand(first.data.chefId, { json: true })))
        .error.code,
    ).toBe("ALREADY_FINISHED");
    const again = await start();
    expect(again.ok).toBe(true);
    expect(again.data.chefId).not.toBe(first.data.chefId);
  });
});

// ─── say / status / inbox / show ────────────────────────────────────────

describe.skipIf(process.platform === "win32")(
  "cf chef say, status, inbox, show",
  () => {
    it("say writes create-once messages/<seq>.json, capped; refuses empty text and a stopped chef", async () => {
      const id = (await start()).data.chefId;
      const a = await json(() =>
        chefSayCommand(id, "hello chef", { json: true }),
      );
      expect(a).toMatchObject({ ok: true, data: { seq: 1, truncated: false } });
      const b = await json(() =>
        chefSayCommand(id, "x".repeat(MAX_TEXT + 10), { json: true }),
      );
      expect(b.data).toMatchObject({ seq: 2, truncated: true });
      const m1 = JSON.parse(
        readFileSync(join(chefDir(id), "messages", "1.json"), "utf-8"),
      );
      expect(m1).toMatchObject({ seq: 1, text: "hello chef" });
      const m2 = JSON.parse(
        readFileSync(join(chefDir(id), "messages", "2.json"), "utf-8"),
      );
      expect(m2.text).toHaveLength(MAX_TEXT);
      expect(
        (await json(() => chefSayCommand(id, "  ", { json: true }))).error.code,
      ).toBe("USAGE");
      await json(() => chefStopCommand(id, { json: true }));
      expect(
        (await json(() => chefSayCommand(id, "late", { json: true }))).error
          .code,
      ).toBe("ALREADY_FINISHED");
    });

    it("status, inbox and show --json: envelope contractVersion 1", async () => {
      const id = (await start()).data.chefId;
      let all = await json(() => chefStatusCommand(undefined, { json: true }));
      expect(all).toMatchObject({ contractVersion: 1, ok: true, error: null });
      expect(all.data).toHaveLength(1);
      expect(all.data[0]).toMatchObject({
        id,
        state: "active",
        wakes: 0,
        inbox: 0,
        runningTasks: [],
      });

      recordAsk(id, { wake: 1, question: "Which database?" });
      recordPause(id, { reason: "chef: blocked" });
      const one = await json(() => chefStatusCommand(id, { json: true }));
      expect(one.data).toMatchObject({
        id,
        state: "paused",
        reason: "chef: blocked",
        inbox: 1,
      });

      const inbox = await json(() =>
        chefInboxCommand(undefined, { json: true }),
      );
      expect(inbox).toMatchObject({ contractVersion: 1, ok: true });
      expect(inbox.data).toEqual([
        expect.objectContaining({
          chefId: id,
          kind: "ask",
          text: "Which database?",
        }),
        expect.objectContaining({
          chefId: id,
          kind: "paused",
          text: "chef: blocked",
        }),
      ]);
      // A user message counts as having seen the questions (as summary.json).
      await json(() => chefSayCommand(id, "Postgres", { json: true }));
      const after = await json(() => chefInboxCommand(id, { json: true }));
      expect(after.data.map((i: { kind: string }) => i.kind)).toEqual([
        "paused",
      ]);
      const summary = JSON.parse(
        readFileSync(join(chefsDir(), "summary.json"), "utf-8"),
      );
      expect(summary).toMatchObject({ inbox: 0, paused: 1 });

      const show = await json(() => chefShowCommand(id, { json: true }));
      expect(show).toMatchObject({ contractVersion: 1, ok: true });
      expect(show.data.chef.id).toBe(id);
      expect(show.data.chef.baseline).toBeUndefined();
      expect(show.data.status.state).toBe("paused");
      expect(show.data.asks).toHaveLength(1);
      expect(show.data.messages).toHaveLength(1);

      expect(
        (await json(() => chefShowCommand("zzzzzzzz", { json: true }))).error
          .code,
      ).toBe("NOT_FOUND");
    });

    it("sanitizes chef and worker text in human output", async () => {
      const id = (await start()).data.chefId;
      const evil = "red\x1b[31mtext\x1b]0;title\x07 ‮done\x9b";
      recordAsk(id, { wake: 1, question: evil });
      recordDecision(id, {
        wake: 1,
        index: 0,
        kind: "note",
        status: "executed",
        action: { type: "note", text: evil },
      });
      recordPause(id, { reason: `chef: ${evil}` });
      logged = [];
      await chefInboxCommand(id, {});
      await chefShowCommand(id, {});
      await chefStatusCommand(undefined, {});
      const text = logged.join("\n");
      expect(text).toContain("redtext");
      expect(text).not.toMatch(/[\x1b\x07\x9b‮]/);
    });
  },
);

// ─── wakes (resume / stop) ──────────────────────────────────────────────

type FakeChild = EventEmitter & {
  pid: number;
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
};

function act(a: Record<string, unknown>) {
  return {
    type: "note",
    provider: null,
    role: null,
    prompt: null,
    qid: null,
    text: null,
    paths: null,
    message: null,
    ...a,
  };
}
const out = (...actions: unknown[]) => ({ summary: "s", actions });
const dispatchAct = (role: string) =>
  act({ type: "dispatch", provider: "claude", role, prompt: "Do the step." });
const commitAct = (paths: string[]) =>
  act({ type: "commit", paths, message: "feat: chef commit" });

function finishTask(taskId: string): void {
  recordResult(taskId, { exitCode: 0, outcome: "succeeded" });
  recordDone(taskId, { outcome: "succeeded", summary: "done" });
}

/** Wakes of a started chef with a fake chef process, dispatch and notify. */
function wakes(id: string) {
  const chef = readChef(id);
  const queue: unknown[] = [];
  const dispatched: string[] = [];
  let n = 0;
  let pid = 91000;
  const fakeSpawn = () => {
    const output = queue.shift();
    const child = new EventEmitter() as FakeChild;
    child.pid = pid++;
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin.resume();
    setTimeout(() => {
      if (output !== undefined) {
        for (const line of [
          { type: "system", subtype: "init", session_id: chef.sessionUuid },
          {
            type: "result",
            subtype: "success",
            is_error: false,
            result: "done",
            session_id: chef.sessionUuid,
            structured_output: output,
          },
        ]) {
          child.stdout.write(JSON.stringify(line) + "\n");
        }
      }
      child.stdout.end();
      child.stderr.end();
      child.emit("exit", output === undefined ? 1 : 0);
    }, 5);
    return child;
  };
  const dispatchTask = (input: DispatchInput) => {
    const t = createTask({
      provider: input.provider,
      prompt: input.prompt,
      readOnly: input.readOnly,
      checkout: input.checkout,
    });
    recordRunner(t.id, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    dispatched.push(t.id);
    return { taskId: t.id, pid: 0 };
  };
  const options = (): WakeOptions => ({
    spawn: fakeSpawn as unknown as typeof spawn,
    notify: (async () => ({ sent: true })) as unknown as typeof notifyUser,
    readEnabled: () => true,
    killGroup: () => {},
    exec: { dispatchTask },
    env: {},
    signal: new AbortController().signal,
  });
  return {
    dispatched,
    /** One tick's worth: record triggers, run the next wake with `output`. */
    async wake(output?: unknown) {
      collectTriggers({ chefId: id });
      if (output !== undefined) queue.push(output);
      return runWake(id, ++n, options());
    },
  };
}

const resume = (id: string) =>
  json(() => chefResumeCommand(id, { json: true }));

function userCommit(file: string, text: string): string {
  appendFileSync(join(repo, file), text);
  plain(repo, "add", file);
  plain(repo, "commit", "-q", "-m", `user: ${file}`);
  return plain(repo, "rev-parse", "refs/heads/main");
}

describe.skipIf(process.platform === "win32")(
  "cf chef resume / stop with wakes",
  { timeout: 60_000 },
  () => {
    it("resume lifts a pause; stop blocks the next wake; a stopped chef cannot resume", async () => {
      const id = (await start()).data.chefId;
      const w = wakes(id);
      recordPause(id, { reason: "user wants a break" });
      expect(chefStatus(id).state).toBe("paused");
      expect((await w.wake(out())).outcome).toBe("blocked");
      expect((await resume(id)).ok).toBe(true);
      expect(chefStatus(id).state).toBe("active");
      expect((await w.wake(out())).outcome).toBe("ok");

      await json(() => chefStopCommand(id, { json: true }));
      const r = await w.wake(out());
      expect(r).toMatchObject({ outcome: "blocked", reason: "stopped" });
      expect((await resume(id)).error.code).toBe("ALREADY_FINISHED");
    });

    it("resume after the user committed: new baseline with the new branch sha, the streak resets, the next wake does not pause", async () => {
      const id = (await start()).data.chefId;
      const w = wakes(id);
      // A rejected commit (no writer yet) starts a rejection streak.
      const r1 = await w.wake(out(commitAct(["src/a.txt"])));
      expect(r1.actions?.[0].status).toBe("rejected");
      expect(consecutiveRejectedWakes(id)).toBe(1);

      const userSha = userCommit("src/a.txt", "user\n");
      expect((await w.wake(out())).outcome).toBe("paused");
      expect(chefStatus(id).state).toBe("paused");

      const r = await resume(id);
      expect(r).toMatchObject({
        ok: true,
        data: { knownHead: userSha, changedPaths: 0, afterWake: 2 },
      });
      const [res] = listResumes(id);
      const file = JSON.parse(
        readFileSync(join(chefDir(id), "resumes", `${res.seq}.json`), "utf-8"),
      );
      expect(file).toMatchObject({
        knownHead: userSha,
        fingerprint: { head: userSha, changed: {}, skipped: [] },
      });
      expect(Object.keys(file.snapshot).sort()).toEqual(["repo", "steering"]);
      expect(consecutiveRejectedWakes(id)).toBe(0);

      await json(() => chefSayCommand(id, "carry on", { json: true }));
      expect((await w.wake(out())).outcome).toBe("ok");
      expect(chefStatus(id).state).toBe("active");
    });

    it("resume refuses an active chef (not paused), and writes no resume", async () => {
      const id = (await start()).data.chefId;
      expect(chefStatus(id).state).toBe("active");
      const r = await resume(id);
      expect(r.error.code).toBe("USAGE");
      expect(r.error.message).toMatch(/is not paused: nothing to resume/);
      expect(listResumes(id)).toEqual([]);
      expect(existsSync(join(chefDir(id), "resumes"))).toBe(false);
    });

    it("resume refuses when HEAD is on another branch than at start, and writes no resume", async () => {
      const id = (await start()).data.chefId;
      recordPause(id, { reason: "test" });
      plain(repo, "checkout", "-q", "-b", "other");
      const r = await resume(id);
      expect(r.error.code).toBe("USAGE");
      expect(r.error.message).toMatch(/not on the chef's branch main/);
      expect(listResumes(id)).toEqual([]);
      expect(existsSync(join(chefDir(id), "resumes"))).toBe(false);
    });

    it("user commit → resume → writer → check → the chef's commit lands on the user's sha", async () => {
      const id = (await start()).data.chefId;
      const w = wakes(id);
      const userSha = userCommit("src/a.txt", "user\n");
      recordPause(id, { reason: "test" });
      expect((await resume(id)).data.knownHead).toBe(userSha);

      await w.wake(out(dispatchAct("writer")));
      writeFileSync(join(repo, "src/b.txt"), "chef work\n");
      finishTask(w.dispatched[0]);
      await w.wake(out(dispatchAct("check")));
      finishTask(w.dispatched[1]);
      const r = await w.wake(out(commitAct(["src/b.txt"])));
      expect(r.actions?.[0]).toMatchObject({ status: "executed" });

      const head = plain(repo, "rev-parse", "refs/heads/main");
      expect(head).not.toBe(userSha);
      expect(plain(repo, "rev-parse", `${head}^`)).toBe(userSha);
      expect(plain(repo, "show", "--name-only", "--format=", head)).toBe(
        "src/b.txt",
      );
      expect(listCommits(id)[0]).toMatchObject({
        outcome: "committed",
        parent: userSha,
        head,
      });
    });

    it("resume with a dirty checkout: the baseline holds the current fingerprint; a commit right after is still refused by the gate until a new writer and a passing check", async () => {
      const id = (await start()).data.chefId;
      const w = wakes(id);
      appendFileSync(join(repo, "src/a.txt"), "user wip\n");
      recordPause(id, { reason: "test" });
      const r = await resume(id);
      expect(r.data.changedPaths).toBe(1);
      const fp = listResumes(id)[0].fingerprint as {
        changed: Record<string, unknown>;
      };
      expect(Object.keys(fp.changed)).toEqual(["src/a.txt"]);

      const c1 = await w.wake(out(commitAct(["src/a.txt"])));
      expect(c1.outcome).toBe("ok"); // the new baseline: no pause
      expect(c1.actions?.[0].status).toBe("rejected");
      expect(listCommits(id)).toEqual([]);

      await w.wake(out(dispatchAct("writer")));
      appendFileSync(join(repo, "src/a.txt"), "writer\n");
      finishTask(w.dispatched[0]);
      await w.wake(out(dispatchAct("check")));
      finishTask(w.dispatched[1]);
      const c2 = await w.wake(out(commitAct(["src/a.txt"])));
      expect(c2.actions?.[0].status).toBe("executed");
      expect(listCommits(id)[0].outcome).toBe("committed");
    });

    it("resume refuses while a wake runner is alive (ps check), writes no resume; a dead or failed wake does not block", async () => {
      const id = (await start()).data.chefId;
      recordPause(id, { reason: "test" });
      claimWake(id, 1);
      const child = spawn(
        process.execPath,
        ["-e", "setTimeout(() => {}, 60000)", "chef", "_wake", id, "1"],
        { stdio: "ignore" },
      );
      try {
        recordWakeRunner(id, 1, {
          pid: child.pid!,
          startedAt: new Date().toISOString(),
        });
        const r = await resume(id);
        expect(r.error.code).toBe("LEASE_HELD");
        expect(listResumes(id)).toEqual([]);
      } finally {
        const exited = new Promise((res) => child.once("exit", res));
        child.kill("SIGKILL");
        await exited;
      }
      expect((await resume(id)).ok).toBe(true);

      recordPause(id, { reason: "test" });
      claimWake(id, 2); // claimed a moment ago, runner not started yet
      expect((await resume(id)).error.code).toBe("LEASE_HELD");
      markClaimFailed(id, 2, "never started");
      expect((await resume(id)).ok).toBe(true);
      expect(listResumes(id)).toHaveLength(2);
    });

    it("gate vs resume: a writer dispatched before the resume never satisfies the gate, even with a passing check after it", async () => {
      const id = (await start()).data.chefId;
      const w = wakes(id);
      await w.wake(out(dispatchAct("writer")));
      const writer = w.dispatched[0];
      writeFileSync(join(repo, "src/feature.txt"), "writer\n");

      // Paused while the writer runs; the user edits; resume; the writer ends.
      recordPause(id, { reason: "user" });
      appendFileSync(join(repo, "src/a.txt"), "user\n");
      expect((await resume(id)).ok).toBe(true);
      finishTask(writer);

      await w.wake(out(dispatchAct("check")));
      finishTask(w.dispatched[1]);
      const paths = ["src/a.txt", "src/feature.txt"];
      const refused = await w.wake(out(commitAct(paths)));
      expect(refused.actions?.[0]).toMatchObject({ status: "rejected" });
      expect(refused.actions?.[0].reason).toMatch(
        /dispatched before the latest baseline/,
      );
      expect(listCommits(id)).toEqual([]);
      expect(
        listDecisions(id).some(
          (d) => d.kind === "commit" && d.status === "rejected",
        ),
      ).toBe(true);

      await w.wake(out(dispatchAct("writer")));
      finishTask(w.dispatched[2]);
      await w.wake(out(dispatchAct("check")));
      finishTask(w.dispatched[3]);
      const ok = await w.wake(out(commitAct(paths)));
      expect(ok.actions?.[0]).toMatchObject({ status: "executed" });
    });
  },
);
