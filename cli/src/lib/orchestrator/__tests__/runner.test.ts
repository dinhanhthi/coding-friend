import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync, type spawn } from "child_process";
import { EventEmitter } from "events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PassThrough, Writable } from "stream";

vi.mock("../providers/eligible.js", () => ({
  eligibleProviders: () => ["claude", "codex"],
}));

import { acquireLease } from "../lease.js";
import { buildResumePrompt } from "../bundle.js";
import { digest, runTask } from "../runner.js";
import {
  claimAttempt,
  createTask,
  readTask,
  recordCancel,
  recordDispatch,
  serialize,
  type QuotaPolicy,
} from "../store.js";

type Script = { lines: unknown[]; code: number };
interface Call {
  cmd: string;
  args: string[];
  stdin: string;
  leaseHeld: boolean;
}

const PROMPT = "ORIGINAL-PROMPT refactor the parser";
const SID = "11111111-2222-3333-4444-555555555555";

let root: string;
let orch: string;
let checkout: string;
let clock: number;
let queue: Script[];
let calls: Call[];

const leases = () =>
  existsSync(join(orch, "leases")) ? readdirSync(join(orch, "leases")) : [];

/** A worker that writes `script` to stdout once its stdin closes, then exits. */
function fakeSpawn(cmd: string, args: string[]) {
  const script = queue.shift()!;
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  child.pid = 0; // never signalled
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  child.stdout = stdout;
  child.stderr = stderr;
  let stdin = "";
  const sink = new Writable({
    write(c, _e, cb) {
      stdin += c;
      cb();
    },
  });
  child.stdin = sink;
  sink.on("finish", () => {
    calls.push({ cmd, args, stdin, leaseHeld: leases().length === 1 });
    for (const l of script.lines) stdout.write(JSON.stringify(l) + "\n");
    stdout.end();
    stderr.end();
    setImmediate(() => child.emit("exit", script.code));
  });
  return child;
}

const claudeQuota = (resetsAt: number): Script => ({
  code: 1,
  lines: [
    { type: "system", subtype: "init", session_id: SID },
    {
      type: "rate_limit_event",
      rate_limit_info: { status: "rejected", resetsAt },
    },
    {
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      api_error_status: 429,
      result: "limit hit",
      session_id: SID,
    },
  ],
});
const SID2 = "66666666-7777-8888-9999-000000000000";
const claudeOk = (sid: string): Script => ({
  code: 0,
  lines: [
    { type: "system", subtype: "init", session_id: sid },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "claude finished",
      session_id: sid,
    },
  ],
});
/** `--resume` of a session that no longer exists: fails, reports no session. */
const claudeSessionGone: Script = {
  code: 1,
  lines: [
    {
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      result: "No conversation found with session ID",
    },
  ],
};
const codexOk: Script = {
  code: 0,
  lines: [
    { type: "thread.started", thread_id: "thread-xyz" },
    {
      type: "item.completed",
      item: { type: "agent_message", text: "codex finished" },
    },
    { type: "turn.completed" },
  ],
};

/** A dispatched writer task (lease held, attempt 1 claimed on claude). */
function dispatch(onQuota: QuotaPolicy): string {
  const task = createTask({
    provider: "claude",
    prompt: PROMPT,
    readOnly: false,
    checkout,
  });
  acquireLease(checkout, task.id);
  const taskDigest = digest(Buffer.from(serialize(task), "utf-8"));
  recordDispatch(task.id, {
    taskDigest,
    isGitRepo: true,
    policy: {
      onQuota,
      waitMinutes: 30,
      fallback: ["claude", "codex"],
      noFallback: false,
    },
  });
  claimAttempt(task.id, { n: 1, provider: "claude", kind: "fresh" });
  vi.stubEnv("CF_TASK_DIGEST", taskDigest);
  vi.stubEnv("CF_TASK_CHECKOUT", checkout);
  return task.id;
}

