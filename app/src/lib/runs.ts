import type { RunStarted } from "./cf";

/** Every command that takes Rust's `MutationLock`; adding a project has no confirm. */
export type RunOp = RunStarted["op"] | "projectAdd";

/**
 * The one mutating command in flight: its native dialog is up (`started` false) or `cf`
 * runs (`started` true, after `cf-run-started`).
 */
export interface PendingRun {
  op: RunOp;
  /** The fix's check id, the project path or the config row; `null` for update and add. */
  key: string | null;
  /** The command line the confirm shows. */
  command: string;
  started: boolean;
}

/** Why the other mutation buttons are disabled meanwhile. */
export function describePending(run: PendingRun): string {
  if (run.op === "projectAdd")
    return "Disabled while the folder picker is open.";
  return run.started
    ? `Disabled while ${run.command} runs.`
    : `Disabled while ${run.command} waits for confirmation.`;
}
