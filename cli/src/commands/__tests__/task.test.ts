import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn, spawnSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

const fake = vi.hoisted(() => ({ pid: 0, checkout: "" }));

vi.mock("child_process", async (importActual) => ({
  ...(await importActual<typeof import("child_process")>()),
  spawn: vi.fn(() => ({
    pid: fake.pid,
    on: () => {},
    once: () => {},
    unref: () => {},
  })),
}));
vi.mock("../../lib/exec.js", async (importActual) => ({
  ...(await importActual<typeof import("../../lib/exec.js")>()),
  commandExists: () => true,
}));
vi.mock("../../lib/project-root.js", () => ({
  resolveCheckoutRoot: () => fake.checkout,
}));

import { sanitize, taskCancelCommand, taskRunCommand } from "../task.js";
import { acquireLease } from "../../lib/orchestrator/lease.js";
import { digest, runTask as runRunner } from "../../lib/orchestrator/runner.js";
import {
  createTask,
  readTask,
  recordCancel,
  recordDone,
  recordRunner,
} from "../../lib/orchestrator/store.js";

let root: string;
let stdout: string[];

async function runTask(opts: { readOnly?: boolean } = {}) {
  stdout = [];
  await taskRunCommand("do it", { provider: "claude", json: true, ...opts });
  return JSON.parse(stdout.join(""));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-task-cmd-"));
  vi.stubEnv("CF_ORCHESTRATOR_DIR", join(root, "orch"));
  fake.checkout = join(root, "checkout");
  fake.pid = process.pid; // a live runner pid
  stdout = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe("cf task run writer lease", () => {
  it("refuses a second writer on the same checkout and leaves no task dir", async () => {
    const first = await runTask();
    expect(first).toMatchObject({ ok: true });

    const second = await runTask();
    expect(second).toMatchObject({
      ok: false,
      error: { code: "LEASE_HELD" },
    });
    expect(second.error.message).toContain(first.data.taskId);
    expect(readdirSync(join(root, "orch", "tasks"))).toEqual([
      first.data.taskId,
    ]);
  });

  it("--read-only does not need the lease", async () => {
    expect(await runTask()).toMatchObject({ ok: true });
    expect(await runTask({ readOnly: true })).toMatchObject({ ok: true });
  });

  it("keeps the lease of a cancelled holder while its runner is alive", async () => {
    const first = await runTask();
    recordCancel(first.data.taskId);

    expect(await runTask()).toMatchObject({
      ok: false,
      error: { code: "LEASE_HELD" },
    });
  });

  it("keeps the lease of a done holder while its runner is alive", async () => {
    const first = await runTask();
    recordDone(first.data.taskId, { outcome: "succeeded", summary: "x" });

    expect(await runTask()).toMatchObject({
      ok: false,
      error: { code: "LEASE_HELD" },
    });
  });

  it("refuses a writer whose checkout contains the orchestrator dir", async () => {
    fake.checkout = join(realpathSync(root), "checkout");
    vi.stubEnv("CF_ORCHESTRATOR_DIR", join(fake.checkout, "orch"));

    expect(await runTask()).toMatchObject({
      ok: false,
      error: { code: "USAGE" },
    });
    expect(existsSync(join(fake.checkout, "orch", "tasks"))).toBe(false);
  });

  it("refuses a not-yet-created orchestrator dir behind a symlink into the checkout", async () => {
    fake.checkout = join(realpathSync(root), "checkout");
    mkdirSync(fake.checkout);
    symlinkSync(fake.checkout, join(root, "link"));
    vi.stubEnv("CF_ORCHESTRATOR_DIR", join(root, "link", "orch"));

    expect(await runTask()).toMatchObject({
      ok: false,
      error: { code: "USAGE" },
    });
    expect(readdirSync(fake.checkout)).toEqual([]);
  });

  it("steals the lease from a holder whose runner pid is dead", async () => {
    fake.pid = spawnSync(process.execPath, ["-e", ""]).pid!;
    expect(await runTask()).toMatchObject({ ok: true });

    fake.pid = process.pid;
    expect(await runTask()).toMatchObject({ ok: true });
  });
});

describe("task runner tamper gate", () => {
  const rightDigest = (file: string) => digest(readFileSync(file));
  it.each([
    // checkout = the real cwd, so only the digest is wrong.
    ["a wrong digest", () => realpathSync(process.cwd()), () => "0".repeat(64)],
    ["the right digest but another cwd", () => fake.checkout, rightDigest],
  ])("refuses to spawn the worker on %s", async (_, checkoutOf, digestOf) => {
    const checkout = checkoutOf();
    const { id } = createTask({
      provider: "claude",
      prompt: "tamper",
      readOnly: false,
      checkout,
    });
    acquireLease(checkout, id);
    const file = join(root, "orch", "tasks", id, "task.json");
    vi.stubEnv("CF_TASK_DIGEST", digestOf(file));
    vi.stubEnv("CF_TASK_CHECKOUT", checkout);
    vi.mocked(spawn).mockClear();

    await runRunner(id);

    expect(readTask(id).result?.outcome).toBe("failed");
    expect(spawn).not.toHaveBeenCalled();
    expect(readdirSync(join(root, "orch", "leases"))).toEqual([]);
  });

  it("refuses to spawn when the runner dir is a symlink", async () => {
    const checkout = realpathSync(process.cwd());
    const { id } = createTask({
      provider: "claude",
      prompt: "symlinked runner dir",
      readOnly: true,
      checkout,
    });
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(root, "orch", "runner"));
    const file = join(root, "orch", "tasks", id, "task.json");
    vi.stubEnv("CF_TASK_DIGEST", rightDigest(file));
    vi.stubEnv("CF_TASK_CHECKOUT", checkout);
    vi.mocked(spawn).mockClear();

    await runRunner(id);

    expect(readTask(id).result?.outcome).toBe("failed");
    expect(spawn).not.toHaveBeenCalled();
    expect(readdirSync(elsewhere)).toEqual([]);
  });
});

