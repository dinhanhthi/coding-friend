import { realpathSync, rmSync } from "fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "path";
import { commandExists } from "../exec.js";
import { CliError } from "../output.js";
import { orchestratorDir } from "../paths.js";
import { acquireLease, releaseLease } from "./lease.js";
import { codexVersionError } from "./providers/eligible.js";
import { PROVIDERS } from "./providers/index.js";
import type { TaskPolicy } from "./quota.js";
import { digest } from "./runner.js";
import {
  claimAttempt,
  createTask,
  recordDispatch,
  recordResult,
  recordRunner,
  serialize,
  type Provider,
} from "./store.js";
import { spawnRunner } from "./supervisor.js";

export interface DispatchInput {
  prompt: string;
  provider: Provider;
  readOnly: boolean;
  /** The task's checkout, already a realpath. */
  checkout: string;
  isGitRepo: boolean;
  policy: TaskPolicy;
}

/**
 * realpath of `path`, or — when it does not exist yet — of its nearest
 * existing ancestor with the missing segments re-appended, so a symlink on
 * the way is resolved before the store dir is created.
 */
function realpathOfNearestAncestor(path: string): string {
  const missing: string[] = [];
  let cur = path;
  for (;;) {
    try {
      return join(realpathSync(cur), ...missing);
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return path;
      missing.unshift(basename(cur));
      cur = parent;
    }
  }
}

/**
 * A store inside the checkout is either unwritable (Claude read-only sandbox)
 * or writable by the worker beyond its own task dir (writers' cwd).
 */
function assertStoreOutsideCheckout(checkout: string): void {
  const store = realpathOfNearestAncestor(orchestratorDir()); // checkout is a realpath too
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

/** An older codex may ignore the worker's permission profile: refuse it. */
function assertCodexVersion(): void {
  const error = codexVersionError();
  if (error) throw new CliError("PROVIDER_UNAVAILABLE", error);
}

/**
 * Create a task and start its detached runner. `checkout`, `isGitRepo` and
 * `policy` come from the caller: this never reads the cwd, the config or git.
 */
export function dispatchTask(input: DispatchInput): {
  taskId: string;
  pid: number;
} {
  const { prompt, provider, readOnly, checkout, isGitRepo, policy } = input;
  // Callers check these too; the chef passes model-built input.
  if (provider !== "claude" && provider !== "codex") {
    throw new CliError("USAGE", "provider must be claude or codex");
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new CliError("USAGE", "Prompt is empty");
  }
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
  if (provider === "codex") assertCodexVersion();
  // Every task: the runner writes its private dir (codex -o) into the store.
  assertStoreOutsideCheckout(checkout);

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
    if (!recordDispatch(id, { taskDigest, isGitRepo, policy })) {
      throw new Error("dispatch record already exists");
    }
    if (!claimAttempt(id, { n: 1, provider, kind: "fresh" })) {
      throw new Error("attempt 1 already claimed");
    }
    // The runner writes <1>/runner.json itself (its own pid).
    pid = spawnRunner(id, checkout, taskDigest);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    recordResult(id, { exitCode: null, outcome: "failed", error });
    if (!readOnly) releaseLease(checkout, id);
    throw new CliError("INTERNAL", `Could not start task runner: ${error}`);
  }
  // C1 compat only: C2a readers take the latest attempt's runner pid.
  recordRunner(id, { pid, startedAt: new Date().toISOString() });
  return { taskId: id, pid };
}
