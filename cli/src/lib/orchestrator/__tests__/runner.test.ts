import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync, type spawn } from "child_process";
import { EventEmitter } from "events";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { PassThrough, Writable } from "stream";

// Never a real provider binary or version probe.
vi.mock("../providers/eligible.js", () => ({
  providerIneligibility: () => undefined,
  eligibleProviders: () => ["claude", "codex"],
}));

import { acquireLease } from "../lease.js";
import { buildResumePrompt } from "../bundle.js";
import {
  PROVIDERS,
  type ProviderAdapter,
  type ProviderRequest,
  type SpawnContext,
} from "../providers/index.js";
import { digest, runTask } from "../runner.js";
import {
  claimAttempt,
  createTask,
  readTask,
  recordCancel,
  recordDispatch,
  serialize,
  type Provider,
  type QuotaPolicy,
  type TaskRecord,
} from "../store.js";

type Script = { lines: unknown[]; code: number; stderr?: string; pid?: number };
interface Call {
  cmd: string;
  args: string[];
  stdin: string;
  cwd: string;
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
function fakeSpawn(cmd: string, args: string[], opts: { cwd: string }) {
  const script = queue.shift()!;
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  child.pid = script.pid ?? 0; // 0: never signalled
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
    calls.push({
      cmd,
      args,
      stdin,
      cwd: opts.cwd,
      leaseHeld: leases().length === 1,
    });
    for (const l of script.lines) stdout.write(JSON.stringify(l) + "\n");
    if (script.stderr) stderr.write(script.stderr);
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
function dispatch(
  onQuota: QuotaPolicy,
  opts: {
    models?: Partial<Record<Provider, string>>;
    firstProvider?: string;
  } = {},
): string {
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
      ...(opts.models && { models: opts.models }),
    },
  });
  claimAttempt(task.id, {
    n: 1,
    provider: (opts.firstProvider ?? "claude") as Provider,
    kind: "fresh",
  });
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

const realClaude = PROVIDERS.claude;

/** Run claude attempts through a fake adapter: the real claude plus `over`. */
function fakeClaude(over: Partial<ProviderAdapter>): void {
  PROVIDERS.claude = { ...realClaude, ...over };
}

