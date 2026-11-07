import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CliError } from "../../output.js";
import { locateCodexRollout } from "../../transcript-codex.js";
import { claudeProjectDirName } from "../../paths.js";
import { encodeCursor, followTask } from "../follow.js";
import {
  claimAttempt,
  createTask,
  recordAttemptRunner,
  recordAttemptSession,
  recordDone,
  recordResult,
  recordRunner,
  recordSession,
  type Provider,
} from "../store.js";

vi.mock("../../transcript-codex.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../../transcript-codex.js")>();
  return { ...actual, locateCodexRollout: vi.fn(actual.locateCodexRollout) };
});

const SID = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const THREAD = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const TOKEN = "ghp_" + "a1".repeat(18);

let tmp: string;
let checkout: string;
let projectDir: string;

function newTask(provider: Provider = "claude"): string {
  return createTask({ provider, prompt: "do it", readOnly: true, checkout }).id;
}

function lines(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r) + "\n").join("");
}

const user = (text: string) => ({
  type: "user",
  message: { role: "user", content: text },
});

const assistant = (content: unknown[]) => ({
  type: "assistant",
  message: { role: "assistant", content },
});

function transcriptFile(sid: string): string {
  mkdirSync(projectDir, { recursive: true });
  return join(projectDir, `${sid}.jsonl`);
}

/** A child that has already exited and been reaped: its pid is dead. */
function deadPid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof CliError ? err.code : String(err);
  }
  return undefined;
}