function run(id: string, onSleep?: () => void) {
  return runTask(id, {
    spawn: fakeSpawn as unknown as typeof spawn,
    now: () => clock,
    sleep: async (ms) => {
      clock += Math.ceil(ms / 1000);
      onSleep?.();
    },
  });
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "cf-runner-")));
  orch = join(root, "orch");
  checkout = join(root, "checkout");
  mkdirSync(checkout);
  execFileSync("git", ["init", "-q"], { cwd: checkout });
  vi.stubEnv("CF_ORCHESTRATOR_DIR", orch);
  // The runner refuses a task whose checkout is not its cwd.
  vi.spyOn(process, "cwd").mockReturnValue(checkout);
  vi.spyOn(console, "error").mockImplementation(() => {});
  clock = 1_800_000_000;
  queue = [];
  calls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("runner attempt loop", () => {
  it("switch policy: pauses attempt 1, runs attempt 2 on codex with a context bundle", async () => {
    const id = dispatch("switch");
    queue = [claudeQuota((clock + 7200) * 1000), codexOk];

    await run(id);

    const runs = join(orch, "runs", id);
    const pause = JSON.parse(
      readFileSync(join(runs, "1", "pause.json"), "utf-8"),
    );
    expect(pause).toMatchObject({ provider: "claude", resetsAt: clock + 7200 });
    const attempt2 = JSON.parse(
      readFileSync(join(runs, "2", "attempt.json"), "utf-8"),
    );
    expect(attempt2).toMatchObject({
      provider: "codex",
      kind: "switch",
      bundle: true,
    });
    expect(
      readFileSync(join(runs, "2", "context-bundle.md"), "utf-8"),
    ).toContain(PROMPT);

    expect(calls.map((c) => c.cmd)).toEqual(["claude", "codex"]);
    expect(calls[1].stdin).toContain(`# Context for Coding Friend task ${id}`);
    expect(calls[1].stdin).toContain(PROMPT);
    expect(calls[1].args).not.toContain("resume");
    // The lease stays with the task across the switch, then goes at the end.
    expect(calls.map((c) => c.leaseHeld)).toEqual([true, true]);
    expect(leases()).toEqual([]);
    expect(existsSync(join(orch, "runner", id))).toBe(false);

    const view = readTask(id);
    expect(view.state).toBe("succeeded");
    expect(view.result).toMatchObject({
      outcome: "succeeded",
      lastMessage: "codex finished",
    });
  });

  it("reset inside the wait window → waits, then resumes the same session", async () => {
    const id = dispatch("wait-then-switch");
    queue = [claudeQuota(clock + 600), claudeOk(SID)];

    await run(id);

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.cmd)).toEqual(["claude", "claude"]);
    const attempt2 = JSON.parse(
      readFileSync(join(orch, "runs", id, "2", "attempt.json"), "utf-8"),
    );
    expect(attempt2).toMatchObject({
      provider: "claude",
      kind: "resume",
      resumeSessionId: SID,
    });
    expect(calls[1].args).toContain("--resume");
    expect(calls[1].args[calls[1].args.indexOf("--resume") + 1]).toBe(SID);
    expect(calls[1].args).not.toContain("--session-id");
    expect(calls[1].stdin).toBe(buildResumePrompt({ taskId: id }));
    // Waited past the reset before resuming.
    expect(clock).toBeGreaterThanOrEqual(1_800_000_000 + 600);
    expect(readTask(id).state).toBe("succeeded");
    expect(leases()).toEqual([]);
  });

  it("resumed session is gone → one fresh attempt with a bundle on the same provider", async () => {
    const id = dispatch("wait-then-switch");
    queue = [claudeQuota(clock + 600), claudeSessionGone, claudeOk(SID2)];

    await run(id);

    expect(calls.map((c) => c.cmd)).toEqual(["claude", "claude", "claude"]);
    const runs = join(orch, "runs", id);
    const attempt3 = JSON.parse(
      readFileSync(join(runs, "3", "attempt.json"), "utf-8"),
    );
    expect(attempt3).toMatchObject({
      provider: "claude",
      kind: "fresh",
      bundle: true,
    });
    expect(calls[2].args).not.toContain("--resume");
    expect(calls[2].args).toContain("--session-id");
    expect(calls[2].stdin).toContain(`# Context for Coding Friend task ${id}`);
    expect(calls[2].stdin).toContain(PROMPT);
    expect(existsSync(join(runs, "4"))).toBe(false);
    expect(readTask(id).state).toBe("succeeded");
    expect(leases()).toEqual([]);
  });

  it("the session-gone fallback is used once: a second gone session fails the task", async () => {
    const id = dispatch("wait-then-switch");
    queue = [
      claudeQuota(clock + 600),
      claudeSessionGone,
      // The fresh attempt hits the limit too (new session SID) ...
      claudeQuota(clock + 1200),
      // ... and its resume finds the session gone again.
      claudeSessionGone,
    ];

    await run(id);

    expect(calls).toHaveLength(4);
    expect(calls[3].args[calls[3].args.indexOf("--resume") + 1]).toBe(SID);
    expect(existsSync(join(orch, "runs", id, "5"))).toBe(false);
    expect(readTask(id).state).toBe("failed");
    expect(leases()).toEqual([]);
  });

  it("cancel while waiting for the reset → cancelled, lease released", async () => {
    const id = dispatch("wait");
    queue = [claudeQuota(clock + 3600)];

    await run(id, () => recordCancel(id));

    expect(calls).toHaveLength(1);
    expect(readTask(id).result?.outcome).toBe("cancelled");
    expect(readTask(id).state).toBe("cancelled");
    expect(existsSync(join(orch, "runs", id, "2"))).toBe(false);
    expect(leases()).toEqual([]);
  });
});
