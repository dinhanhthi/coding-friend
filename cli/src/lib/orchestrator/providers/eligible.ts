import { tmpdir } from "os";
import { commandExists, run } from "../../exec.js";
import { compareVersions, extractVersion } from "../../host.js";
import type { Provider } from "../store.js";
import { MIN_CODEX_VERSION } from "./codex.js";
import {
  PROVIDERS,
  type Ineligibility,
  type ProviderRequest,
} from "./index.js";

export { binaryVersion } from "./version.js";

/**
 * Why codex cannot run sandboxed workers (too old or unknown version), or
 * undefined when it can. An older codex may ignore the permission profile.
 */
export function codexVersionError(): string | undefined {
  // Neutral cwd: the runner's cwd is the worker-writable checkout.
  const output = run("codex", ["--version"], { cwd: tmpdir() });
  const actual = output ? extractVersion(output) : undefined;
  if (!actual || compareVersions(actual, MIN_CODEX_VERSION) < 0) {
    return `codex ${MIN_CODEX_VERSION} or newer is required for sandboxed workers (found ${actual ?? "unknown"})`;
  }
  return undefined;
}

/**
 * Why provider `p` cannot run this task, or undefined when it can. Checks,
 * in order: binary on PATH, writer/read-only capability, git checkout
 * (only read-only providers with `nonGitReadOnly` run outside one), a model
 * when the provider needs one, then the provider's own probes. `isGitRepo`
 * comes from dispatch: git never runs in a checkout a worker has written to.
 */
export function providerIneligibility(
  p: Provider,
  req: ProviderRequest,
): Ineligibility | undefined {
  if (!Object.hasOwn(PROVIDERS, p)) {
    return { code: "USAGE", message: `unknown provider ${JSON.stringify(p)}` };
  }
  const adapter = PROVIDERS[p];
  if (!commandExists(adapter.bin)) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: `${adapter.bin} not found on PATH`,
    };
  }
  if (req.readOnly ? !adapter.caps.readOnly : !adapter.caps.writer) {
    return {
      code: "USAGE",
      message: `${p} cannot run ${req.readOnly ? "read-only" : "writer"} tasks`,
    };
  }
  if (!req.isGitRepo && !(req.readOnly && adapter.caps.nonGitReadOnly)) {
    return {
      code: "USAGE",
      message: req.readOnly
        ? `Read-only ${p} tasks must run inside a git repository`
        : "Writer tasks must run inside a git repository",
    };
  }
  if (adapter.caps.needsModel && !req.models?.[p]) {
    return {
      code: "USAGE",
      message: `${p} needs a model: set task.models.${p} or pass --model`,
    };
  }
  if (p === "codex") {
    const error = codexVersionError();
    if (error) return { code: "PROVIDER_UNAVAILABLE", message: error };
  }
  return adapter.preflight?.(req);
}

/**
 * The `candidates` that can run the task now. Callers pass the task's
 * `policy.fallback` plus the current provider, never every provider: a
 * provider's probes run only when the task opted into it.
 */
export function eligibleProviders(
  req: ProviderRequest,
  candidates: readonly Provider[],
): Provider[] {
  return candidates.filter((p) => !providerIneligibility(p, req));
}
