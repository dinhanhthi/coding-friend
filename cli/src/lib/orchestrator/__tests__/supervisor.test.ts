import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync, type spawn } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { acquireLease } from "../lease.js";
import { digest } from "../runner.js";
import {
  claimAttempt,
  createTask,
  listAttempts,
  listTasks,
  newId,
  readTask,
  recordAttemptRunner,
  recordDispatch,
  recordPause,
  SPAWN_GRACE_MS,
} from "../store.js";
import {
  isRunnerCommand,
  spawnRunner,
  tickChefs,
  tickOnce,
} from "../supervisor.js";
import {
  chefDir,
  chefStatus,
  claimWake,
  createChef,
  listWakes,
  recordEvent,
  recordMessage,
  recordWakeResult,
  recordWakeRunner,
} from "../chef-store.js";
import { pendingEvents } from "../chef-triggers.js";

const NOW = Math.floor(Date.now() / 1000);

let root: string;
let orch: string;
let checkout: string;
let fakeSpawn: ReturnType<typeof vi.fn>;

const leases = () =>
  existsSync(join(orch, "leases")) ? readdirSync(join(orch, "leases")) : [];
const taskJson = (id: string) => join(orch, "tasks", id, "task.json");
const tick = (ps: (pid: number) => string | null = () => null) =>
  tickOnce({ now: NOW, spawn: fakeSpawn as unknown as typeof spawn, ps });

/** A pid that no longer exists: a child that already exited and was reaped. */
const deadPid = () =>
  Number(
    execFileSync(process.execPath, ["-e", "console.log(process.pid)"], {
      encoding: "utf-8",
    }).trim(),
  );

