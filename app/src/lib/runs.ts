import type { CfError, RunStarted } from "./cf";

/** Every command that takes Rust's `MutationLock`; adding a project has no confirm. */
export type RunOp = RunStarted["op"] | "projectAdd";

/**
 * The one mutating command in flight: its native dialog is up (`started` false) or `cf`
 * runs (`started` true, after `cf-run-started`).
 */
export interface PendingRun {
  op: RunOp;
  /** The fix's check id, the project path, the config row or the note; `null` for update and add. */
  key: string | null;
  /** The command line the confirm shows. */
  command: string;
  /** A native folder picker opens before the confirm (`choose_learn_dir`). */
  picker?: boolean;
  started: boolean;
}

/** Why the other mutation buttons are disabled meanwhile. */
export function describePending(run: PendingRun): string {
  if (run.op === "projectAdd")
    return "Disabled while the folder picker is open.";
  if (run.picker && !run.started)
    return "Disabled while the folder picker or its confirmation is open.";
  return run.started
    ? `Disabled while ${run.command} runs.`
    : `Disabled while ${run.command} waits for confirmation.`;
}

/**
 * Dashboard's `start`: runs one mutating command at a time (Rust shows its confirm or picker
 * first). Cancel calls neither callback; `onError` also gets the error, e.g. for `CONFLICT`.
 */
export type StartRun = <T>(
  run: Omit<PendingRun, "started">,
  action: () => Promise<T>,
  onDone: (result: T) => void,
  onError: (message: string, error: CfError) => void,
) => void;
