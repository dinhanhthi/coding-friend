import { join } from "path";
import type { Provider } from "./store.js";

/** Quote one word for a POSIX shell (single quotes, `'` → `'\''`). */
export function shellQuote(word: string): string {
  if (/^[A-Za-z0-9_\/.,:=@%+-]+$/.test(word)) return word;
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

/**
 * The worker contract appended to the provider's system prompt (Claude) or
 * prepended to the prompt (Codex). `cfInvocation` is the absolute command of
 * the running CLI: [process.execPath, ...process.execArgv, process.argv[1]].
 */
export function buildPreamble(opts: {
  taskId: string;
  readOnly: boolean;
  provider: Provider;
  cfInvocation: string[];
  orchDir: string;
}): string {
  const { taskId, readOnly, provider } = opts;
  const head = `You are a non-interactive worker for Coding Friend task ${taskId}. Nobody watches this session: never ask the user anything interactively and never wait for input.`;

  const cf = opts.cfInvocation.map(shellQuote).join(" ");
  const handoff = join(opts.orchDir, "tasks", taskId, "handoff.md");
  // Codex's shell tool returns a running command after at most ~30 s, so
  // keep each wait short there; re-asking the same question is idempotent.
  const timeout = provider === "codex" ? " --timeout 25" : "";
  const waitNote =
    provider === "codex"
      ? "Each call waits up to 25 seconds for an answer."
      : "Each call can wait up to 100 seconds for an answer; let it finish and do not run it in the background.";

  return [
    head,
    ...(readOnly
      ? ["This is a read-only task: do not modify files in the repository."]
      : []),
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
