import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import { existsSync, readFileSync, realpathSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { orchestratorDir } from "../paths.js";
import { releaseLease } from "./lease.js";
import {
  PROVIDERS,
  type SpawnContext,
  type StreamAcc,
} from "./providers/index.js";
import { recordResult, recordSession, type TaskRecord } from "./store.js";

/**
 * Per-task runner (`cf task _run <id>`). Spawns the worker in its own
 * process group (so cancel reaches its children too), parses its JSON event stream in memory only and
 * persists just session.json and result.json. Worker stdout/stderr never
 * touch disk.
 */

/** result.json error = cause (head) + stderr tail; recordResult caps at 4 KB. */
const ERROR_HEAD = 2000;
const STDERR_TAIL = 2048;
const KILL_GRACE_MS = 5000;
/** Wait for buffered stdout after exit, in case a grandchild holds the pipe. */
const DRAIN_MS = 2000;

const delay = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms).unref());

/** Signal the worker's whole process group; a gone group is fine. */
function killGroup(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
      console.error(`runner: could not ${sig} worker group: ${String(err)}`);
    }
  }
}

/** sha256 (hex) of `bytes`. */
export function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * task.json as the parent dispatched it: its bytes still hash to
 * CF_TASK_DIGEST and the cwd the parent set is the task's checkout.
 * Parses the same bytes it hashed (no re-read). Undefined otherwise.
 */
function readDispatchedTask(id: string): TaskRecord | undefined {
  try {
    const expected = process.env.CF_TASK_DIGEST;
    const bytes = readFileSync(
      join(orchestratorDir(), "tasks", id, "task.json"),
    );
    if (!expected || digest(bytes) !== expected) return undefined;
    const task = JSON.parse(bytes.toString("utf-8")) as TaskRecord;
    if (task.id !== id || realpathSync(process.cwd()) !== task.checkout) {
      return undefined;
    }
    return task;
  } catch {
    return undefined;
  }
}

export async function runTask(id: string): Promise<void> {
  const task = readDispatchedTask(id);
  if (!task) {
    recordResult(id, {
      exitCode: null,
      outcome: "failed",
      error: "task.json changed after dispatch; refusing to run",
    });
    // Checkout from the trusted parent; releaseLease checks the holder id.
    const checkout = process.env.CF_TASK_CHECKOUT;
    if (checkout) releaseLease(checkout, id);
    return;
  }
  const adapter = PROVIDERS[task.provider];
  const taskDir = join(orchestratorDir(), "tasks", task.id);
  const cancelled = () => existsSync(join(taskDir, "cancel.json"));
  const ctx: SpawnContext = {
    orchDir: orchestratorDir(),
    taskDir,
    checkout: task.checkout,
    cfInvocation: [process.execPath, ...process.execArgv, process.argv[1]],
    sessionUuid: randomUUID(),
  };

  let killTimer: NodeJS.Timeout | undefined;
  let workerPid = 0;
  let onSignal: (() => void) | undefined;
  try {
    if (cancelled()) {
      recordResult(id, { exitCode: null, outcome: "cancelled" });
      return;
    }
    const spec = adapter.buildSpawn(task, ctx);
    const env = { ...spec.env };
    delete env.CLAUDECODE; // avoid Claude's nested-session refusal
    delete env.CF_TASK_DIGEST;
    delete env.CF_TASK_CHECKOUT;
    const child = spawn(spec.cmd, spec.args, {
      cwd: task.checkout,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true, // own process group: cancel signals -pid
    });

    workerPid = child.pid ?? 0;
    onSignal = () => {
      const pid = workerPid;
      if (killTimer || pid <= 1) return;
      killGroup(pid, "SIGTERM");
      // No alive() check: the group can outlive the worker itself.
      killTimer = setTimeout(() => killGroup(pid, "SIGKILL"), KILL_GRACE_MS);
    };
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);

    let spawnError: string | undefined;
    const exited = new Promise<number | null>((resolve) => {
      child.once("error", (err) => {
        spawnError = err.message;
        resolve(null);
      });
      child.once("exit", (code) => resolve(code));
    });

    child.stdin.on("error", () => {}); // EPIPE when the worker exits early
    child.stdin.end(spec.stdin);

    const acc: StreamAcc = {};
    let sessionRecorded = false;
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      adapter.parseLine(line, acc);
      if (sessionRecorded || !acc.sessionId) return;
      const session = adapter.session(acc, ctx);
      if (!session) return;
      sessionRecorded = true;
      try {
        recordSession(id, session);
      } catch (err) {
        console.error(`runner: could not record session: ${String(err)}`);
      }
    });
    const stdoutClosed = new Promise<void>((r) => rl.once("close", r));

    let stderrTail = "";
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL);
    });

    const exitCode = await exited;
    await Promise.race([stdoutClosed, delay(DRAIN_MS)]);
    rl.close();
    child.stdout.destroy();
    child.stderr.destroy();

    const fin = adapter.finish(acc, exitCode, ctx);
    const outcome = cancelled()
      ? "cancelled"
      : spawnError
        ? "failed"
        : fin.outcome;
    const error =
      outcome !== "failed"
        ? undefined
        : [(spawnError ?? fin.error)?.slice(0, ERROR_HEAD), stderrTail.trim()]
            .filter(Boolean)
            .join("\n--- stderr ---\n") || undefined;
    recordResult(id, {
      exitCode,
      outcome,
      ...(fin.lastMessage !== undefined && { lastMessage: fin.lastMessage }),
      ...(error !== undefined && { error }),
    });
  } finally {
    if (killTimer) {
      // Cancelled: kill what is left of the group before the lease is released.
      clearTimeout(killTimer);
      killGroup(workerPid, "SIGKILL");
    }
    if (onSignal) {
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
    }
    if (!task.readOnly) releaseLease(task.checkout, id);
  }
}
