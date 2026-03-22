import { execFileSync, spawn, type SpawnOptions } from "child_process";

/**
 * Run a command synchronously using execFileSync (no shell injection risk).
 * Returns stdout as string, or null if command fails.
 */
export function run(
  cmd: string,
  args: string[] = [],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv },
): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      cwd: opts?.cwd,
      env: opts?.env,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command synchronously, capturing stdout, stderr, and exit code.
 * Never throws — always returns a result object.
 */
export function runWithStderr(
  cmd: string,
  args: string[] = [],
  opts?: { cwd?: string },
): RunResult {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: "utf-8",
      cwd: opts?.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };
    return {
      stdout: (e.stdout ?? "").toString().trim(),
      stderr: (e.stderr ?? "").toString().trim(),
      exitCode: e.status ?? 1,
    };
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
  const checker = process.platform === "win32" ? "where" : "which";
  return run(checker, [cmd]) !== null;
}
