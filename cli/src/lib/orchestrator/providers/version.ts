import { execFileSync } from "child_process";
import { realpathSync } from "fs";
import { tmpdir } from "os";
import { extractVersion } from "../../host.js";

/**
 * Leaf module: never import providers/index.js, eligible.js or an adapter
 * here. Adapters import it directly, and an adapter → index edge can hit a
 * TDZ depending on import order (index.ts reads adapter bindings at top level).
 */

const VERSION_TIMEOUT_MS = 10_000;

/**
 * The `x.y.z` version printed by `<bin> --version ...args`, else undefined.
 * Tolerates a `v` prefix (`opencode v2.0.13` → `2.0.13`); a date version
 * keeps its date (`2026.10.22-27dcf5f` → `2026.10.22`). Runs in a neutral
 * cwd (the runner's cwd is a worker-writable checkout) with a short timeout;
 * `opts.env` adds to or overrides the current env.
 */
export function binaryVersion(
  bin: string,
  opts?: { env?: NodeJS.ProcessEnv; args?: string[] },
): string | undefined {
  let output: string;
  try {
    output = execFileSync(bin, ["--version", ...(opts?.args ?? [])], {
      encoding: "utf-8",
      cwd: tmpdir(),
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: VERSION_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
  } catch {
    return undefined;
  }
  return extractVersion(output.replace(/\bv(?=\d)/g, ""));
}

/**
 * The temp dirs a provider sandbox may always write (decision 20): `/tmp`,
 * `/private/tmp`, `/var/tmp`, `/private/var/tmp` and `$TMPDIR`, each as its
 * realpath, without duplicates or missing entries. Compare realpaths to them.
 */
export function tempDirRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots: string[] = [];
  for (const dir of [
    "/tmp",
    "/private/tmp",
    "/var/tmp",
    "/private/var/tmp",
    env.TMPDIR,
  ]) {
    if (!dir) continue;
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      continue;
    }
    if (!roots.includes(real)) roots.push(real);
  }
  return roots;
}