beforeEach(() => {
  vi.mocked(locateCodexRollout).mockClear();
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-follow-")));
  vi.stubEnv("CF_ORCHESTRATOR_DIR", join(tmp, "orch"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", join(tmp, "claude"));
  vi.stubEnv("CODEX_HOME", join(tmp, "codex"));
  checkout = join(tmp, "repo");
  mkdirSync(checkout);
  projectDir = join(
    tmp,
    "claude",
    "projects",
    claudeProjectDirName(checkout).name,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tmp, { recursive: true, force: true });
});

describe("followTask", () => {
  it("returns only the turns of appended bytes, redacted, without tool output", () => {
    // C1 task: no attempts[], the root session.json is attempt 1.
    const id = newTask();
    recordSession(id, { sessionId: SID });
    expect(followTask(id).live).toEqual({ supported: true, status: "pending" });

    const file = transcriptFile(SID);
    writeFileSync(
      file,
      lines([
        user("hello"),
        assistant([
          { type: "text", text: `token ${TOKEN}` },
          {
            type: "tool_use",
            id: "t1",
            name: "Bash",
            input: { command: "ls" },
          },
        ]),
      ]),
    );
    const first = followTask(id);
    expect(first.live).toEqual({ supported: true, status: "ok" });
    expect(first.attempt).toEqual({ n: 1, provider: "claude", kind: "fresh" });
    expect(first.turns).toEqual([
      { kind: "user", text: "hello" },
      { kind: "assistant", text: "token [REDACTED:github]" },
      { kind: "tool", name: "Bash", args: '{"command":"ls"}' },
    ]);
    expect(first.redactions.total).toBe(1);
    expect(first.cursor).toBe(encodeCursor(1, SID, statSync(file).size));
    expect(first.more).toBe(false);

    // A tool result (its output never shown) and a cut last line.
    const next = JSON.stringify(user(`next ${TOKEN}`));
    appendFileSync(
      file,
      lines([
        {
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "secret" },
            ],
          },
        },
      ]) + next.slice(0, 10),
    );
    const second = followTask(id, first.cursor);
    expect(second.turns).toEqual([]);

    appendFileSync(file, next.slice(10) + "\n");
    const third = followTask(id, second.cursor);
    expect(third.turns).toEqual([
      { kind: "user", text: "next [REDACTED:github]" },
    ]);
    expect(third.cursor).toBe(encodeCursor(1, SID, statSync(file).size));
  });

  it("rejects a malformed cursor or one whose session id is not this task's", () => {
    const id = newTask();
    claimAttempt(id, { n: 1, provider: "claude", kind: "fresh" });
    recordAttemptSession(id, 1, { sessionId: SID });
    const other = newTask();
    claimAttempt(other, { n: 1, provider: "claude", kind: "fresh" });
    recordAttemptSession(other, 1, { sessionId: OTHER });

    for (const bad of [
      "v2",
      "v1.",
      `v1.0.${SID}.0`,
      `v1.1.${SID}.-1`,
      `v1.1.../x.0`,
      `v1.1.${OTHER}.0`, // another task's session
      `v1.2.${SID}.0`, // no attempt 2
    ]) {
      expect(
        codeOf(() => followTask(id, bad)),
        bad,
      ).toBe("INVALID_ARGS");
    }
    expect(codeOf(() => followTask(id, `v1.1.${SID}.0`))).toBeUndefined();
  });

  it("keeps the offset when a later attempt resumes the same session, restarts at 0 on a new one", () => {
    const id = newTask();
    claimAttempt(id, { n: 1, provider: "claude", kind: "fresh" });
    recordAttemptSession(id, 1, { sessionId: SID });
    const file = transcriptFile(SID);
    // Longer than the rollout below: a kept offset would overshoot it.
    const pad = {
      type: "attachment",
      attachment: { content: "x".repeat(2000) },
    };
    writeFileSync(file, lines([pad, user("one")]));
    const first = followTask(id);
    expect(first.turns).toEqual([{ kind: "user", text: "one" }]);

    // Attempt 2 resumes SID: it appends to the same file. Attempt 1 is read
    // to its end first (more: true), then the cursor moves on at that offset.
    claimAttempt(id, {
      n: 2,
      provider: "claude",
      kind: "resume",
      resumeSessionId: SID,
    });
    recordAttemptSession(id, 2, { sessionId: SID });
    appendFileSync(file, lines([user("two")]));
    const second = followTask(id, first.cursor);
    expect(second.attempt?.n).toBe(1);
    expect(second.turns).toEqual([{ kind: "user", text: "two" }]);
    expect(second.more).toBe(true);
    const moved = followTask(id, second.cursor);
    expect(moved.attempt).toEqual({ n: 2, provider: "claude", kind: "resume" });
    expect(moved.turns).toEqual([]);
    expect(moved.cursor).toBe(encodeCursor(2, SID, statSync(file).size));
    expect(moved.more).toBe(false);

    // Attempt 3 switches to codex: its rollout is read from offset 0.
    claimAttempt(id, { n: 3, provider: "codex", kind: "switch" });
    recordAttemptSession(id, 3, { sessionId: THREAD });
    const day = join(tmp, "codex", "sessions", "2026", "11", "05");
    mkdirSync(day, { recursive: true });
    const rollout = join(day, `rollout-2026-11-05T10-00-00-${THREAD}.jsonl`);
    writeFileSync(
      rollout,
      lines([
        {
          type: "session_meta",
          payload: { id: THREAD, cwd: checkout, cli_version: "0.50.0" },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "three" }],
          },
        },
      ]),
    );
    const third = followTask(id, moved.cursor);
    expect(third.attempt).toEqual({ n: 3, provider: "codex", kind: "switch" });
    expect(third.turns).toEqual([{ kind: "user", text: "three" }]);
    expect(third.reset).toBe(false);
    expect(third.cursor).toBe(encodeCursor(3, THREAD, statSync(rollout).size));
  });

  it("reads again from 0 when the file is shorter than the cursor", () => {
    const id = newTask();
    recordSession(id, { sessionId: SID });
    const file = transcriptFile(SID);
    writeFileSync(file, lines([user("a long first message"), user("two")]));
    const first = followTask(id);
    writeFileSync(file, lines([user("new")]));
    const again = followTask(id, first.cursor);
    expect(again.reset).toBe(true);
    expect(again.turns).toEqual([{ kind: "user", text: "new" }]);
    expect(again.cursor).toBe(encodeCursor(1, SID, statSync(file).size));
  });

  it("does not follow a session id whose transcript is in another project's dir", () => {
    const id = newTask();
    recordSession(id, { sessionId: SID });
    const other = join(tmp, "claude", "projects", "-elsewhere-other-repo");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, `${SID}.jsonl`), lines([user("not yours")]));
    const d = followTask(id);
    expect(d.turns).toEqual([]);
    expect(d.live).toEqual({ supported: true, status: "pending" });
  });

  it("locates the rollout once per attempt across the polls of one follow", () => {
    const id = newTask("codex");
    claimAttempt(id, { n: 1, provider: "codex", kind: "fresh" });
    recordAttemptSession(id, 1, { sessionId: THREAD });
    const day = join(tmp, "codex", "sessions", "2026", "11", "05");
    mkdirSync(day, { recursive: true });
    const rollout = join(day, `rollout-2026-11-05T10-00-00-${THREAD}.jsonl`);
    const said = (text: string) => ({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    writeFileSync(
      rollout,
      lines([
        {
          type: "session_meta",
          payload: { id: THREAD, cwd: checkout, cli_version: "0.50.0" },
        },
        said("one"),
      ]),
    );
    const cache = new Map();
    const first = followTask(id, undefined, cache);
    appendFileSync(rollout, lines([said("two")]));
    const second = followTask(id, first.cursor, cache);
    const third = followTask(id, second.cursor, cache);
    expect(first.turns).toEqual([{ kind: "user", text: "one" }]);
    expect(second.turns).toEqual([{ kind: "user", text: "two" }]);
    expect(third.turns).toEqual([]);
    expect(locateCodexRollout).toHaveBeenCalledTimes(1);
  });

  it("reports opencode, and a finished task without a transcript, as unsupported", () => {
    const oc = newTask("opencode");
    claimAttempt(oc, { n: 1, provider: "opencode", kind: "fresh" });
    const o = followTask(oc);
    expect(o.attempt).toEqual({ n: 1, provider: "opencode", kind: "fresh" });
    expect(o.live.supported).toBe(false);
    expect(o.live.status).toBe("unsupported");

    const id = newTask();
    claimAttempt(id, { n: 1, provider: "claude", kind: "fresh" });
    recordAttemptSession(id, 1, { sessionId: SID });
    recordResult(id, { exitCode: 0, outcome: "succeeded" });
    const done = followTask(id);
    expect(done.terminal).toBe(true);
    expect(done.live).toEqual({
      supported: false,
      status: "unsupported",
      reason: "transcript not found",
    });
    expect(done.more).toBe(false);
  });

  it("is not terminal after cf done until the runner has exited or written result.json", () => {
    // The worker calls cf done before its last turn: the runner still runs.
    const id = newTask();
    claimAttempt(id, { n: 1, provider: "claude", kind: "fresh" });
    recordAttemptSession(id, 1, { sessionId: SID });
    recordAttemptRunner(id, 1, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    recordDone(id, { outcome: "succeeded", summary: "ok" });
    const early = followTask(id);
    expect(early.task.state).toBe("succeeded");
    expect(early.terminal).toBe(false);
    expect(early.live).toEqual({ supported: true, status: "pending" });

    recordResult(id, { exitCode: 0, outcome: "succeeded", lastMessage: "bye" });
    const end = followTask(id);
    expect(end.terminal).toBe(true);
    expect(end.task.result?.lastMessage).toBe("bye");
    expect(end.live.reason).toBe("transcript not found");

    // C1 task whose runner died without result.json.
    const c1 = newTask();
    recordRunner(c1, { pid: deadPid(), startedAt: new Date().toISOString() });
    recordDone(c1, { outcome: "succeeded", summary: "ok" });
    expect(followTask(c1).terminal).toBe(true);
  });
});
