import { writeSync } from "fs";
import { getLogMode, setLogMode } from "./log.js";

export const CONTRACT_VERSION = 1;

export type ErrorCode =
  | "USAGE"
  | "INVALID_ARGS"
  | "INVALID_VALUE"
  | "NOT_FOUND"
  | "INTERACTIVE_REQUIRED"
  | "DEV_MODE_ACTIVE"
  | "COMMAND_FAILED"
  | "MEMORY_BUILD_FAILED"
  | "UNEXPECTED_EXIT"
  | "LEASE_HELD"
  | "ASK_TIMEOUT"
  | "ALREADY_FINISHED"
  | "PROVIDER_UNAVAILABLE"
  | "INTERNAL";

export type Envelope<T> =
  | { contractVersion: 1; ok: true; data: T; error: null }
  | {
      contractVersion: 1;
      ok: false;
      data: null;
      error: { code: ErrorCode; message: string };
    };

/**
 * Expected, user-facing failure. JSON mode turns it into an error envelope;
 * human mode exits 1 without printing again (the command already logged it).
 */
export class CliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function isJsonArgv(argv: string[]): boolean {
  // After "--" every word is an argument (a prompt, an answer), not an option.
  const end = argv.indexOf("--");
  return (end === -1 ? argv : argv.slice(0, end)).includes("--json");
}

export function errorEnvelope(
  code: ErrorCode,
  message: string,
): Envelope<never> {
  return {
    contractVersion: CONTRACT_VERSION,
    ok: false,
    data: null,
    error: { code, message },
  };
}

function toErrorEnvelope(err: unknown): Envelope<never> {
  if (err instanceof CliError) return errorEnvelope(err.code, err.message);
  return errorEnvelope(
    "INTERNAL",
    err instanceof Error ? err.message : String(err),
  );
}

/**
 * Run a command body in JSON mode: stdout receives exactly one envelope,
 * everything else goes to stderr. Never calls process.exit.
 */
export async function runJson<T>(fn: () => T | Promise<T>): Promise<void> {
  let written = false;

  const onExit = (code: number): void => {
    if (written) return;
    written = true;
    const env = errorEnvelope(
      "UNEXPECTED_EXIT",
      `Process exited with code ${code} before producing a result`,
    );
    writeSync(1, JSON.stringify(env) + "\n");
  };
  process.once("exit", onExit);

  const previousLogMode = getLogMode();
  setLogMode("json");
  const originalLog = console.log;
  console.log = (...args: unknown[]) => console.error(...args);

  let env: Envelope<T>;
  try {
    // `?? null` keeps the `data` key when fn returns undefined.
    env = {
      contractVersion: CONTRACT_VERSION,
      ok: true,
      data: ((await fn()) ?? null) as T,
      error: null,
    };
  } catch (err) {
    process.exitCode = 1;
    env = toErrorEnvelope(err);
  } finally {
    console.log = originalLog;
    setLogMode(previousLogMode);
  }

  process.removeListener("exit", onExit);
  if (written) return;
  written = true;
  process.stdout.write(JSON.stringify(env) + "\n");
}

/**
 * Run a command body in human mode: a CliError exits 1 silently (already
 * logged by the command); any other error propagates unchanged.
 */
export async function runHuman<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CliError) return process.exit(1);
    throw err;
  }
}
