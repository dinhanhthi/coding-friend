import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { spawn, spawnSync } from "child_process";
import { acquireLease, releaseLease } from "../lease.js";
import { createTask, newId, recordRunner, SPAWN_GRACE_MS } from "../store.js";
import {
  chefDir,
  chefStatus,
  claimChefCheckout,
  claimWake,
  consecutiveRejectedWakes,
  createChef,
  isOrphanedClaim,
  listWakes,
  markClaimFailed,
  nextSeq,
  readKnownHead,
  readLatestBaseline,
  recordEvent,
  recordResume,
  recordWakeResult,
  releaseChefCheckout,
} from "../chef-store.js";

let root: string;
let checkout: string;

/** A child that has already exited and been reaped: its pid is dead. */
function deadPid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid;
}

function chefInput(id: string): Parameters<typeof createChef>[0] {
  return {
    id,
    provider: "claude",
    planDir: join(checkout, "docs/plans/x"),
    checkout,
    isGitRepo: true,
    gitDir: join(checkout, ".git"),
    branch: "main",
    headAtStart: "a".repeat(40),
    sessionUuid: "123e4567-e89b-12d3-a456-426614174000",
    limits: {
      minWakeMinutes: 5,
      maxWakesPerDay: 48,
      maxTasksPerWake: 3,
      maxConcurrentTasks: 2,
      schedule: [],
      notify: true,
    },
    taskPolicy: {
      onQuota: "wait-then-switch",
      waitMinutes: 30,
      fallback: [],
      noFallback: false,
    },
    binaries: { git: "/usr/bin/git", claude: "/x/claude" },
    commit: true,
    hooks: { hooksPath: null, files: [] },
    configDigest: "d",
    baseline: { fingerprint: { head: "a".repeat(40) }, snapshot: {} },
  };
}