afterEach(() => {
  PROVIDERS.claude = realClaude;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const readJson = (...parts: string[]) =>
  JSON.parse(readFileSync(join(orch, "runs", ...parts), "utf-8"));

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

describe("runner worker contract (C3a)", () => {
  const PRESET = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  /** A claude stream line the fake adapters read as "prompt received". */
  const ACCEPTED = { type: "system", subtype: "status", accepted: true };
  const quotaLine = {
    type: "rate_limit_event",
    rate_limit_info: { status: "rejected", resetsAt: 1_800_000_600 },
  };
  const okResult = {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "fake finished",
  };
  /** Parses like claude, plus `accepted`; never reports a session id itself. */
  const presetParse: ProviderAdapter["parseLine"] = (line, acc) => {
    const ev = JSON.parse(line);
    if (ev.accepted) acc.accepted = true;
    realClaude.parseLine(JSON.stringify({ ...ev, session_id: undefined }), acc);
  };

  describe("pre-spawn failures", () => {
    it("buildSpawn throws on a fresh attempt → no spawn, the task fails", async () => {
      const id = dispatch("wait");
      fakeClaude({
        buildSpawn: () => {
          throw new Error("prompt exceeds ARG_MAX");
        },
      });

      await run(id);

      expect(calls).toEqual([]);
      expect(readTask(id).result).toMatchObject({
        outcome: "failed",
        error: "prompt exceeds ARG_MAX",
      });
      expect(existsSync(join(orch, "runs", id, "1", "session.json"))).toBe(
        false,
      );
      expect(existsSync(join(orch, "runs", id, "2"))).toBe(false);
    });

    it("buildSpawn throws on a resume attempt → resume-gone: one fresh attempt with a bundle", async () => {
      const id = dispatch("wait");
      fakeClaude({
        buildSpawn: (t, c) => {
          if (c.resume) throw new Error("cannot resume");
          return realClaude.buildSpawn(t, c);
        },
      });
      queue = [claudeQuota(clock + 600), claudeOk(SID2)];

      await run(id);

      expect(calls).toHaveLength(2);
      expect(readJson(id, "2", "attempt.json")).toMatchObject({
        kind: "resume",
      });
      expect(readJson(id, "3", "attempt.json")).toMatchObject({
        kind: "fresh",
        bundle: true,
      });
      expect(calls[1].stdin).toContain(PROMPT);
      expect(readTask(id).state).toBe("succeeded");
    });

    it("prepare throws on a fresh attempt → same shape: no spawn, the task fails", async () => {
      const id = dispatch("wait");
      fakeClaude({
        prepare: async () => {
          throw new Error("create-chat failed");
        },
      });

      await run(id);

      expect(calls).toEqual([]);
      expect(readTask(id).result).toMatchObject({
        outcome: "failed",
        error: "create-chat failed",
      });
      expect(existsSync(join(orch, "runs", id, "2"))).toBe(false);
    });

    it("preflight refusal → the attempt fails with its message, no spawn", async () => {
      const id = dispatch("wait");
      fakeClaude({
        preflight: () => ({
          code: "PROVIDER_UNAVAILABLE",
          message: "checkout is under a temp dir",
        }),
      });

      await run(id);

      expect(calls).toEqual([]);
      expect(readTask(id).result?.error).toContain(
        "checkout is under a temp dir",
      );
      expect(existsSync(join(orch, "runs", id, "2"))).toBe(false);
    });
  });

  it("order preflight → prepare → buildSpawn; exec env; ctx/task to parseLine; spec.cwd; stderrTail", async () => {
    const id = dispatch("wait");
    const order: string[] = [];
    let req: ProviderRequest | undefined;
    let execOut: { code: number; stdout: string } | undefined;
    let buildCtx: SpawnContext | undefined;
    const parsed: [SpawnContext | undefined, TaskRecord | undefined][] = [];
    let tail: string | undefined;
    const wsCwd = join(root, "workspace");
    fakeClaude({
      preflight: (r) => {
        order.push("preflight");
        req = r;
        return undefined;
      },
      workspaceFiles: () => {
        order.push("workspaceFiles");
        return undefined;
      },
      prepare: async (_t, _c, exec) => {
        order.push("prepare");
        execOut = await exec(
          process.execPath,
          ["-e", "process.stdout.write(process.env.CF_TEST_PREPARE ?? '')"],
          { env: { CF_TEST_PREPARE: "from-adapter" }, timeoutMs: 20_000 },
        );
        return { sessionId: PRESET };
      },
      buildSpawn: (t, c) => {
        order.push("buildSpawn");
        buildCtx = c;
        return { ...realClaude.buildSpawn(t, c), cwd: wsCwd };
      },
      parseLine: (line, acc, c, t) => {
        parsed.push([c, t]);
        realClaude.parseLine(line, acc);
      },
      finish: (acc, code, c, stderrTail) => {
        tail = stderrTail;
        return realClaude.finish(acc, code, c);
      },
    });
    queue = [{ ...claudeOk(SID), stderr: "worker-stderr-tail" }];

    await run(id);

    expect(order).toEqual([
      "preflight",
      "workspaceFiles",
      "prepare",
      "buildSpawn",
    ]);
    expect(req).toEqual({ checkout, isGitRepo: true, readOnly: false });
    expect(execOut).toMatchObject({ code: 0, stdout: "from-adapter" });
    expect(buildCtx?.preparedSessionId).toBe(PRESET);
    expect(parsed).toHaveLength(2);
    for (const [c, t] of parsed) {
      expect(c).toMatchObject({
        preparedSessionId: PRESET,
        checkout,
        orchDir: orch,
      });
      expect(t).toMatchObject({ id, provider: "claude", prompt: PROMPT });
    }
    expect(calls[0].cwd).toBe(wsCwd);
    expect(tail).toBe("worker-stderr-tail");
    expect(readTask(id).state).toBe("succeeded");
  });

  it("each attempt uses the model of its own provider (switch → the new provider's model)", async () => {
    const id = dispatch("switch", {
      models: { claude: "claude-m1", codex: "codex-m1" },
    });
    queue = [claudeQuota((clock + 7200) * 1000), codexOk];

    await run(id);

    expect(calls.map((c) => c.cmd)).toEqual(["claude", "codex"]);
    const flag = (c: Call, f: string) => c.args[c.args.indexOf(f) + 1];
    expect(flag(calls[0], "--model")).toBe("claude-m1");
    expect(calls[1].args).not.toContain("--model");
    expect(flag(calls[1], "-m")).toBe("codex-m1");
  });

  describe("preset session ids", () => {
    it("are recorded only once the stream sets acc.accepted", async () => {
      const id = dispatch("wait");
      const sessionFile = join(orch, "runs", id, "1", "session.json");
      const seen: boolean[] = [];
      fakeClaude({
        prepare: async () => ({ sessionId: PRESET }),
        session: () => undefined,
        parseLine: (line, acc, c, t) => {
          seen.push(existsSync(sessionFile));
          presetParse(line, acc, c, t);
        },
      });
      queue = [
        {
          code: 0,
          lines: [{ type: "system", subtype: "init" }, ACCEPTED, okResult],
        },
      ];

      await run(id);

      // Lines 1 and 2 parse before any record; line 2 sets accepted.
      expect(seen).toEqual([false, false, true]);
      expect(readJson(id, "1", "session.json").sessionId).toBe(PRESET);
    });

    it("a quota before acc.accepted records no session: the next attempt is fresh with a bundle", async () => {
      const id = dispatch("wait");
      fakeClaude({
        prepare: async () => ({ sessionId: PRESET }),
        session: () => undefined,
        parseLine: presetParse,
      });
      queue = [
        { code: 1, lines: [quotaLine] },
        { code: 0, lines: [ACCEPTED, okResult] },
      ];

      await run(id);

      expect(existsSync(join(orch, "runs", id, "1", "session.json"))).toBe(
        false,
      );
      expect(readJson(id, "2", "attempt.json")).toMatchObject({
        kind: "fresh",
        bundle: true,
      });
      expect(existsSync(join(orch, "runs", id, "2", "context-bundle.md"))).toBe(
        true,
      );
      expect(calls[1].stdin).toContain(PROMPT);
    });

    it("a resume whose preset id the stream never confirms → finish has no sessionId → fresh with a bundle", async () => {
      const id = dispatch("wait");
      fakeClaude({
        prepare: async (_t, c) =>
          c.resume ? { sessionId: c.resume.sessionId } : {},
        parseLine: (line, acc, c, t) =>
          c?.resume
            ? presetParse(line, acc, c, t)
            : realClaude.parseLine(line, acc),
      });
      queue = [claudeQuota(clock + 600), claudeSessionGone, claudeOk(SID2)];

      await run(id);

      expect(existsSync(join(orch, "runs", id, "2", "session.json"))).toBe(
        false,
      );
      expect(readJson(id, "3", "attempt.json")).toMatchObject({
        kind: "fresh",
        bundle: true,
      });
      expect(readTask(id).state).toBe("succeeded");
    });

    it("an adapter that exposes no session id → the next attempt is fresh with a bundle (with one: resume, see above)", async () => {
      const id = dispatch("wait");
      fakeClaude({
        session: () => undefined,
        finish: (acc, code, c) => {
          const fin = realClaude.finish(acc, code, c);
          delete fin.sessionId;
          return fin;
        },
      });
      queue = [claudeQuota(clock + 600), claudeOk(SID2)];

      await run(id);

      expect(readJson(id, "2", "attempt.json")).toMatchObject({
        kind: "fresh",
        bundle: true,
      });
      expect(calls[1].args).not.toContain("--resume");
      expect(calls[1].stdin).not.toBe(buildResumePrompt({ taskId: id }));
      expect(calls[1].stdin).toContain(PROMPT);
    });
  });

  it("acc.abort kills the worker group once and fails the attempt with the reason (no pause)", async () => {
    const id = dispatch("wait");
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    fakeClaude({
      parseLine: (line, acc) => {
        realClaude.parseLine(line, acc);
        if (JSON.parse(line).type === "rate_limit_event") {
          acc.abort = "sandbox root drift";
        }
      },
    });
    queue = [{ ...claudeQuota(clock + 600), pid: 424242 }];

    await run(id);

    expect(kill.mock.calls).toEqual([[-424242, "SIGKILL"]]);
    expect(readTask(id).result).toMatchObject({ outcome: "failed" });
    expect(readTask(id).result?.error).toContain("sandbox root drift");
    expect(existsSync(join(orch, "runs", id, "1", "pause.json"))).toBe(false);
    expect(existsSync(join(orch, "runs", id, "2"))).toBe(false);
  });

  it("a preset id the record rejects → a later valid stream id is still recorded", async () => {
    const id = dispatch("wait");
    fakeClaude({
      prepare: async () => ({ sessionId: "-not a session id" }),
      parseLine: (line, acc) => {
        if (JSON.parse(line).accepted) acc.accepted = true;
        realClaude.parseLine(line, acc);
      },
    });
    queue = [
      {
        code: 0,
        lines: [
          ACCEPTED,
          { type: "system", subtype: "init", session_id: SID },
          { ...okResult, session_id: SID },
        ],
      },
    ];

    await run(id);

    expect(readJson(id, "1", "session.json").sessionId).toBe(SID);
  });

  describe("prepare exec", () => {
    const printEnvKeys = [
      "-e",
      "process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))",
    ];

    it("opts.env adds to the runner's env; filtered vars never reach the child", async () => {
      const id = dispatch("wait"); // stubs CF_TASK_DIGEST / CF_TASK_CHECKOUT
      vi.stubEnv("CF_TEST_RUNNER_ONLY", "1");
      vi.stubEnv("CLAUDECODE", "1");
      let given: string[] = [];
      let inherited: string[] = [];
      fakeClaude({
        prepare: async (_t, _c, exec) => {
          const a = await exec(process.execPath, printEnvKeys, {
            env: {
              CF_TEST_PREPARE: "x",
              CF_TASK_DIGEST: "injected",
              CLAUDECODE: "1",
            },
            timeoutMs: 20_000,
          });
          given = JSON.parse(a.stdout);
          const b = await exec(process.execPath, printEnvKeys, {
            timeoutMs: 20_000,
          });
          inherited = JSON.parse(b.stdout);
          return {};
        },
      });
      queue = [claudeOk(SID)];

      await run(id);

      // macOS adds __CF_USER_TEXT_ENCODING to every process.
      expect(given).toContain("CF_TEST_PREPARE");
      expect(given).toContain("CF_TEST_RUNNER_ONLY");
      expect(inherited).toContain("CF_TEST_RUNNER_ONLY");
      for (const k of ["CF_TASK_DIGEST", "CF_TASK_CHECKOUT", "CLAUDECODE"]) {
        expect(given).not.toContain(k);
        expect(inherited).not.toContain(k);
      }
      expect(readTask(id).state).toBe("succeeded");
    });

    it("times out within timeout + drain even when a grandchild holds the pipes", async () => {
      const id = dispatch("wait");
      const pidFile = join(root, "grandchild.pid");
      // The grandchild leaves the group (detached) but inherits stdout/stderr.
      const script = [
        "const { spawn } = require('child_process');",
        "const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'],",
        "  { detached: true, stdio: ['ignore', 'inherit', 'inherit'] });",
        "require('fs').writeFileSync(process.argv[1], String(g.pid));",
        "g.unref();",
        "setInterval(() => {}, 1000);",
      ].join("\n");
      let elapsed = 0;
      fakeClaude({
        prepare: async (_t, _c, exec) => {
          const t0 = Date.now();
          try {
            await exec(process.execPath, ["-e", script, pidFile], {
              timeoutMs: 1000,
            });
          } finally {
            elapsed = Date.now() - t0;
          }
          return {};
        },
      });

      try {
        await run(id);
      } finally {
        if (existsSync(pidFile)) {
          try {
            process.kill(Number(readFileSync(pidFile, "utf-8")), "SIGKILL");
          } catch {
            // already gone
          }
        }
      }

      expect(existsSync(pidFile)).toBe(true);
      expect(elapsed).toBeLessThan(1000 + 2000 + 2500);
      expect(calls).toEqual([]);
      expect(readTask(id).result?.error).toContain("timed out after 1000 ms");
    }, 15_000);
  });

  it("an unknown provider in the attempt fails it as before", async () => {
    const id = dispatch("wait", { firstProvider: "nope" });

    await run(id);

    expect(calls).toEqual([]);
    expect(readTask(id).result?.error).toBe("attempt 1: unknown provider");
  });
});

describe("runner workspace lifecycle (C3a)", () => {
  /** A fake adapter's task-level config dir, a sibling of runner/<id>/<n>. */
  const configDir = (id: string, name = "fake-config") =>
    join(orch, "runner", id, name);
  const wsDir = (id: string) => join(orch, "workspaces", id);

  /** claude plus a workspace (two files) and a task-level config dir. */
  function fakeWithWorkspace(seen: string[][] = []): void {
    fakeClaude({
      workspaceFiles: (t, _c, prompt) => ({
        files: {
          ".fake/sandbox.json": `{"task":"${t.id}"}`,
          "prompt.txt": prompt,
        },
      }),
      prepare: async (t) => {
        mkdirSync(join(configDir(t.id), "chats"), { recursive: true });
        return {};
      },
      cleanupPaths: (t) => [configDir(t.id)],
      buildSpawn: (t, c) => {
        seen.push(readdirSync(wsDir(t.id)).sort());
        return realClaude.buildSpawn(t, c);
      },
    });
  }

  it("rebuilds the workspace clean before each attempt; cleanupPaths survive between attempts; both go at the end", async () => {
    const id = dispatch("wait");
    const seen: string[][] = [];
    fakeWithWorkspace(seen);
    queue = [claudeQuota(clock + 600), claudeOk(SID)];
    let between = false;

    await run(id, () => {
      // Between attempts: junk in the workspace, a rewritten file, chat state.
      writeFileSync(join(wsDir(id), "junk"), "x");
      writeFileSync(join(wsDir(id), ".fake", "sandbox.json"), "{}");
      writeFileSync(join(configDir(id), "chats", "chat-1"), "keep");
      between = existsSync(configDir(id));
    });

    expect(calls).toHaveLength(2);
    expect(seen).toEqual([
      [".fake", "prompt.txt"],
      [".fake", "prompt.txt"],
    ]);
    expect(between).toBe(true);
    expect(readTask(id).state).toBe("succeeded");
    expect(existsSync(wsDir(id))).toBe(false);
    expect(existsSync(configDir(id))).toBe(false);
    // Removed before the non-recursive rmdir of runner/<id>: no ENOTEMPTY.
    expect(existsSync(join(orch, "runner", id))).toBe(false);
  });

  it("writes workspace files 0600 with the adapter's content", async () => {
    const id = dispatch("wait");
    let mode = 0;
    let content = "";
    fakeWithWorkspace();
    const withCheck = PROVIDERS.claude;
    PROVIDERS.claude = {
      ...withCheck,
      buildSpawn: (t, c) => {
        const file = join(wsDir(t.id), ".fake", "sandbox.json");
        mode = statSync(file).mode & 0o777;
        content = readFileSync(file, "utf-8");
        return realClaude.buildSpawn(t, c);
      },
    };
    queue = [claudeOk(SID)];

    await run(id);

    expect(mode).toBe(0o600);
    expect(content).toBe(`{"task":"${id}"}`);
  });

  it.each(["failed", "cancelled"] as const)(
    "%s task: end() removes the workspace and cleanupPaths",
    async (outcome) => {
      const id = dispatch("wait");
      fakeWithWorkspace();
      const withWs = PROVIDERS.claude;
      PROVIDERS.claude = {
        ...withWs,
        buildSpawn: (t, c) => {
          if (outcome === "cancelled") recordCancel(t.id);
          return withWs.buildSpawn(t, c);
        },
      };
      queue = [outcome === "failed" ? claudeSessionGone : claudeOk(SID)];

      await run(id);

      expect(calls).toHaveLength(1);
      expect(readTask(id).result?.outcome).toBe(outcome);
      expect(existsSync(wsDir(id))).toBe(false);
      expect(existsSync(configDir(id))).toBe(false);
      expect(existsSync(join(orch, "runner", id))).toBe(false);
    },
  );

  it("after a provider switch, end() removes the cleanupPaths of both providers", async () => {
    const id = dispatch("switch");
    const realCodex = PROVIDERS.codex;
    fakeWithWorkspace();
    PROVIDERS.codex = {
      ...realCodex,
      prepare: async (t) => {
        mkdirSync(configDir(t.id, "codex-config"));
        return {};
      },
      cleanupPaths: (t) => [configDir(t.id, "codex-config")],
    };
    try {
      queue = [claudeQuota((clock + 7200) * 1000), codexOk];

      await run(id);
    } finally {
      PROVIDERS.codex = realCodex;
    }

    expect(calls.map((c) => c.cmd)).toEqual(["claude", "codex"]);
    expect(readTask(id).state).toBe("succeeded");
    expect(existsSync(configDir(id))).toBe(false);
    expect(existsSync(configDir(id, "codex-config"))).toBe(false);
    expect(existsSync(join(orch, "runner", id))).toBe(false);
  });

  it("a workspace that cannot be built fails the attempt without a spawn", async () => {
    const id = dispatch("wait");
    fakeClaude({
      workspaceFiles: () => ({ files: { "../escape.json": "{}" } }),
    });

    await run(id);

    expect(calls).toEqual([]);
    expect(readTask(id).result).toMatchObject({ outcome: "failed" });
    expect(readTask(id).result?.error).toContain("invalid workspace file path");
    expect(existsSync(join(orch, "workspaces", "escape.json"))).toBe(false);
    expect(existsSync(wsDir(id))).toBe(false);
  });

  it("never removes a cleanupPaths entry outside the store; the task still ends", async () => {
    const id = dispatch("wait");
    // Same prefix as the store, but a sibling: only `<orch>/` is inside.
    const victimDir = `${orch}-victim`;
    const victimFile = join(root, "victim.txt");
    mkdirSync(join(victimDir, "sub"), { recursive: true });
    writeFileSync(join(victimDir, "sub", "keep"), "x");
    writeFileSync(victimFile, "x");
    fakeClaude({ cleanupPaths: () => [victimDir, victimFile] });
    queue = [claudeOk(SID)];

    await run(id);

    expect(readTask(id).state).toBe("succeeded");
    expect(readFileSync(join(victimDir, "sub", "keep"), "utf-8")).toBe("x");
    expect(readFileSync(victimFile, "utf-8")).toBe("x");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("outside the store"),
    );
  });

  it("a symlinked workspaces/ fails the attempt and nothing is deleted through it", async () => {
    const id = dispatch("wait");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(join(elsewhere, id), { recursive: true });
    writeFileSync(join(elsewhere, id, "keep"), "x");
    symlinkSync(elsewhere, join(orch, "workspaces"));
    fakeWithWorkspace();
    queue = [claudeOk(SID)];

    await run(id);

    expect(calls).toEqual([]);
    expect(readTask(id).result).toMatchObject({ outcome: "failed" });
    expect(readTask(id).result?.error).toContain("refusing");
    expect(lstatSync(join(orch, "workspaces")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(elsewhere, id, "keep"), "utf-8")).toBe("x");
  });

  it("never deletes a cleanup path through a symlinked ancestor (runner/ swapped mid-run)", async () => {
    const id = dispatch("wait");
    const moved = join(root, "moved-runner");
    fakeWithWorkspace();
    const withWs = PROVIDERS.claude;
    PROVIDERS.claude = {
      ...withWs,
      buildSpawn: (t, c) => {
        // runner/<id>/fake-config exists now (prepare): swap runner/ for a link.
        renameSync(join(orch, "runner"), moved);
        symlinkSync(moved, join(orch, "runner"));
        writeFileSync(join(moved, t.id, "fake-config", "chats", "keep"), "x");
        return withWs.buildSpawn(t, c);
      },
    };
    queue = [claudeOk(SID)];

    await run(id);

    expect(readTask(id).result).toBeDefined();
    expect(
      readFileSync(join(moved, id, "fake-config", "chats", "keep"), "utf-8"),
    ).toBe("x");
  });

  it("the runner names no provider-specific path (no Cursor)", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../runner.ts", import.meta.url)),
      "utf-8",
    );
    expect(src).not.toMatch(/cursor/i);
  });
});
