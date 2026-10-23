import { realpathSync, rmSync } from "fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "path";
import { CliError } from "../output.js";
import { orchestratorDir } from "../paths.js";
import { acquireLease, releaseLease } from "./lease.js";
import { providerIneligibility } from "./providers/eligible.js";
import type { TaskPolicy } from "./quota.js";
import { digest } from "./runner.js";
import {
  claimAttempt,
  createTask,
  isModelName,
  isProviderName,
  PROVIDER_NAMES,
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
  /** Model for `provider` only; overrides `policy.models[provider]`. */
  model?: string;
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
export function assertStoreOutsideCheckout(checkout: string): void {
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

/**
 * Create a task and start its detached runner. `checkout`, `isGitRepo` and
 * `policy` come from the caller: this never reads the cwd, the config or git.
 */
export function dispatchTask(input: DispatchInput): {
  taskId: string;
  pid: number;
} {
  const { prompt, provider, readOnly, checkout, isGitRepo, model } = input;
  // Callers check these too; the chef passes model-built input.
  if (!isProviderName(provider)) {
    throw new CliError(
      "USAGE",
      `provider must be one of ${PROVIDER_NAMES.join(", ")}`,
    );
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new CliError("USAGE", "Prompt is empty");
  }
  if (model !== undefined && !isModelName(model)) {
    throw new CliError("USAGE", `Invalid model name for ${provider}`);
  }
  const models = { ...input.policy.models };
  if (model !== undefined) models[provider] = model;
  const policy: TaskPolicy = { ...input.policy };
  delete policy.models;
  if (Object.keys(models).length > 0) policy.models = models;
  if (process.platform === "win32") {
    throw new CliError(
      "PROVIDER_UNAVAILABLE",
      "Worker sandboxing is not available on native Windows",
    );
  }
  // Binary, capability (writer / read-only / non-git), model, version.
  const refused = providerIneligibility(provider, {
    isGitRepo,
    readOnly,
    checkout,
    ...(policy.models && { models: policy.models }),
  });
  if (refused) throw new CliError(refused.code, refused.message);
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
