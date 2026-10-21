import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  PROVIDERS,
  type SpawnContext,
  type StreamAcc,
} from "../providers/index.js";
import type { Provider, TaskRecord } from "../store.js";

const PROMPT = "SECRET-PROMPT refactor the parser";

const ctx: SpawnContext = {
  orchDir: "/orch",
  taskDir: "/orch/tasks/abcd1234",
  // No last-message.txt here: codex falls back to the parsed stream.
  privateDir: join(tmpdir(), "cf-providers-test-missing"),
  checkout: "/repo",
  cfInvocation: ["/usr/bin/node", "/cli/index.js"],
  sessionUuid: "00000000-0000-4000-8000-000000000000",
};

function task(provider: Provider, readOnly: boolean): TaskRecord {
  return {
    schemaVersion: 1,
    id: "abcd1234",
    provider,
    prompt: PROMPT,
    readOnly,
    checkout: ctx.checkout,
    createdAt: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const TRUSTED = [
  "/orch/runs",
  "/orch/leases",
  "/orch/runner",
  "/orch/supervisor",
];

function claudeSettings(args: string[]): any {
  return JSON.parse(args[args.indexOf("--settings") + 1]);
}

function after(args: string[], flag: string, n = 1): string[] {
  const i = args.indexOf(flag);
  return i === -1 ? [] : args.slice(i + 1, i + 1 + n);
}

function parse(provider: Provider, lines: string[]) {
  const adapter = PROVIDERS[provider];
  const acc: StreamAcc = {};
  for (const line of lines) adapter.parseLine(line, acc);
  return adapter.finish(acc, 0, ctx);
}

describe("buildSpawn", () => {
  it("claude writer runs in a mandatory sandbox that can write only its task dir", () => {
    const { args } = PROVIDERS.claude.buildSpawn(task("claude", false), ctx);
    expect(claudeSettings(args).sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: { allowWrite: [ctx.taskDir] },
    });
  });

  it.each([false, true])(
    "claude (readOnly=%s) denies writes to the store's trusted dirs",
    (readOnly) => {
      const { args } = PROVIDERS.claude.buildSpawn(
        task("claude", readOnly),
        ctx,
      );
      const { denyWrite } = claudeSettings(args).sandbox.filesystem;
      // The sandbox can write the per-user temp dir, where a store may live.
      expect(denyWrite).toEqual(expect.arrayContaining(TRUSTED));
      expect(denyWrite).not.toContain(ctx.orchDir);
    },
  );

  it("claude read-only blocks edit tools and denies writes to the checkout", () => {
    const { args } = PROVIDERS.claude.buildSpawn(task("claude", true), ctx);
    expect(after(args, "--disallowedTools", 3)).toEqual([
      "Edit",
      "Write",
      "NotebookEdit",
    ]);
    expect(after(args, "--permission-mode")).toEqual(["dontAsk"]);
    // dontAsk denies unlisted Bash: the worker's own cf ask/done must be allowed.
    expect(after(args, "--allowedTools", 2)).toEqual([
      "Bash(/usr/bin/node /cli/index.js ask *)",
      "Bash(/usr/bin/node /cli/index.js done *)",
    ]);
    expect(claudeSettings(args).sandbox.filesystem).toEqual({
      allowWrite: [ctx.taskDir],
      denyWrite: [ctx.checkout, ...TRUSTED],
    });
    expect(after(args, "--add-dir")).toEqual([ctx.taskDir]);
  });

  it.each([
    [false, ":workspace"],
    [true, ":read-only"],
  ])(
    "codex (readOnly=%s) uses a permission profile: store read-only, task dir writable",
    (readOnly, base) => {
      const { args } = PROVIDERS.codex.buildSpawn(task("codex", readOnly), ctx);
      const config = args.filter((_, i) => args[i - 1] === "-c");
      expect(config).toEqual([
        'default_permissions="cf_task"',
        `permissions.cf_task.extends="${base}"`,
        'permissions.cf_task.filesystem={"/orch"="read","/orch/tasks/abcd1234"="write"}',
      ]);
      // --sandbox would override the profile.
      expect(args).not.toContain("--sandbox");
      expect(args).not.toContain("--add-dir");
    },
  );

  it("codex escapes store paths as TOML basic strings", () => {
    const odd = { ...ctx, orchDir: '/o "x"\\y', taskDir: '/o "x"\\y/tasks/t' };
    const { args } = PROVIDERS.codex.buildSpawn(task("codex", false), odd);
    expect(args).toContain(
      'permissions.cf_task.filesystem={"/o \\"x\\"\\\\y"="read","/o \\"x\\"\\\\y/tasks/t"="write"}',
    );
  });

  it.each([false, true])(
    "codex (readOnly=%s) writes -o into the runner private dir, not the task dir",
    (readOnly) => {
      const { args } = PROVIDERS.codex.buildSpawn(task("codex", readOnly), ctx);
      expect(after(args, "-o")).toEqual([
        join(ctx.privateDir, "last-message.txt"),
      ]);
      expect(args.some((a) => a.startsWith(ctx.taskDir + "/"))).toBe(false);
    },
  );

  it.each([
    ["claude", false],
    ["claude", true],
    ["codex", false],
    ["codex", true],
  ] as const)(
    "%s (readOnly=%s) passes the prompt only via stdin and sets CF_TASK_ID",
    (provider, readOnly) => {
      const spec = PROVIDERS[provider].buildSpawn(
        task(provider, readOnly),
        ctx,
      );
      expect(spec.args.some((a) => a.includes("SECRET-PROMPT"))).toBe(false);
      expect(spec.stdin).toContain(PROMPT);
      expect(spec.env.CF_TASK_ID).toBe("abcd1234");
    },
  );

  it.each(["claude", "codex"] as const)(
    "%s preamble says to run cf ask/done standalone (dontAsk denies chains)",
    (provider) => {
      const spec = PROVIDERS[provider].buildSpawn(task(provider, true), ctx);
      const preamble =
        provider === "claude"
          ? after(spec.args, "--append-system-prompt")[0]
          : spec.stdin;
      expect(preamble).toContain(
        "as a single standalone command, exactly as shown: never chain it with ;, &&, || or |",
      );
    },
  );
});

describe("stream parsing", () => {
  it("claude success result → succeeded with session id and last message", () => {
    const fin = parse("claude", [
      '{"type":"system","subtype":"init","session_id":"sess-1","tools":[]}',
      '{"type":"result","subtype":"success","is_error":false,"result":"All done","session_id":"sess-1"}',
    ]);
    expect(fin).toMatchObject({
      outcome: "succeeded",
      sessionId: "sess-1",
      lastMessage: "All done",
    });
    expect(fin.error).toBeUndefined();
  });

  it("claude error result → failed with its errors", () => {
    const fin = parse("claude", [
      '{"type":"system","subtype":"init","session_id":"sess-2"}',
      '{"type":"result","subtype":"error_max_turns","is_error":true,"session_id":"sess-2","errors":["Reached max turns"]}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "sess-2",
      error: "Reached max turns",
    });
  });

  it("codex thread.started + turn.completed → succeeded with thread id", () => {
    const fin = parse("codex", [
      '{"type":"thread.started","thread_id":"thread-1"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Fixed it"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
    ]);
    expect(fin).toMatchObject({
      outcome: "succeeded",
      sessionId: "thread-1",
      lastMessage: "Fixed it",
    });
  });

  it("codex error then turn.failed → failed", () => {
    const fin = parse("codex", [
      '{"type":"thread.started","thread_id":"thread-2"}',
      '{"type":"error","message":"stream disconnected"}',
      '{"type":"turn.failed","error":{"message":"stream disconnected"}}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "thread-2",
      error: "stream disconnected",
    });
  });

  describe("codex last-message.txt", () => {
    const lines = [
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"From stream"}}',
      '{"type":"turn.completed"}',
    ];
    function finishIn(privateDir: string) {
      const acc: StreamAcc = {};
      for (const line of lines) PROVIDERS.codex.parseLine(line, acc);
      return PROVIDERS.codex.finish(acc, 0, { ...ctx, privateDir });
    }

    it("prefers a regular file written by codex", () => {
      const dir = mkdtempSync(join(tmpdir(), "cf-providers-private-"));
      try {
        writeFileSync(join(dir, "last-message.txt"), "From file");
        expect(finishIn(dir).lastMessage).toBe("From file");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("does not read through a symlink", () => {
      const dir = mkdtempSync(join(tmpdir(), "cf-providers-private-"));
      try {
        writeFileSync(join(dir, "secret"), "SECRET");
        symlinkSync(join(dir, "secret"), join(dir, "last-message.txt"));
        expect(finishIn(dir).lastMessage).toBe("From stream");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

describe("quota detection", () => {
  it("claude rejected rate_limit_event → quota with ms resetsAt normalized to seconds", () => {
    const fin = parse("claude", [
      '{"type":"system","subtype":"init","session_id":"sess-q"}',
      '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1800000000000}}',
      '{"type":"result","subtype":"error_during_execution","is_error":true,"api_error_status":429,"result":"limit hit","session_id":"sess-q"}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "sess-q",
      quota: { resetsAt: 1800000000, source: "claude.rate_limit_event" },
    });
  });

  it("claude allowed_warning is not a quota stop", () => {
    const acc: StreamAcc = {};
    PROVIDERS.claude.parseLine(
      '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":1800000000}}',
      acc,
    );
    expect(acc.quota).toBeUndefined();
  });

  it("codex usage limit (curly apostrophe) → quota at the parsed local time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0));
    const fin = parse("codex", [
      '{"type":"thread.started","thread_id":"thread-q"}',
      '{"type":"turn.failed","error":{"message":"You\u2019ve hit your usage limit. Try again at 3:45 PM."}}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "thread-q",
      quota: {
        resetsAt: new Date(2026, 9, 20, 15, 45).getTime() / 1000,
        source: "codex.usage_limit",
      },
    });
  });

  it('codex turn.failed "Try again later." keeps the reset parsed from the error event', () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0));
    const fin = parse("codex", [
      '{"type":"error","message":"You\u2019ve hit your usage limit. Try again at 3:45 PM."}',
      '{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit. Try again later."}}',
    ]);
    expect(fin.quota?.resetsAt).toBe(
      new Date(2026, 9, 20, 15, 45).getTime() / 1000,
    );
  });
});

describe("resume keeps the sandbox", () => {
  const SID = "0199a213-81c0-7800-8aa1-bbab2a035a53";
  const resumeCtx: SpawnContext = { ...ctx, resume: { sessionId: SID } };

  it("claude resumes with --resume <sid>, no --session-id, same sandbox flags", () => {
    const { args } = PROVIDERS.claude.buildSpawn(
      task("claude", true),
      resumeCtx,
    );
    expect(after(args, "--resume")).toEqual([SID]);
    expect(args).not.toContain("--session-id");
    expect(after(args, "--permission-mode")).toEqual(["dontAsk"]);
    expect(after(args, "--allowedTools", 2)).toEqual([
      "Bash(/usr/bin/node /cli/index.js ask *)",
      "Bash(/usr/bin/node /cli/index.js done *)",
    ]);
    expect(claudeSettings(args).sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        allowWrite: [ctx.taskDir],
        denyWrite: [ctx.checkout, ...TRUSTED],
      },
    });
  });

  it("codex keeps the permission profile and -C before `resume <thread> -`", () => {
    const { args } = PROVIDERS.codex.buildSpawn(task("codex", true), resumeCtx);
    expect(args.filter((_, i) => args[i - 1] === "-c")).toEqual([
      'default_permissions="cf_task"',
      'permissions.cf_task.extends=":read-only"',
      'permissions.cf_task.filesystem={"/orch"="read","/orch/tasks/abcd1234"="write"}',
    ]);
    const resume = args.indexOf("resume");
    expect(args.indexOf("-C")).toBeGreaterThan(-1);
    expect(args.indexOf("-C")).toBeLessThan(resume);
    expect(args.slice(resume)).toEqual(["resume", SID, "-"]);
  });

  it("both refuse to resume a session id that could be read as a flag", () => {
    const bad: SpawnContext = { ...ctx, resume: { sessionId: "--yolo-12345" } };
    for (const p of ["claude", "codex"] as const) {
      expect(() => PROVIDERS[p].buildSpawn(task(p, true), bad)).toThrow(
        /invalid session id/,
      );
    }
  });

  it("claude worker env drops CLAUDE_CODE_RETRY_WATCHDOG* (CF decides wait or switch)", () => {
    vi.stubEnv("CLAUDE_CODE_RETRY_WATCHDOG", "1");
    vi.stubEnv("CLAUDE_CODE_RETRY_WATCHDOG_MAX_MS", "600000");
    const { env } = PROVIDERS.claude.buildSpawn(task("claude", false), ctx);
    expect(
      Object.keys(env).filter((k) =>
        k.startsWith("CLAUDE_CODE_RETRY_WATCHDOG"),
      ),
    ).toEqual([]);
  });
});
