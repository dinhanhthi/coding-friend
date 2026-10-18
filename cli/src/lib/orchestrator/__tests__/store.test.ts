import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
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

  it("a qid planted in another task is ambiguous; --task picks the asking task", () => {
    const asker = newTask();
    const { qid } = createAsk(asker, "Which DB?");
    const planter = newTask();
    const plant = (id: string, taskId: string) => {
      const ask = {
        schemaVersion: 1,
        qid,
        taskId,
        question: "x",
        createdAt: "x",
      };
      writeFileSync(
        join(root, "tasks", id, "asks", `${qid}.json`),
        JSON.stringify(ask),
      );
    };
    createAsk(planter, "own question"); // creates its asks/ dir
    plant(planter, planter);
    // A copy whose ids disagree with its location is ignored, not ambiguous.
    const liar = newTask();
    createAsk(liar, "own question");
    plant(liar, asker);

    expect(() => reply(qid, "sqlite")).toThrow(
      expect.objectContaining({ code: "USAGE" }),
    );
    expect(() => reply(qid, "sqlite", liar)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    reply(qid, "sqlite", asker);
    expect(readAnswer(qid, asker)).toBe("sqlite");
    expect(
      existsSync(join(root, "tasks", planter, "answers", `${qid}.json`)),
    ).toBe(false);
  });

  it("refuses to write an answer through a symlinked answers/ dir", () => {
    const id = newTask();
    const { qid } = createAsk(id, "Which DB?");
    const elsewhere = mkdtempSync(join(root, "elsewhere-"));
    symlinkSync(elsewhere, join(root, "tasks", id, "answers"));

    expect(() => reply(qid, "sqlite")).toThrow(
      expect.objectContaining({ code: "INTERNAL" }),
    );
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it("rejects path-traversal ids with USAGE", () => {
    const usage = expect.objectContaining({ code: "USAGE" });
    expect(() => readTask("../x")).toThrow(usage);
    expect(() => reply("../x", "a")).toThrow(usage);
  });
});
