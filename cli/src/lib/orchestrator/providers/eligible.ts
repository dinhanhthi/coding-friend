import { tmpdir } from "os";
import { commandExists, run } from "../../exec.js";
import { compareVersions, extractVersion } from "../../host.js";
import type { Provider } from "../store.js";
import { MIN_CODEX_VERSION } from "./codex.js";
import { PROVIDERS } from "./index.js";

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
 * Providers that can run the task now: binary on PATH, codex new enough,
 * and codex only in a git checkout. `isGitRepo` comes from dispatch: git
 * never runs in a checkout a worker has written to.
 */
export function eligibleProviders(isGitRepo: boolean): Provider[] {
  return (Object.keys(PROVIDERS) as Provider[]).filter((p) => {
    if (!commandExists(PROVIDERS[p].bin)) return false;
    if (p !== "codex") return true;
    return isGitRepo && codexVersionError() === undefined;
  });
}
