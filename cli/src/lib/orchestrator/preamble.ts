import { join } from "path";

/** Quote one word for a POSIX shell (single quotes, `'` → `'\''`). */
export function shellQuote(word: string): string {
  if (/^[A-Za-z0-9_\/.,:=@%+-]+$/.test(word)) return word;
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

/**
 * The worker contract appended to the provider's system prompt (Claude) or
 * prepended to the prompt (Codex). `cfInvocation` is the absolute command of
 * the running CLI: [process.execPath, ...process.execArgv, process.argv[1]].
 * The adapter passes its own `askTimeoutS` and `caps.cfShell` (never looked
 * up here: importing PROVIDERS would cycle back through the adapters).
 * `cfShell: false` gives the variant without cf ask/done: the outcome then
 * comes from the worker's stream.
 */
export function buildPreamble(
  opts: {
    taskId: string;
    readOnly: boolean;
    cfInvocation: string[];
    orchDir: string;
  } & (
    | { cfShell: true; askTimeoutS: number }
    | { cfShell: false; askTimeoutS?: number }
  ),
): string {
  const { taskId, readOnly } = opts;
  const head = `You are a non-interactive worker for Coding Friend task ${taskId}. Nobody watches this session: never ask the user anything interactively and never wait for input.`;
  const readOnlyNote = readOnly
    ? ["This is a read-only task: do not modify files in the repository."]
    : [];
  const handoff = join(opts.orchDir, "tasks", taskId, "handoff.md");

  if (!opts.cfShell) {
    return [
      head,
      ...readOnlyNote,
      "You cannot ask the user questions: when something is unclear, make the most reasonable assumption and say so in your final message.",
      `If you have notes for whoever continues this work, write them to ${handoff}`,
      "Coding Friend reads the outcome of this task from your final message: end with a short summary of what you did, or of why you could not complete the task.",
    ].join("\n\n");
  }

  const cf = opts.cfInvocation.map(shellQuote).join(" ");
  const n = opts.askTimeoutS;
  // 100 s is cf ask's default: no flag. Codex's shell tool returns a running
  // command after at most ~30 s, so it passes 25; re-asking is idempotent.
  const timeout = n === 100 ? "" : ` --timeout ${n}`;
  const waitNote =
    n === 100
      ? "Each call can wait up to 100 seconds for an answer; let it finish and do not run it in the background."
      : n === 25
        ? "Each call waits up to 25 seconds for an answer."
        : `Each call waits up to ${n} seconds for an answer.`;

  return [
    head,
    ...readOnlyNote,
    "Run each cf command below (ask and done) as a single standalone command, exactly as shown: never chain it with ;, &&, || or |, never wrap it in a subshell, and never add echo after it. The tool reports the exit code anyway.",
    [
      "To ask the user a question, run:",
      `  ${cf} ask --task ${taskId}${timeout} '<question>'`,
      `${waitNote} Always check the exit code: exit code 0 means stdout is the answer. Exit code 1 means there is no answer yet (ASK_TIMEOUT) or an error, and stdout then holds an error message, not an answer: run the exact same command again to keep waiting.`,
    ].join("\n"),
    `If you have notes for whoever continues this work, write them to ${handoff}`,
    [
      "When you are finished, run exactly once:",
      `  ${cf} done --task ${taskId} --outcome succeeded --summary '<one line>'`,
      `Use --outcome failed instead if you could not complete the task. Add --handoff ${shellQuote(handoff)} if you wrote handoff notes.`,
    ].join("\n"),
  ].join("\n\n");
}
