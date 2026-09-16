import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the CLI entrypoint. It must NOT be relative: every test runs
 * the CLI with `cwd` pointing at its own temp project, so a relative path would
 * resolve against that temp dir and the CLI would never start (the command
 * would "fail" with a module-not-found instead of exercising anything).
 */
const CLI_ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a CLI command and capture stdout + stderr + exit code.
 * Does not throw on non-zero exit — returns exitCode instead.
 */
export function runCf(args: string[], opts?: ExecFileSyncOptions): RunResult {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI_ENTRY, ...args], {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}
