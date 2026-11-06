import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTask, readTask } from "../../lib/orchestrator/store.js";
import { askCommand } from "../ask.js";
import { doneCommand } from "../done.js";
import { replyCommand } from "../reply.js";

let root: string;
let stdout: string[];

function envelope(): Record<string, any> {
  return JSON.parse(stdout.join(""));
}

function newTask(): string {
  return createTask({
    provider: "claude",
    prompt: "do it",
    readOnly: false,
    checkout: root,
  }).id;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-ask-reply-done-"));
  vi.stubEnv("CF_ORCHESTRATOR_DIR", root);
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

describe("cf ask / reply / done", () => {
  it("ask without an answer times out with ASK_TIMEOUT naming the qid", async () => {
    const task = newTask();
    await askCommand("Which DB?", { task, timeout: "1", json: true });
    const env = envelope();
    expect(env).toMatchObject({ ok: false, error: { code: "ASK_TIMEOUT" } });
    const [ask] = readTask(task).pendingAsks;
    expect(env.error.message).toContain(ask.qid);
    expect(process.exitCode).toBe(1);
  });

  it("done twice is ALREADY_FINISHED", async () => {
    const task = newTask();
    const flags = { task, outcome: "succeeded", summary: "ok", json: true };
    await doneCommand(flags);
    expect(envelope()).toMatchObject({
      ok: true,
      data: { taskId: task, outcome: "succeeded" },
    });

    stdout = [];
    await doneCommand(flags);
    expect(envelope()).toMatchObject({
      ok: false,
      error: { code: "ALREADY_FINISHED" },
    });
  });

  it("reply to an unknown qid is NOT_FOUND", async () => {
    await replyCommand("abcdefgh", "yes", { json: true });
    expect(envelope()).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
