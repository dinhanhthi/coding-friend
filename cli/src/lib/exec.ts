import { execFileSync, spawn, type SpawnOptions } from "child_process";

/**
 * Run a command synchronously using execFileSync (no shell injection risk).
 * Returns stdout as string, or null if command fails.
 */
export function run(
  cmd: string,
  args: string[] = [],
  opts?: { cwd?: string },
): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      cwd: opts?.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Run a command and stream output to terminal.
 * Returns a promise that resolves with the exit code.
 */
export function streamExec(
  cmd: string,
  args: string[],
  opts?: SpawnOptions,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      ...opts,
    });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", reject);
  });
}

/**
 * Synchronous sleep using Atomics.wait.
 */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Check if a command exists on PATH.
 */
export function commandExists(cmd: string): boolean {
  return run("which", [cmd]) !== null;
}
