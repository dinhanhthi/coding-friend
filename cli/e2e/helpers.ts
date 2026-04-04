import { execFileSync, type ExecFileSyncOptions } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a CLI command and capture stdout + stderr + exit code.
 * Does not throw on non-zero exit — returns exitCode instead.
 */
export function runCf(
  args: string[],
  opts?: ExecFileSyncOptions,
): RunResult {
  try {
    const stdout = execFileSync("npx", ["tsx", "../src/index.ts", ...args], {
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
