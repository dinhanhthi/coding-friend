import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { reply } from "../lib/orchestrator/store.js";

interface Flags {
  task?: string;
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

export async function replyCommand(
  qid: string,
  answer: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      reply(qid, answer, opts.task);
      return { qid };
    },
    (res) => log.success(`Replied to ${res.qid}`),
  );
}
