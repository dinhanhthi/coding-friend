import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { acquireLease } from "../lease.js";
import {
  claimAttempt,
  createAsk,
  createTask,
  listAttempts,
  readAnswer,
  readTask,
  recordCancel,
  recordAttemptRunner,
  recordDone,
  recordPause,
  recordResult,
  recordRunner,
  reply,
  SPAWN_GRACE_MS,
} from "../store.js";

let root: string;

/** A child that has already exited and been reaped: its pid is dead. */
function deadPid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid;
}

/** Attempt 1 on claude, its runner dead, paused on a quota. */
function pausedTask(): string {
  const id = newTask();
  claimAttempt(id, { n: 1, provider: "claude", kind: "fresh" });
  recordAttemptRunner(id, 1, {
    pid: deadPid(),
    startedAt: new Date().toISOString(),
  });
  recordPause(id, 1, { provider: "claude", resetsAt: null, source: "test" });
  return id;
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
  root = mkdtempSync(join(tmpdir(), "cf-orchestrator-store-"));
  vi.stubEnv("CF_ORCHESTRATOR_DIR", root);
});

afterEach(() => {
  vi.useRealTimers();
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

    const orphan = newTask();
    recordRunner(orphan, {
      pid: deadPid(),
      startedAt: new Date().toISOString(),
    });
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

  it("a dead runner with a pause on the latest attempt is paused, not interrupted", () => {
    expect(readTask(pausedTask()).state).toBe("paused");
  });

  it("claiming attempt n+1 after a pause ends paused", () => {
    const id = pausedTask();
    claimAttempt(id, { n: 2, provider: "codex", kind: "switch" });
    expect(readTask(id).state).toBe("queued");
  });

  it("an abandoned claim past the spawn grace stays paused and keeps the lease", () => {
    const holder = pausedTask();
    claimAttempt(holder, { n: 2, provider: "codex", kind: "switch" });
    acquireLease(root, holder);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + SPAWN_GRACE_MS + 1000);

    expect(readTask(holder).state).toBe("paused");
    expect(() => acquireLease(root, newTask())).toThrow(
      expect.objectContaining({ code: "LEASE_HELD" }),
    );
  });

  it("cancel wins over paused and is accepted on a paused task", () => {
    const id = pausedTask();
    recordCancel(id);
    expect(readTask(id).state).toBe("cancelled");
  });

  it("a paused holder keeps the writer lease until it is cancelled", () => {
    const holder = pausedTask();
    acquireLease(root, holder);
    // Past the spawn grace: only the pause keeps the lease held.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + SPAWN_GRACE_MS + 1000);
    const other = newTask();
    expect(() => acquireLease(root, other)).toThrow(
      expect.objectContaining({ code: "LEASE_HELD" }),
    );
    recordCancel(holder);
    expect(() => acquireLease(root, other)).not.toThrow();
  });

  it("claims an attempt once; a symlinked runs/<id> is never written or read", () => {
    const id = newTask();
    const claim = { n: 1, provider: "claude" as const, kind: "fresh" as const };
    expect(claimAttempt(id, claim)).toBe(true);
    expect(claimAttempt(id, claim)).toBe(false);

    const linked = newTask();
    const elsewhere = mkdtempSync(join(root, "elsewhere-"));
    mkdirSync(join(elsewhere, "1"));
    writeFileSync(
      join(elsewhere, "1", "attempt.json"),
      JSON.stringify({
        schemaVersion: 1,
        n: 1,
        provider: "claude",
        kind: "fresh",
        createdAt: "x",
      }),
    );
    symlinkSync(elsewhere, join(root, "runs", linked));

    expect(() => claimAttempt(linked, { ...claim, n: 2 })).toThrow(
      expect.objectContaining({ code: "INTERNAL" }),
    );
    expect(readdirSync(elsewhere)).toEqual(["1"]);
    expect(listAttempts(linked)).toEqual([]);
    expect(readTask(linked).attempts).toBeUndefined();
  });

  it("rejects path-traversal ids with USAGE", () => {
    const usage = expect.objectContaining({ code: "USAGE" });
    expect(() => readTask("../x")).toThrow(usage);
    expect(() => reply("../x", "a")).toThrow(usage);
  });
});
