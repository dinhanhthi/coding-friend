import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { claudeProjectDirName, encodeProjectPath } from "../paths.js";
import { claudeProvider } from "../transcript-claude.js";

const savedEnv = process.env.CLAUDE_CONFIG_DIR;
let tmp: string;
let root: string;
let projectDir: string;

const UUID = "11111111-2222-4333-8444-555555555555";

function jsonl(records: unknown[]): string {
  return records
    .map((r) => (typeof r === "string" ? r : JSON.stringify(r)))
    .join("\n");
}

function writeTranscript(dir: string, id: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.jsonl`);
  writeFileSync(file, body);
  return file;
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-transcript-claude-")));
  process.env.CLAUDE_CONFIG_DIR = join(tmp, "claude");
  root = join(tmp, "my.proj");
  mkdirSync(root);
  projectDir = join(tmp, "claude", "projects", claudeProjectDirName(root).name);
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  rmSync(tmp, { recursive: true, force: true });
});

describe("claudeProvider", () => {
  it("reads user, assistant and tool turns, skipping sidechain, meta and garbage", async () => {
    const base = { cwd: root, version: "2.1.0", sessionId: UUID };
    writeTranscript(
      projectDir,
      UUID,
      jsonl([
        { type: "summary", summary: "ignored" },
        {
          ...base,
          type: "user",
          isMeta: true,
          timestamp: "2026-11-01T10:00:00.000Z",
          message: { role: "user", content: "meta caveat" },
        },
        {
          ...base,
          type: "user",
          timestamp: "2026-11-01T10:00:01.000Z",
          message: { role: "user", content: "fix the bug" },
        },
        {
          ...base,
          type: "assistant",
          timestamp: "2026-11-01T10:00:02.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "hmm" },
              { type: "text", text: "Looking." },
              {
                type: "tool_use",
                id: "toolu_1",
                name: "Bash",
                input: { command: "ls" },
              },
            ],
          },
        },
        "{not json",
        {
          ...base,
          type: "assistant",
          isSidechain: true,
          message: { role: "assistant", content: "subagent text" },
        },
        {
          ...base,
          type: "user",
          timestamp: "2026-11-01T10:00:03.000Z",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_1",
                content: [{ type: "text", text: "a.txt" }],
              },
            ],
          },
        },
        {
          ...base,
          type: "assistant",
          timestamp: "2026-11-01T10:00:04.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Done." }],
          },
        },
      ]),
    );

    const t = await claudeProvider.read({ kind: "claude", id: UUID }, {});

    expect(t.turns).toEqual([
      { kind: "user", text: "fix the bug" },
      { kind: "assistant", text: "Looking." },
      {
        kind: "tool",
        name: "Bash",
        args: JSON.stringify({ command: "ls" }),
        output: "a.txt",
      },
      { kind: "assistant", text: "Done." },
    ]);
    expect(t.summary).toMatchObject({
      ref: `claude:${UUID}`,
      status: "ok",
      title: "fix the bug",
      cwd: root,
      formatVersion: "2.1.0",
    });
  });

  it("reports a garbage file as unsupported without throwing", async () => {
    writeTranscript(projectDir, UUID, "garbage\n\u0000\u0001 not json\n");

    const { sessions } = await claudeProvider.list({});
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      ref: `claude:${UUID}`,
      status: "unsupported",
    });
    expect(sessions[0].reason).toBeTruthy();

    const t = await claudeProvider.read({ kind: "claude", id: UUID }, {});
    expect(t.summary.status).toBe("unsupported");
    expect(t.turns).toEqual([]);
  });

  it("lists a transcript whose first user line is over 64 KiB", async () => {
    const image = {
      type: "image",
      source: { type: "base64", data: "A".repeat(80 * 1024) },
    };
    const cwd = join(root, "sub");
    writeTranscript(
      `${projectDir}-sub`,
      UUID,
      jsonl([
        {
          type: "user",
          cwd,
          version: "2.1.0",
          timestamp: "2026-11-01T10:00:00.000Z",
          message: {
            role: "user",
            content: [image, { type: "text", text: "what is this?" }],
          },
        },
      ]),
    );

    const all = await claudeProvider.list({});
    expect(all.sessions).toHaveLength(1);
    expect(all.sessions[0]).toMatchObject({
      ref: `claude:${UUID}`,
      status: "ok",
      title: "[image]\nwhat is this?",
      cwd,
      startedAt: "2026-11-01T10:00:00.000Z",
      formatVersion: "2.1.0",
    });

    const scoped = await claudeProvider.list({ projectDir: root });
    expect(scoped.sessions.map((s) => s.ref)).toEqual([`claude:${UUID}`]);
  });

  it("lists one row for the same uuid in two project dirs", async () => {
    const body = jsonl([
      {
        type: "user",
        cwd: root,
        timestamp: "2026-11-01T10:00:00.000Z",
        message: { role: "user", content: "hello" },
      },
    ]);
    const legacyDir = join(tmp, "claude", "projects", encodeProjectPath(root));
    expect(legacyDir).not.toBe(projectDir);
    const older = writeTranscript(legacyDir, UUID, body);
    utimesSync(older, new Date(2026, 0, 1), new Date(2026, 0, 1));
    writeTranscript(projectDir, UUID, body);

    const all = await claudeProvider.list({});
    expect(all.sessions.map((s) => s.ref)).toEqual([`claude:${UUID}`]);

    const scoped = await claudeProvider.list({ projectDir: root });
    expect(scoped.sessions.map((s) => s.ref)).toEqual([`claude:${UUID}`]);
  });
});
