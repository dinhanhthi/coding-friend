import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { codexProvider } from "../transcript-codex.js";

const savedEnv = process.env.CODEX_HOME;
let tmp: string;
let root: string;
let dayDir: string;

const THREAD = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const STAMP = "2026-11-01T10-00-00";

function jsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

function item(payload: unknown): unknown {
  return {
    timestamp: "2026-11-01T10:00:01.000Z",
    type: "response_item",
    payload,
  };
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-transcript-codex-")));
  process.env.CODEX_HOME = join(tmp, "codex");
  root = join(tmp, "my.proj");
  mkdirSync(root);
  dayDir = join(tmp, "codex", "sessions", "2026", "11", "01");
  mkdirSync(dayDir, { recursive: true });
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = savedEnv;
  rmSync(tmp, { recursive: true, force: true });
});

describe("codexProvider", () => {
  it("reads user, assistant and tool turns, filtering developer messages", async () => {
    writeFileSync(
      join(dayDir, `rollout-${STAMP}-${THREAD}.jsonl`),
      jsonl([
        {
          timestamp: "2026-11-01T10:00:00.000Z",
          type: "session_meta",
          payload: {
            id: THREAD,
            timestamp: "2026-11-01T10:00:00.000Z",
            cwd: root,
            originator: "codex_cli_rs",
            cli_version: "0.50.0",
          },
        },
        item({
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "injected instructions" }],
        }),
        item({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "fix the bug" }],
        }),
        item({ type: "reasoning", encrypted_content: "xxx" }),
        item({
          type: "function_call",
          name: "shell",
          arguments: '{"command":["ls"]}',
          call_id: "call_1",
        }),
        {
          timestamp: "2026-11-01T10:00:02.000Z",
          type: "event_msg",
          payload: { type: "agent_message", message: "dup" },
        },
        item({
          type: "function_call_output",
          call_id: "call_1",
          output: [{ type: "input_text", text: "a.txt" }],
        }),
        item({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Done." }],
        }),
      ]),
    );

    const t = await codexProvider.read({ kind: "codex", id: THREAD }, {});

    expect(t.turns).toEqual([
      { kind: "user", text: "fix the bug" },
      {
        kind: "tool",
        name: "shell",
        args: '{"command":["ls"]}',
        output: "a.txt",
      },
      { kind: "assistant", text: "Done." },
    ]);
    expect(t.summary).toMatchObject({
      ref: `codex:${THREAD}`,
      provider: "codex",
      status: "ok",
      title: "my.proj",
      cwd: root,
      formatVersion: "0.50.0",
    });
  });

  it("reads custom_tool_call / custom_tool_call_output as tool turns", async () => {
    writeFileSync(
      join(dayDir, `rollout-${STAMP}-${THREAD}.jsonl`),
      jsonl([
        {
          timestamp: "2026-11-01T10:00:00.000Z",
          type: "session_meta",
          payload: { id: THREAD, cwd: root, cli_version: "0.130.0" },
        },
        item({
          type: "custom_tool_call",
          status: "completed",
          call_id: "call_1",
          name: "exec",
          input: "ls -la",
        }),
        item({
          type: "custom_tool_call_output",
          call_id: "call_1",
          output: [{ type: "input_text", text: "a.txt" }],
        }),
      ]),
    );

    const t = await codexProvider.read({ kind: "codex", id: THREAD }, {});

    expect(t.turns).toEqual([
      { kind: "tool", name: "exec", args: "ls -la", output: "a.txt" },
    ]);
    expect(t.summary.status).toBe("ok");
  });

  it("lists a compressed rollout as unsupported without opening it", async () => {
    writeFileSync(
      join(dayDir, `rollout-${STAMP}-${THREAD}.jsonl.zst`),
      "(µ/ý not really zstd",
    );

    const { sessions, truncated } = await codexProvider.list({});

    expect(truncated).toBe(false);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      ref: `codex:${THREAD}`,
      provider: "codex",
      status: "unsupported",
      reason: "compressed",
    });
  });

  it("reads an archived session beyond the list scan cap", async () => {
    const meta = (id: string) =>
      jsonl([
        {
          timestamp: "2026-11-01T10:00:00.000Z",
          type: "session_meta",
          payload: { id, cwd: root, cli_version: "0.50.0" },
        },
      ]);
    for (let i = 0; i < 2000; i++) {
      const id = `filler-${String(i).padStart(4, "0")}`;
      writeFileSync(join(dayDir, `rollout-${STAMP}-${id}.jsonl`), meta(id));
    }
    const archived = join(tmp, "codex", "archived_sessions");
    mkdirSync(archived);
    writeFileSync(
      join(archived, `rollout-${STAMP}-${THREAD}.jsonl`),
      meta(THREAD) +
        jsonl([
          item({
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "old work" }],
          }),
        ]),
    );

    expect((await codexProvider.list({ limit: 2001 })).truncated).toBe(true);

    const t = await codexProvider.read({ kind: "codex", id: THREAD }, {});
    expect(t.summary).toMatchObject({
      ref: `codex:${THREAD}`,
      status: "ok",
      archived: true,
    });
    expect(t.turns).toEqual([{ kind: "user", text: "old work" }]);
  }, 20_000);
});
