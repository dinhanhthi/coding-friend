import { createHash } from "crypto";
import { unlinkSync } from "fs";
import { join } from "path";
import { readJson } from "../json.js";
import { CliError } from "../output.js";
import { orchestratorDir } from "../paths.js";
import {
  createOnce,
  isOlderThan,
  isPidAlive,
  readTask,
  SPAWN_GRACE_MS,
  type TaskView,
} from "./store.js";

/**
 * One writer per checkout, held as a create-once lease file. The holder is a
 * writer task, or a chef's own commit step (`chef-commit`, held by its pid).
 */

export type LeaseHolderKind = "task" | "chef-commit";

interface LeaseRecord {
  schemaVersion: 1;
  checkout: string;
  /** Absent on records written before holder kinds: read as "task". */
  holderKind?: LeaseHolderKind;
  /** Task holder id. */
  taskId?: string;
  /** Chef holder id: never looked up as a task. */
  chefId?: string;
  /** Process holding a chef-commit lease. */
  pid?: number;
  createdAt: string;
}

function kindOf(lease: LeaseRecord): LeaseHolderKind {
  return lease.holderKind ?? "task";
}

function holderId(lease: LeaseRecord | null): string | undefined {
  if (!lease) return undefined;
  return kindOf(lease) === "chef-commit" ? lease.chefId : lease.taskId;
}

function leaseFile(checkout: string): string {
  const key = createHash("sha256").update(checkout).digest("hex");
  return join(orchestratorDir(), "leases", `${key}.json`);
}

function removeFile(file: string): void {
  try {
    unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * A lease is stale when its holder task finished, died, or never started.
 * A live runner always holds it: its worker may keep running after cf done.
 * A paused task holds it even with a dead runner: it resumes later.
 * A chef-commit holder is stale once its pid is dead.
 */
function isStale(lease: LeaseRecord | null): boolean {
  if (!lease) return true;
  if (kindOf(lease) === "chef-commit") {
    return typeof lease.pid !== "number" || !isPidAlive(lease.pid);
  }
  if (typeof lease.taskId !== "string") return true;
  let task: TaskView | undefined;
  try {
    task = readTask(lease.taskId);
  } catch {
    // Missing (or not yet created) holder task: same grace as no runner.
  }
  // C2a: only the latest attempt's runner counts (root runner.json ignored).
  const attempts = task?.attempts;
  const pid = attempts ? attempts[attempts.length - 1]?.pid : task?.runner?.pid;
  if (pid !== undefined && isPidAlive(pid)) return false;
  if (task && (task.done || task.result || task.cancel)) return true;
  // The view's state carries the attempt's own spawn grace and pause rules.
  if (attempts) return task?.state !== "paused" && task?.state !== "queued";
  if (task?.runner) return true; // dead runner
  return isOlderThan(lease.createdAt, SPAWN_GRACE_MS);
}

export function acquireLease(
  checkout: string,
  id: string,
  kind: LeaseHolderKind = "task",
): void {
  const file = leaseFile(checkout);
  const record: LeaseRecord = {
    schemaVersion: 1,
    checkout,
    holderKind: kind,
    ...(kind === "chef-commit"
      ? { chefId: id, pid: process.pid }
      : { taskId: id }),
    createdAt: new Date().toISOString(),
  };
  if (createOnce(file, record)) return;
  const holder = readJson<LeaseRecord>(file);
  if (isStale(holder)) {
    removeFile(file);
    if (createOnce(file, record)) return;
  }
  const current = readJson<LeaseRecord>(file) ?? holder;
  const held = holderId(current) ?? "(unknown)";
  throw new CliError(
    "LEASE_HELD",
    current && kindOf(current) === "chef-commit"
      ? `Checkout ${checkout} is held by a commit of chef ${held}`
      : `Checkout ${checkout} already has a running writer task ${held}`,
  );
}

/** Remove the lease only when `id` of holder `kind` holds it. */
export function releaseLease(
  checkout: string,
  id: string,
  kind: LeaseHolderKind = "task",
): void {
  const file = leaseFile(checkout);
  const lease = readJson<LeaseRecord>(file);
  if (lease && kindOf(lease) === kind && holderId(lease) === id) {
    removeFile(file);
  }
}