function newChef(): string {
  const id = newId();
  createChef(chefInput(id));
  return id;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-chef-store-"));
  checkout = join(root, "repo");
  mkdirSync(checkout);
  vi.stubEnv("CF_ORCHESTRATOR_DIR", root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("chef store", () => {
  it("createChef refuses an id that already has a chef", () => {
    const id = newChef();
    expect(() => createChef(chefInput(id))).toThrow(/already exists/);
  });

  it("createChef refuses a symlinked chefs/<id> and writes nothing through it", () => {
    newChef(); // chefs/ exists
    const id = newId();
    const target = join(root, "elsewhere");
    mkdirSync(target);
    symlinkSync(target, chefDir(id));
    expect(() => createChef(chefInput(id))).toThrow(/symlink/);
    expect(existsSync(join(target, "chef.json"))).toBe(false);
  });

  it("createChef refuses an id that names a task", () => {
    const taskId = newId();
    mkdirSync(join(root, "tasks", taskId), { recursive: true });
    expect(() => createChef(chefInput(taskId))).toThrow(/task id/);
  });

  it("chef ids go through assertId with the chef id kind", () => {
    expect(() => chefDir("../x")).toThrow(/Invalid chef id/);
  });

  it("recordEvent fires once per key", () => {
    const id = newChef();
    expect(recordEvent(id, "start")).toBe(true);
    expect(recordEvent(id, "start")).toBe(false);
  });

  it("claimWake(n) succeeds once", () => {
    const id = newChef();
    expect(claimWake(id, 1)).toBe(true);
    expect(claimWake(id, 1)).toBe(false);
  });

  it("one chef per checkout until its own release", () => {
    const id = newId();
    claimChefCheckout(checkout, id);
    expect(() => claimChefCheckout(checkout, newId())).toThrow(
      expect.objectContaining({ code: "LEASE_HELD" }),
    );
    releaseChefCheckout(checkout, newId()); // not the holder: no-op
    expect(() => claimChefCheckout(checkout, newId())).toThrow(
      expect.objectContaining({ code: "LEASE_HELD" }),
    );
    releaseChefCheckout(checkout, id);
    expect(() => claimChefCheckout(checkout, newId())).not.toThrow();
  });

  it("recordResume stores the new baseline and known HEAD and resets the rejected-wake streak", () => {
    const id = newChef();
    claimWake(id, 1);
    recordWakeResult(id, 1, { outcome: "ok", rejected: 2 });
    expect(consecutiveRejectedWakes(id)).toBe(1);

    const head = "b".repeat(40);
    const resume = recordResume(id, {
      knownHead: head,
      fingerprint: { head },
      snapshot: { s: 1 },
    });

    expect(readLatestBaseline(id)).toEqual({
      source: "resume",
      seq: resume.seq,
      head,
      fingerprint: { head },
      snapshot: { s: 1 },
    });
    expect(readKnownHead(id)).toBe(head);
    expect(consecutiveRejectedWakes(id)).toBe(0);
  });

  it("quota-wait is derived from the latest wake's quota result and ends with the next wake", () => {
    const id = newChef();
    claimWake(id, 1);
    recordWakeResult(id, 1, { outcome: "quota", resetsAt: 12345 });
    expect(chefStatus(id)).toEqual({ state: "quota-wait", resetsAt: 12345 });

    claimWake(id, 2);
    expect(chefStatus(id)).toEqual({ state: "active" });
  });

  it("an orphaned claim is marked failed once, never overwritten, and frees the next wake", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    const id = newChef();
    claimWake(id, 1);
    expect(isOrphanedClaim(listWakes(id)[0])).toBe(false);

    vi.setSystemTime(Date.now() + SPAWN_GRACE_MS + 1000);
    expect(isOrphanedClaim(listWakes(id)[0])).toBe(true);

    expect(markClaimFailed(id, 1, "no runner")).toBe(true);
    expect(markClaimFailed(id, 1, "again")).toBe(false);
    expect(recordWakeResult(id, 1, { outcome: "ok", consumed: ["x"] })).toBe(
      false,
    );
    const result = listWakes(id)[0].result;
    expect(result).toMatchObject({ outcome: "failed", error: "no runner" });
    expect(result).not.toHaveProperty("consumed");
    expect(claimWake(id, 2)).toBe(true);
  });

  it("nextSeq hands out increasing numbers starting at 1", () => {
    const id = newChef();
    expect(nextSeq(id)).toBe(1);
    expect(nextSeq(id)).toBe(2);
  });

  it("nextSeq never hands out the same number to parallel processes", async () => {
    const id = newChef();
    const mod = fileURLToPath(new URL("../chef-store.ts", import.meta.url));
    const cliDir = fileURLToPath(new URL("../../../../", import.meta.url));
    const go = join(root, "go");
    const children = 3;
    const perChild = 20;
    // Each child signals ready, waits for `go`, then claims seqs back to back.
    const script = `
      const [mod, id, count, go, ready] = process.argv.slice(1);
      const fs = await import("node:fs");
      const S = await import(mod);
      fs.writeFileSync(ready, "");
      const pause = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(go)) Atomics.wait(pause, 0, 0, 2);
      const out = [];
      for (let i = 0; i < Number(count); i++) out.push(S.nextSeq(id));
      console.log(out.join(" "));
    `;
    const runs = Array.from({ length: children }, (_, i) => {
      const ready = join(root, `ready-${i}`);
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          script,
          mod,
          id,
          String(perChild),
          go,
          ready,
        ],
        {
          cwd: cliDir,
          env: { ...process.env, CF_ORCHESTRATOR_DIR: root },
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      const done = new Promise<string>((resolve, reject) =>
        child.on("close", (code) =>
          code === 0 ? resolve(stdout) : reject(new Error(stderr)),
        ),
      );
      return { ready, done };
    });

    while (!runs.every((r) => existsSync(r.ready))) {
      await new Promise((r) => setTimeout(r, 10));
    }
    writeFileSync(go, "");
    const seqs = (await Promise.all(runs.map((r) => r.done)))
      .join(" ")
      .trim()
      .split(/\s+/)
      .map(Number)
      .sort((a, b) => a - b);

    const total = children * perChild;
    expect(seqs).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  }, 20_000);
});

describe("checkout lease holder kinds", () => {
  function leaseFile(): string {
    const key = createHash("sha256").update(checkout).digest("hex");
    return join(root, "leases", `${key}.json`);
  }

  function writeLease(record: Record<string, unknown>): void {
    mkdirSync(join(root, "leases"), { recursive: true });
    writeFileSync(leaseFile(), JSON.stringify(record));
  }

  const longAgo = new Date(Date.now() - 10 * SPAWN_GRACE_MS).toISOString();

  it("a record without holder kind is a task holder: held while its runner lives", () => {
    const holder = createTask({
      provider: "claude",
      prompt: "do it",
      readOnly: false,
      checkout,
    }).id;
    recordRunner(holder, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    writeLease({
      schemaVersion: 1,
      checkout,
      taskId: holder,
      createdAt: longAgo,
    });

    expect(() => acquireLease(checkout, newId())).toThrow(
      new RegExp(`running writer task ${holder}`),
    );
    releaseLease(checkout, holder);
    expect(existsSync(leaseFile())).toBe(false);
  });

  it("a chef-commit holder holds the lease while its pid lives", () => {
    const chefId = newId();
    acquireLease(checkout, chefId, "chef-commit");
    expect(() => acquireLease(checkout, newId())).toThrow(
      new RegExp(`held by a commit of chef ${chefId}`),
    );
  });

  it("a chef-commit holder with a dead pid is stale", () => {
    writeLease({
      schemaVersion: 1,
      checkout,
      holderKind: "chef-commit",
      chefId: newId(),
      pid: deadPid(),
      createdAt: new Date().toISOString(),
    });
    const taskId = newId();
    acquireLease(checkout, taskId);
    expect(JSON.parse(readFileSync(leaseFile(), "utf-8"))).toMatchObject({
      holderKind: "task",
      taskId,
    });
  });
});