describe("cf task cancel", () => {
  it.each([1, process.pid])(
    "does not signal a forged runner pid %s",
    async (pid) => {
      const { id } = createTask({
        provider: "claude",
        prompt: "forged",
        readOnly: true,
        checkout: fake.checkout,
      });
      recordRunner(id, { pid, startedAt: "x" });
      // Signal 0 (liveness) passes through; any real signal is swallowed.
      const realKill = process.kill.bind(process);
      const kill = vi
        .spyOn(process, "kill")
        .mockImplementation((p, sig) => (sig === 0 ? realKill(p, 0) : true));

      stdout = [];
      await taskCancelCommand(id, { json: true });

      expect(JSON.parse(stdout.join(""))).toMatchObject({
        ok: true,
        data: { taskId: id, cancelled: true, signalled: false },
      });
      expect(kill.mock.calls.filter(([, sig]) => sig !== 0)).toEqual([]);
    },
  );

  function doneTask(): string {
    const { id } = createTask({
      provider: "claude",
      prompt: "done but running",
      readOnly: true,
      checkout: fake.checkout,
    });
    recordDone(id, { outcome: "succeeded", summary: "x" });
    return id;
  }

  it("still stops the runner of a task whose worker wrote done.json", async () => {
    const id = doneTask();
    const { spawn: realSpawn } =
      await vi.importActual<typeof import("child_process")>("child_process");
    // Its command line contains `task _run <id>`, like a real runner.
    const runner = realSpawn(
      process.execPath,
      ["-e", "setTimeout(() => {}, 60000)", "task", "_run", id],
      { stdio: "ignore" },
    );
    const exited = new Promise((r) => runner.once("exit", (_, sig) => r(sig)));
    try {
      recordRunner(id, { pid: runner.pid!, startedAt: "x" });

      stdout = [];
      await taskCancelCommand(id, { json: true });

      expect(JSON.parse(stdout.join(""))).toMatchObject({
        ok: true,
        data: { taskId: id, cancelled: false, signalled: true },
      });
      expect(await exited).toBe("SIGTERM");
      expect(existsSync(join(root, "orch", "tasks", id, "cancel.json"))).toBe(
        false,
      );
    } finally {
      runner.kill("SIGKILL");
    }
  });

  it("refuses a finished task whose runner pid is forged", async () => {
    const id = doneTask();
    recordRunner(id, { pid: process.pid, startedAt: "x" });
    const realKill = process.kill.bind(process);
    const kill = vi
      .spyOn(process, "kill")
      .mockImplementation((p, sig) => (sig === 0 ? realKill(p, 0) : true));

    stdout = [];
    await taskCancelCommand(id, { json: true });

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: false,
      error: { code: "ALREADY_FINISHED" },
    });
    expect(kill.mock.calls.filter(([, sig]) => sig !== 0)).toEqual([]);
  });
});

describe("sanitize", () => {
  it("strips ANSI CSI sequences and C1 controls but keeps newline and tab", () => {
    expect(sanitize("\x1b[31mred\x1b[0m|\u009b|ok\n\tend")).toBe(
      "red||ok\n\tend",
    );
    expect(sanitize("a\u202eb\u200bc\u2066d")).toBe("abcd");
  });
});
