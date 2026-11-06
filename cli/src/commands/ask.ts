import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { createAsk, readAnswer } from "../lib/orchestrator/store.js";

interface Flags {
  task?: string;
  timeout?: string;
  json?: boolean;
}

const DEFAULT_TIMEOUT_SECONDS = 100;

/** JSON mode → envelope; human mode → log CliError then exit 1 via runHuman. */
async function run<T>(
  json: boolean | undefined,
  fn: () => Promise<T>,
  print: (data: T) => void,
): Promise<void> {
  if (json) {
    await runJson(fn);
    return;
  }
  await runHuman(async () => {
    try {
      print(await fn());
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_TIMEOUT_SECONDS;
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new CliError(
      "USAGE",
      `--timeout must be a positive integer (seconds), got ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

async function waitForAnswer(
  taskId: string,
  question: string,
  timeoutSeconds: number,
): Promise<{ qid: string; answer: string }> {
  const { qid, answer } = createAsk(taskId, question);
  if (answer !== undefined) return { qid, answer };
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const wait = Math.min(1000, deadline - Date.now());
    await new Promise((r) => setTimeout(r, wait));
    const a = readAnswer(qid, taskId);
    if (a !== undefined) return { qid, answer: a };
  }
  throw new CliError(
    "ASK_TIMEOUT",
    `No answer yet for ${qid}; run the same cf ask command again to keep waiting.`,
  );
}

export async function askCommand(question: string, opts: Flags): Promise<void> {
  await run(
    opts.json,
    async () => {
      const taskId = opts.task || process.env.CF_TASK_ID;
      if (!taskId) {
        throw new CliError(
          "USAGE",
          "No task id: pass --task or set CF_TASK_ID",
        );
      }
      return waitForAnswer(taskId, question, parseTimeout(opts.timeout));
    },
    // The answer comes from the user (`cf reply`); print it alone so the
    // worker's shell captures exactly that text.
    ({ answer }) => console.log(answer),
  );
}
