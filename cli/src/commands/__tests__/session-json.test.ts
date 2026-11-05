import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { claudeProjectDirName } from "../../lib/paths.js";
import {
  sessionExportCommand,
  sessionListCommand,
  sessionShowCommand,
} from "../session.js";

const UUID = "11111111-2222-4333-8444-555555555555";
const BIG = "22222222-3333-4444-8555-666666666666";
const THREAD = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

// Fake tokens, built by concatenation so no real-looking secret sits in the
// source.
const GH = "ghp_" + "Q".repeat(36);
const ANT = "sk-ant-api03-" + "y".repeat(24);
const PW = "pw" + "Z".repeat(20);
const AWS = "AKIA" + "B".repeat(16);
const SLACK = "xoxb-" + "C".repeat(12);
const OUTPUT_MARK = "TOOL-OUTPUT-BODY";

// Distinctive pieces of each token: a leaked head or tail matches one.
const LEAKS = ["ghp_Q", "QQQQQQ", "sk-ant", "yyyyyy", "pwZZ", "ZZZZZZ"];
const LEAKS_CUT = ["AKIA", "BBBBBB", "xoxb-", "CCCCCC"];

function jsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

describe("session list|show|export --json", () => {
  let tmp: string;
  let root: string;

  async function json(fn: () => Promise<void>) {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      await fn();
    } finally {
      vi.mocked(process.stdout.write).mockRestore();
    }
    expect(writes).toHaveLength(1);
    return { env: JSON.parse(writes[0]), raw: writes[0] };
  }

  function expectNoLeak(raw: string): void {
    for (const piece of [...LEAKS, ...LEAKS_CUT]) {
      expect(raw).not.toContain(piece);
    }
  }

  function claudeDir(): string {
    const dir = join(
      tmp,
      "claude",
      "projects",
      claudeProjectDirName(root).name,
    );
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  beforeEach(() => {
    process.exitCode = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-sessionjson-")));
    const home = join(tmp, "home");
    mkdirSync(home);
    vi.stubEnv("HOME", home);
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(tmp, "claude"));
    vi.stubEnv("CODEX_HOME", join(tmp, "codex"));
    root = join(home, "proj");
    mkdirSync(root);

    const base = { cwd: root, version: "2.1.0", sessionId: UUID };
    // Token starts before the 120-char cut of the args summary and ends after.
    const command = "echo " + "a".repeat(92) + " " + AWS;
    writeFileSync(
      join(claudeDir(), `${UUID}.jsonl`),
      jsonl([
        {
          ...base,
          type: "user",
          timestamp: "2026-11-01T10:00:01.000Z",
          message: { role: "user", content: `deploy with ${GH} please` },
        },
        {
          ...base,
          type: "assistant",
          timestamp: "2026-11-01T10:00:02.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: `Using ${ANT} now.` },
              {
                type: "tool_use",
                id: "t1",
                name: "Login",
                input: { user: "me", password: PW },
              },
              { type: "tool_use", id: "t2", name: "Bash", input: { command } },
            ],
          },
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
                tool_use_id: "t2",
                content: `${OUTPUT_MARK} token=${SLACK}`,
              },
            ],
          },
        },
      ]),
    );

    const day = join(tmp, "codex", "sessions", "2026", "11", "02");
    mkdirSync(day, { recursive: true });
    writeFileSync(
      join(day, `rollout-2026-11-02T10-00-00-${THREAD}.jsonl`),
      jsonl([
        {
          timestamp: "2026-11-02T10:00:00.000Z",
          type: "session_meta",
          payload: {
            id: THREAD,
            timestamp: "2026-11-02T10:00:00.000Z",
            cwd: root,
            cli_version: "0.50.0",
          },
        },
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("list merges Claude and Codex rows with redacted titles", async () => {
    const { env, raw } = await json(() => sessionListCommand({ json: true }));
    expect(env).toMatchObject({ ok: true, error: null });
    expect(env.data.project).toBeNull();
    expect(env.data.truncated).toBe(false);
    const refs = env.data.sessions.map((s: { ref: string }) => s.ref);
    expect(refs).toEqual(expect.arrayContaining([`claude:${UUID}`]));
    expect(refs).toEqual(expect.arrayContaining([`codex:${THREAD}`]));
    const claude = env.data.sessions.find(
      (s: { ref: string }) => s.ref === `claude:${UUID}`,
    );
    expect(claude.title).toContain("[REDACTED:github]");
    expectNoLeak(raw);
  });

  it("show redacts text and tool args, with and without tool output", async () => {
    const plain = await json(() =>
      sessionShowCommand(`claude:${UUID}`, { json: true }),
    );
    expect(plain.env).toMatchObject({ ok: true, error: null });
    expect(plain.env.data).toMatchObject({
      ref: `claude:${UUID}`,
      provider: "claude",
      offset: 0,
      nextOffset: null,
      truncated: false,
    });
    expect(plain.env.data.redactions.total).toBeGreaterThan(0);
    expect(plain.raw).not.toContain(OUTPUT_MARK);
    expectNoLeak(plain.raw);

    const withOutput = await json(() =>
      sessionShowCommand(`claude:${UUID}`, {
        json: true,
        includeToolOutput: true,
      }),
    );
    expect(withOutput.raw).toContain(OUTPUT_MARK);
    expectNoLeak(withOutput.raw);
  });

  it("export returns redacted Markdown, tool output only on request", async () => {
    const plain = await json(() =>
      sessionExportCommand(`claude:${UUID}`, { json: true }),
    );
    expect(plain.env).toMatchObject({ ok: true, error: null });
    const data = plain.env.data;
    expect(data).toMatchObject({
      ref: `claude:${UUID}`,
      truncated: false,
      filter: { name: null, status: "none" },
    });
    expect(data.bytes).toBe(Buffer.byteLength(data.markdown));
    expect(data.redactions.total).toBeGreaterThan(0);
    expect(data.markdown).toContain("- tool: Login");
    expect(data.markdown).not.toContain(OUTPUT_MARK);
    expectNoLeak(plain.raw);

    const withOutput = await json(() =>
      sessionExportCommand(`claude:${UUID}`, {
        json: true,
        includeToolOutput: true,
      }),
    );
    expect(withOutput.env.data.markdown).toContain(OUTPUT_MARK);
    expectNoLeak(withOutput.raw);
  });

  it("an invalid ref is INVALID_ARGS", async () => {
    for (const ref of ["bogus", "claude:../x"]) {
      const { env } = await json(() => sessionShowCommand(ref, { json: true }));
      expect(env).toMatchObject({
        ok: false,
        data: null,
        error: { code: "INVALID_ARGS" },
      });
      expect(process.exitCode).toBe(1);
    }
  });

  it("show pages a very large turn and stays under 8 MiB", async () => {
    const huge = "lorem ipsum ".repeat(180_000); // ~2 MiB
    writeFileSync(
      join(claudeDir(), `${BIG}.jsonl`),
      jsonl([
        {
          cwd: root,
          sessionId: BIG,
          type: "user",
          timestamp: "2026-11-01T11:00:00.000Z",
          message: { role: "user", content: huge },
        },
        {
          cwd: root,
          sessionId: BIG,
          type: "assistant",
          timestamp: "2026-11-01T11:00:01.000Z",
          message: { role: "assistant", content: "ok" },
        },
      ]),
    );
    const { env, raw } = await json(() =>
      sessionShowCommand(`claude:${BIG}`, { json: true, limit: "1" }),
    );
    expect(env.ok).toBe(true);
    expect(env.data).toMatchObject({
      truncated: true,
      nextOffset: 1,
      total: 2,
      limit: 1,
    });
    expect(Buffer.byteLength(raw)).toBeLessThan(8 * 1024 * 1024);
  });
});
