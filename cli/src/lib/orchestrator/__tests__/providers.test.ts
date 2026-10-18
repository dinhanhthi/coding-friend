import { describe, it, expect } from "vitest";
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

  it("claude read-only blocks edit tools and denies writes to the checkout", () => {
    const { args } = PROVIDERS.claude.buildSpawn(task("claude", true), ctx);
    expect(after(args, "--disallowedTools", 3)).toEqual([
      "Edit",
      "Write",
      "NotebookEdit",
    ]);
    expect(after(args, "--permission-mode")).toEqual(["dontAsk"]);
    expect(claudeSettings(args).sandbox.filesystem).toEqual({
      allowWrite: [ctx.taskDir],
      denyWrite: [ctx.checkout],
    });
    expect(after(args, "--add-dir")).toEqual([ctx.taskDir]);
  });

  it("codex read-only uses the read-only sandbox without extra writable dirs", () => {
    const ro = PROVIDERS.codex.buildSpawn(task("codex", true), ctx).args;
    expect(after(ro, "--sandbox")).toEqual(["read-only"]);
    expect(ro).not.toContain("--add-dir");

    const rw = PROVIDERS.codex.buildSpawn(task("codex", false), ctx).args;
    expect(after(rw, "--sandbox")).toEqual(["workspace-write"]);
    expect(after(rw, "--add-dir")).toEqual([ctx.taskDir]);
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
