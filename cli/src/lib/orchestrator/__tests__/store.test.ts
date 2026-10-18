import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import {
  createAsk,
  createTask,
  readAnswer,
  readTask,
  recordCancel,
  recordDone,
  recordResult,
  recordRunner,
  reply,
} from "../store.js";

let root: string;

function newTask(): string {
  return createTask({
    provider: "claude",
    prompt: "do it",
    readOnly: false,
    checkout: root,
  }).id;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-orchestrator-store-"));
  vi.stubEnv("CF_ORCHESTRATOR_DIR", root);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("orchestrator store", () => {
  it("ask → reply → readAnswer round-trips; re-asking reuses the qid", () => {
    const id = newTask();
    const { qid, answer } = createAsk(id, "Which DB?");
    expect(answer).toBeUndefined();
    expect(readTask(id).pendingAsks.map((a) => a.qid)).toEqual([qid]);
    expect(createAsk(id, "Which DB?")).toEqual({ qid });

    reply(qid, "sqlite");
    expect(readAnswer(qid)).toBe("sqlite");
    expect(createAsk(id, "Which DB?")).toEqual({ qid, answer: "sqlite" });
    expect(readTask(id).pendingAsks).toEqual([]);
  });

  it("explicit done wins over the inferred result; dead runner without a final record is interrupted", () => {
    const finished = newTask();
    recordResult(finished, { exitCode: 0, outcome: "succeeded" });
    recordDone(finished, { outcome: "failed", summary: "tests red" });
    expect(readTask(finished).state).toBe("failed");

    const cancelled = newTask();
    recordCancel(cancelled);
    expect(() =>
      recordDone(cancelled, { outcome: "succeeded", summary: "ok" }),
    ).toThrow(expect.objectContaining({ code: "ALREADY_FINISHED" }));
    expect(readTask(cancelled).state).toBe("cancelled");

    // A child that has already exited and been reaped: its pid is dead.
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
    const orphan = newTask();
    recordRunner(orphan, { pid: deadPid, startedAt: new Date().toISOString() });
    expect(readTask(orphan).state).toBe("interrupted");
  });

  it("rejects path-traversal ids with USAGE", () => {
    const usage = expect.objectContaining({ code: "USAGE" });
    expect(() => readTask("../x")).toThrow(usage);
    expect(() => reply("../x", "a")).toThrow(usage);
  });
});
