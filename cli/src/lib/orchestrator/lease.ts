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

/** One writer task per checkout, held as a create-once lease file. */

interface LeaseRecord {
  schemaVersion: 1;
  checkout: string;
  taskId: string;
  createdAt: string;
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
 */
function isStale(lease: LeaseRecord | null): boolean {
  if (!lease || typeof lease.taskId !== "string") return true;
  let task: TaskView | undefined;
  try {
    task = readTask(lease.taskId);
  } catch {
    // Missing (or not yet created) holder task: same grace as no runner.
  }
  if (task?.runner && isPidAlive(task.runner.pid)) return false;
  if (task && (task.done || task.result)) return true;
  if (task?.runner) return true; // dead runner
  return isOlderThan(lease.createdAt, SPAWN_GRACE_MS);
}

export function acquireLease(checkout: string, taskId: string): void {
  const file = leaseFile(checkout);
  const record: LeaseRecord = {
    schemaVersion: 1,
    checkout,
    taskId,
    createdAt: new Date().toISOString(),
  };
  if (createOnce(file, record)) return;
  const holder = readJson<LeaseRecord>(file);
  if (isStale(holder)) {
    removeFile(file);
    if (createOnce(file, record)) return;
  }
  const held = readJson<LeaseRecord>(file)?.taskId ?? holder?.taskId;
  throw new CliError(
    "LEASE_HELD",
    `Checkout ${checkout} already has a running writer task ${held ?? "(unknown)"}`,
  );
}

/** Remove the lease only when `taskId` holds it. */
export function releaseLease(checkout: string, taskId: string): void {
  const file = leaseFile(checkout);
  if (readJson<LeaseRecord>(file)?.taskId === taskId) removeFile(file);
}
