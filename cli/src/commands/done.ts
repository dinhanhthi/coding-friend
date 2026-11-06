import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { recordDone, type DoneOutcome } from "../lib/orchestrator/store.js";

interface Flags {
  task?: string;
  outcome?: string;
  summary?: string;
  handoff?: string;
  json?: boolean;
}

/** JSON mode → envelope; human mode → log CliError then exit 1 via runHuman. */
async function run<T>(
  json: boolean | undefined,
  fn: () => T,
  print: (data: T) => void,
): Promise<void> {
  if (json) {
    await runJson(fn);
    return;
  }
  await runHuman(() => {
    try {
      print(fn());
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

function isOutcome(v: unknown): v is DoneOutcome {
  return v === "succeeded" || v === "failed";
}

export async function doneCommand(opts: Flags): Promise<void> {
  await run(
    opts.json,
    () => {
      const taskId = opts.task || process.env.CF_TASK_ID;
      if (!taskId) {
        throw new CliError(
          "USAGE",
          "No task id: pass --task or set CF_TASK_ID",
        );
      }
      const outcome = opts.outcome;
      if (!isOutcome(outcome)) {
        throw new CliError("USAGE", "--outcome must be succeeded or failed");
      }
      if (!opts.summary) {
        throw new CliError("USAGE", "--summary is required");
      }
      recordDone(taskId, {
        outcome,
        summary: opts.summary,
        handoff: opts.handoff,
      });
      return { taskId, outcome };
    },
    (res) => log.success(`Task ${res.taskId} marked ${res.outcome}`),
  );
}
