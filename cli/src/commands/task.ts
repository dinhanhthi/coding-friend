import { spawn, type ChildProcess } from "child_process";
import { closeSync, openSync, realpathSync, rmSync } from "fs";
import { isAbsolute, join, relative, sep } from "path";
import { commandExists, run as exec } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { acquireLease, releaseLease } from "../lib/orchestrator/lease.js";
import { PROVIDERS } from "../lib/orchestrator/providers/index.js";
import { digest, runTask } from "../lib/orchestrator/runner.js";
import {
  createTask,
  listTasks,
  readTask,
  recordCancel,
  recordResult,
  recordRunner,
  serialize,
  type Provider,
  type TaskView,
} from "../lib/orchestrator/store.js";
import { orchestratorDir } from "../lib/paths.js";
import { resolveCheckoutRoot } from "../lib/project-root.js";

interface Flags {
  json?: boolean;
}

interface RunFlags extends Flags {
  provider?: string;
  readOnly?: boolean;
}

/** JSON mode → envelope; human mode → log CliError then exit 1 via runHuman. */
async function run<T>(
  json: boolean | undefined,
  fn: () => T | Promise<T>,
  print: (data: T) => void,
): Promise<void> {
  if (json) {
    await runJson(fn);
    return;
  }
  await runHuman(async () => {
    try {
      print(await fn());
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

/** Strip ANSI escapes and C0/C1 control chars (keeps \n and \t). */
export function sanitize(text: string): string {
  return String(text)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

function oneLine(text: string, max: number): string {
  return sanitize(text).replace(/\s+/g, " ").trim().slice(0, max);
}

function age(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return "?";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && Object.hasOwn(PROVIDERS, v);
}

function resolveCheckout(provider: Provider, readOnly: boolean): string {
  const checkout = resolveCheckoutRoot(process.cwd());
  if (checkout) return checkout;
  if (provider === "claude" && readOnly) return realpathSync(process.cwd());
  throw new CliError(
    "USAGE",
    readOnly
      ? "Read-only codex tasks must run inside a git repository"
      : "Writer tasks must run inside a git repository",
  );
}

/**
 * A store inside the checkout is either unwritable (Claude read-only sandbox)
 * or writable by the worker beyond its own task dir (writers' cwd).
 */
function assertStoreOutsideCheckout(checkout: string): void {
  let store = orchestratorDir();
  try {
    store = realpathSync(store); // checkout is a realpath too
  } catch {
    // not created yet: compare the resolved path
  }
  const rel = relative(checkout, store);
  if (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  ) {
    throw new CliError(
      "USAGE",
      `The orchestrator dir ${store} is inside the checkout ${checkout}; set CF_ORCHESTRATOR_DIR outside it`,
    );
  }
}

/**
 * Spawn the detached runner (`cf task _run <id>`); its stdio goes to
 * runner.log. `taskDigest` (sha256 of task.json) lets the runner refuse a
 * task.json rewritten after dispatch; `cwd` is the checkout.
 */
function spawnRunner(
  id: string,
  taskDir: string,
  cwd: string,
  taskDigest: string,
): number {
  const fd = openSync(join(taskDir, "runner.log"), "a", 0o600);
  try {
    const child: ChildProcess = spawn(
      process.execPath,
      [...process.execArgv, process.argv[1], "task", "_run", id],
      {
        detached: true,
        stdio: ["ignore", fd, fd],
        cwd,
        // cwd changes: pass the store dir absolute, not a relative override.
        env: {
          ...process.env,
          CF_ORCHESTRATOR_DIR: orchestratorDir(),
          CF_TASK_DIGEST: taskDigest,
          CF_TASK_CHECKOUT: cwd,
        },
      },
    );
    child.once("error", () => {}); // reported via the missing pid below
    if (!child.pid) throw new Error("runner process did not start");
    child.unref();
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

export async function taskRunCommand(
  prompt: string,
  opts: RunFlags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const provider = opts.provider;
      if (!isProvider(provider)) {
        throw new CliError("USAGE", "--provider must be claude or codex");
      }
      if (!prompt.trim()) throw new CliError("USAGE", "Prompt is empty");
      if (process.platform === "win32") {
        throw new CliError(
          "PROVIDER_UNAVAILABLE",
          "Worker sandboxing is not available on native Windows",
        );
      }
      if (!commandExists(PROVIDERS[provider].bin)) {
        throw new CliError(
          "PROVIDER_UNAVAILABLE",
          `${PROVIDERS[provider].bin} not found on PATH`,
        );
      }
      const readOnly = Boolean(opts.readOnly);
      const checkout = resolveCheckout(provider, readOnly);
      // Codex read-only writes nowhere, so a store in its checkout is harmless.
      if (!(provider === "codex" && readOnly)) {
        assertStoreOutsideCheckout(checkout);
      }

      const task = createTask({ provider, prompt, readOnly, checkout });
      const id = task.id;
      const taskDir = join(orchestratorDir(), "tasks", id);
      if (!readOnly) {
        try {
          acquireLease(checkout, id);
        } catch (err) {
          rmSync(taskDir, { recursive: true, force: true });
          throw err;
        }
      }

      let pid: number;
      try {
        // The bytes createTask wrote, not a re-read the worker could race.
        const taskDigest = digest(Buffer.from(serialize(task), "utf-8"));
        pid = spawnRunner(id, taskDir, checkout, taskDigest);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        recordResult(id, { exitCode: null, outcome: "failed", error });
        if (!readOnly) releaseLease(checkout, id);
        throw new CliError("INTERNAL", `Could not start task runner: ${error}`);
      }
      recordRunner(id, { pid, startedAt: new Date().toISOString() });
      return { taskId: id };
    },
    ({ taskId }) => {
      log.success(`Started task ${taskId}`);
      console.log(`  Follow it with: cf task show ${taskId}`);
    },
  );
}

/** Hidden `cf task _run <id>`: the detached per-task runner. */
export async function taskRunnerCommand(id: string): Promise<void> {
  await runTask(id);
}

export async function taskListCommand(opts: Flags): Promise<void> {
  await run(opts.json, listTasks, (tasks) => {
    if (tasks.length === 0) {
      console.log("No tasks.");
      return;
    }
    for (const t of tasks) {
      const ro = t.readOnly ? "  [ro]" : "";
      console.log(
        `${sanitize(t.id)}  ${sanitize(t.state)}  ${sanitize(t.provider)}${ro}  ${age(t.createdAt)}  ${oneLine(t.prompt, 60)}`,
      );
    }
  });
}

function printShow(t: TaskView): void {
  console.log(`Task ${sanitize(t.id)}  ${sanitize(t.state)}`);
  console.log(
    `  provider:   ${sanitize(t.provider)}${t.readOnly ? " (read-only)" : ""}`,
  );
  console.log(`  checkout:   ${sanitize(t.checkout)}`);
  console.log(
    `  created:    ${sanitize(String(t.createdAt))} (${age(t.createdAt)} ago)`,
  );
  if (t.runner) console.log(`  runner pid: ${sanitize(String(t.runner.pid))}`);
  if (t.session) {
    console.log(`  session:    ${sanitize(t.session.sessionId)}`);
    if (t.session.transcriptPath) {
      console.log(`  transcript: ${sanitize(t.session.transcriptPath)}`);
    }
  }
  if (t.result) {
    console.log(`  exit code:  ${sanitize(String(t.result.exitCode ?? "-"))}`);
    console.log(`  outcome:    ${sanitize(String(t.result.outcome))}`);
  }
  console.log(`  prompt:     ${oneLine(t.prompt, 200)}`);

  const lines: string[] = [];
  // Indent continuation lines so multi-line worker text stays under the label.
  const indent = (text: string) => sanitize(text).replace(/\n/g, "\n    ");
  const add = (label: string, value: string | undefined) => {
    if (value) lines.push(`  ${label}: ${indent(value)}`);
  };
  if (t.done) {
    add("done", t.done.outcome);
    add("summary", t.done.summary);
    add("handoff", t.done.handoff);
  }
  add("last message", t.result?.lastMessage);
  add("error", t.result?.error);
  for (const a of t.pendingAsks) {
    const qid = sanitize(a.qid);
    lines.push(`  question ${qid}: ${indent(a.question)}`);
    lines.push(
      `    answer with: cf reply --task ${sanitize(t.id)} ${qid} "<answer>"`,
    );
  }
  if (lines.length > 0) {
    console.log("worker output (untrusted):");
    for (const l of lines) console.log(l);
  }
}

export async function taskShowCommand(id: string, opts: Flags): Promise<void> {
  await run(opts.json, () => readTask(id), printShow);
}

/**
 * SIGTERM the task's runner. runner.json is worker-writable, so only signal a
 * pid whose command line really is `cf task _run <id>`. Returns whether a
 * signal was sent.
 */
function signalRunner(id: string, pid: unknown): boolean {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 1) {
    return false;
  }
  const command = exec("ps", ["-ww", "-o", "command=", "-p", String(pid)]);
  if (!command?.includes(`task _run ${id}`)) return false;
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw new CliError(
      "INTERNAL",
      `Could not signal runner ${pid}: ${(err as Error).message}`,
    );
  }
}

export async function taskCancelCommand(
  id: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      // cancel.json first: the runner reads it to record outcome "cancelled".
      recordCancel(id);
      const signalled = signalRunner(id, readTask(id).runner?.pid);
      return { taskId: id, cancelled: true, signalled };
    },
    ({ taskId, signalled }) =>
      log.success(
        `Cancelled task ${taskId}${signalled ? "" : " (no running runner to stop)"}`,
      ),
  );
}