/** A C2a writer task: dispatched, attempt 1 paused on quota, reset passed. */
function pausedTask(runnerPid: number): { id: string; taskDigest: string } {
  const { id } = createTask({
    provider: "claude",
    prompt: "ORIGINAL-PROMPT",
    readOnly: false,
    checkout,
  });
  acquireLease(checkout, id);
  const taskDigest = digest(readFileSync(taskJson(id)));
  recordDispatch(id, {
    taskDigest,
    isGitRepo: false,
    policy: {
      onQuota: "wait",
      waitMinutes: 30,
      fallback: ["claude", "codex"],
      noFallback: false,
    },
  });
  claimAttempt(id, { n: 1, provider: "claude", kind: "fresh" });
  recordAttemptRunner(id, 1, {
    pid: runnerPid,
    startedAt: new Date().toISOString(),
  });
  recordPause(id, 1, {
    provider: "claude",
    resetsAt: NOW - 100,
    source: "test",
  });
  return { id, taskDigest };
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "cf-supervisor-")));
  orch = join(root, "orch");
  checkout = join(root, "checkout");
  mkdirSync(checkout);
  vi.stubEnv("CF_ORCHESTRATOR_DIR", orch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fakeSpawn = vi.fn(() => ({ pid: 4242, once() {}, unref() {} }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("tickOnce", () => {
  it("adopts an orphaned due task once: one claim, one spawn; a second tick spawns nothing", () => {
    const { id, taskDigest } = pausedTask(deadPid());

    expect(tick()).toEqual({ adopted: [id], failed: [], skipped: [] });
    expect(fakeSpawn).toHaveBeenCalledTimes(1);
    const [, args, opts] = fakeSpawn.mock.calls[0];
    expect(args.slice(-3)).toEqual(["task", "_run", id]);
    expect(opts.cwd).toBe(checkout);
    expect(opts.env.CF_TASK_DIGEST).toBe(taskDigest);
    expect(listAttempts(id).map((e) => e.attempt)).toMatchObject([
      { n: 1 },
      { n: 2, provider: "claude", kind: "fresh", bundle: true },
    ]);

    // Attempt 2 is claimed (its runner not yet recorded): nothing to adopt.
    expect(tick()).toEqual({ adopted: [], failed: [], skipped: [] });
    expect(fakeSpawn).toHaveBeenCalledTimes(1);
    expect(listAttempts(id)).toHaveLength(2);
  });

  it("writes the heartbeat with mode 0600", () => {
    tick();
    const hb = join(orch, "supervisor", "heartbeat.json");
    expect(statSync(hb).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(hb, "utf-8")).at).toBe(
      new Date(NOW * 1000).toISOString(),
    );
  });

  it("leaves a task whose runner is still alive", () => {
    const { id } = pausedTask(process.pid);
    const summary = tick(() => `node cf task _run ${id}`);
    expect(summary).toEqual({ adopted: [], failed: [], skipped: [id] });
    expect(fakeSpawn).not.toHaveBeenCalled();
    expect(listAttempts(id)).toHaveLength(1);
  });

  it("fails a task whose task.json changed after dispatch: no spawn, lease released", () => {
    const { id } = pausedTask(deadPid());
    const file = taskJson(id);
    writeFileSync(
      file,
      readFileSync(file, "utf-8").replace("ORIGINAL-PROMPT", "evil prompt"),
    );
    expect(leases()).toHaveLength(1);

    expect(tick()).toEqual({ adopted: [], failed: [id], skipped: [] });
    expect(fakeSpawn).not.toHaveBeenCalled();
    const view = readTask(id);
    expect(view.state).toBe("failed");
    expect(view.result?.error).toBe("task.json changed after dispatch");
    expect(leases()).toHaveLength(0);
    expect(listAttempts(id)).toHaveLength(1);
  });
});

describe("spawnRunner", () => {
  it("logs to runs/<id>/runner.log (0600), never through a symlink planted in the task dir", () => {
    const { id, taskDigest } = pausedTask(deadPid());
    const victim = join(root, "victim");
    writeFileSync(victim, "untouched\n");
    const planted = join(orch, "tasks", id, "runner.log");
    symlinkSync(victim, planted);

    spawnRunner(id, checkout, taskDigest, fakeSpawn as unknown as typeof spawn);

    expect(fakeSpawn).toHaveBeenCalledTimes(1);
    const log = join(orch, "runs", id, "runner.log");
    expect(lstatSync(log).isFile()).toBe(true);
    expect(statSync(log).mode & 0o777).toBe(0o600);
    expect(lstatSync(planted).isSymbolicLink()).toBe(true);
    expect(readFileSync(victim, "utf-8")).toBe("untouched\n");
  });

  it("refuses a symlink at runs/<id>/runner.log", () => {
    const { id, taskDigest } = pausedTask(deadPid());
    const victim = join(root, "victim");
    writeFileSync(victim, "untouched\n");
    symlinkSync(victim, join(orch, "runs", id, "runner.log"));

    expect(() =>
      spawnRunner(
        id,
        checkout,
        taskDigest,
        fakeSpawn as unknown as typeof spawn,
      ),
    ).toThrow();
    expect(fakeSpawn).not.toHaveBeenCalled();
    expect(readFileSync(victim, "utf-8")).toBe("untouched\n");
  });
});

// A regression here hangs the test worker (a blocked sync read) rather than failing.
describe.skipIf(process.platform === "win32")("worker-planted FIFOs", () => {
  it("listTasks and tickOnce read a FIFO in the task dir as missing, without blocking", () => {
    const { id } = pausedTask(deadPid());
    for (const f of ["result.json", "done.json"]) {
      execFileSync("mkfifo", [join(orch, "tasks", id, f)]);
    }

    const view = listTasks().find((t) => t.id === id);
    expect(view?.state).toBe("paused");
    expect(view?.result).toBeUndefined();
    expect(view?.done).toBeUndefined();
    expect(tick()).toEqual({ adopted: [id], failed: [], skipped: [] });
  });

  it("a FIFO task.json hides the task instead of hanging", () => {
    const { id } = pausedTask(deadPid());
    const file = taskJson(id);
    rmSync(file);
    execFileSync("mkfifo", [file]);

    expect(listTasks().map((t) => t.id)).not.toContain(id);
    expect(tick()).toEqual({ adopted: [], failed: [], skipped: [] });
  });
});

describe("isRunnerCommand", () => {
  it("matches `task _run <id>` with the id as a whole word only", () => {
    expect(isRunnerCommand("node /x/cf task _run abcd1234", "abcd1234")).toBe(
      true,
    );
    expect(
      isRunnerCommand("node /x/cf task _run abcd1234 --flag", "abcd1234"),
    ).toBe(true);
    expect(isRunnerCommand("node /x/cf task _run abcd12345", "abcd1234")).toBe(
      false,
    );
    expect(isRunnerCommand("node /x/cf task _run xabcd1234", "abcd1234")).toBe(
      false,
    );
    expect(isRunnerCommand(null, "abcd1234")).toBe(false);
  });
});

describe("tickChefs", () => {
  let home: string;

  const setGlobalEnabled = (enabled: boolean) =>
    writeFileSync(
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({ chef: { enabled } }),
    );

  function newChef(minWakeMinutes = 0, maxWakesPerDay = 48): string {
    const id = newId();
    createChef({
      id,
      provider: "claude",
      planDir: join(checkout, "docs/plans/x"),
      checkout,
      isGitRepo: true,
      gitDir: join(checkout, ".git"),
      branch: "main",
      headAtStart: "a".repeat(40),
      sessionUuid: "123e4567-e89b-12d3-a456-426614174000",
      limits: {
        minWakeMinutes,
        maxWakesPerDay,
        maxTasksPerWake: 3,
        maxConcurrentTasks: 2,
        schedule: [],
        notify: false,
      },
      taskPolicy: {
        onQuota: "wait-then-switch",
        waitMinutes: 30,
        fallback: [],
        noFallback: false,
      },
      binaries: { git: "/usr/bin/git", claude: "/x/claude" },
      commit: true,
      hooks: { hooksPath: null, files: [] },
      configDigest: "d",
      baseline: { fingerprint: { head: "a".repeat(40) }, snapshot: {} },
    });
    recordEvent(id, "start");
    return id;
  }

  /** Spawn calls that started a wake of chef `id`, as [n]. */
  const wakesSpawned = (id: string) =>
    fakeSpawn.mock.calls
      .map(([, args]) => args as string[])
      .filter((args) => args.includes("_wake") && args.includes(id))
      .map((args) => args.at(-1));

  beforeEach(() => {
    home = join(root, "home");
    mkdirSync(join(home, ".coding-friend"), { recursive: true });
    vi.stubEnv("HOME", home);
    setGlobalEnabled(true);
  });

  it("spawns exactly one wake for a chef with an event; none while that wake is alive; TickSummary keeps its shape", () => {
    const id = newChef();
    expect(tick()).toEqual({ adopted: [], failed: [], skipped: [] });
    expect(fakeSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = fakeSpawn.mock.calls[0];
    // Only the CF wake runner: never git, never a provider.
    expect(cmd).toBe(process.execPath);
    expect(args.slice(-4)).toEqual(["chef", "_wake", id, "1"]);
    expect(opts).toMatchObject({
      detached: true,
      cwd: join(chefDir(id), "private"),
      env: { CF_CHEF_CLAIMED: "1", CF_ORCHESTRATOR_DIR: orch },
    });
    expect(listWakes(id).map((w) => w.n)).toEqual([1]);

    // Wake 1 runs; a new event arrives: no second wake.
    recordWakeRunner(id, 1, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    recordMessage(id, "hello");
    tick((pid) => (pid === process.pid ? `node cf chef _wake ${id} 1` : null));
    tick((pid) => (pid === process.pid ? `node cf chef _wake ${id} 1` : null));
    expect(wakesSpawned(id)).toEqual(["1"]);
  });

  it("global chef.enabled=false: no wake, whatever the local config says (and the reverse)", () => {
    const local = join(root, "local");
    mkdirSync(join(local, ".coding-friend"), { recursive: true });
    const setLocal = (enabled: boolean) =>
      writeFileSync(
        join(local, ".coding-friend", "config.json"),
        JSON.stringify({ chef: { enabled } }),
      );
    vi.spyOn(process, "cwd").mockReturnValue(local);
    const id = newChef();

    setGlobalEnabled(false);
    setLocal(true);
    expect(
      tickChefs({
        now: NOW,
        spawn: fakeSpawn as unknown as typeof spawn,
        ps: () => null,
      }),
    ).toEqual({
      woken: [],
      paused: [],
      skipped: [],
    });
    tick();
    expect(fakeSpawn).not.toHaveBeenCalled();
    expect(listWakes(id)).toEqual([]);

    setGlobalEnabled(true);
    setLocal(false);
    tick();
    expect(wakesSpawned(id)).toEqual(["1"]);
  });

  it("daily wake cap: the tick pauses the chef and refreshes summary.json for the statusline", () => {
    const id = newChef(0, 1);
    claimWake(id, 1);
    recordWakeResult(id, 1, { outcome: "ok", consumed: [], rejected: 0 });

    expect(
      tickChefs({
        now: Math.floor(Date.now() / 1000) + 60, // after wake 1 finished (real clock)
        spawn: fakeSpawn as unknown as typeof spawn,
        ps: () => null,
      }).paused,
    ).toEqual([id]);
    expect(fakeSpawn).not.toHaveBeenCalled();
    expect(chefStatus(id).state).toBe("paused");
    const summary = JSON.parse(
      readFileSync(join(orch, "chefs", "summary.json"), "utf-8"),
    );
    expect(summary).toMatchObject({ paused: 1, inbox: 0 });
  });

  it.each([
    ["a claim whose runner never started", "never"],
    ["a runner that died without result.json", "died"],
  ] as const)(
    "%s: the tick marks it failed (events stay pending, min interval counts from it), then wakes n+1",
    (_name, kind) => {
      const id = newChef(5);
      claimWake(id, 1);
      if (kind === "died") {
        recordWakeRunner(id, 1, {
          pid: deadPid(),
          startedAt: new Date().toISOString(),
        });
      } else {
        const file = join(chefDir(id), "wakes", "1", "claim.json");
        const claim = JSON.parse(readFileSync(file, "utf-8"));
        claim.createdAt = new Date(
          Date.now() - SPAWN_GRACE_MS - 1000,
        ).toISOString();
        writeFileSync(file, JSON.stringify(claim));
      }

      tick();
      const [w1] = listWakes(id);
      expect(w1.result?.outcome).toBe("failed");
      expect(w1.result?.consumed).toBeUndefined();
      expect(pendingEvents(id).map((e) => e.key)).toEqual(["start"]);
      expect(fakeSpawn).not.toHaveBeenCalled(); // within minWakeMinutes of the failure

      tickOnce({
        now: NOW + 6 * 60,
        spawn: fakeSpawn as unknown as typeof spawn,
        ps: () => null,
      });
      expect(wakesSpawned(id)).toEqual(["2"]);
    },
  );
});
