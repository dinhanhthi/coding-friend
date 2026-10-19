import { join } from "path";
import { claudeSessionDir, encodeProjectPath } from "../../paths.js";
import { buildPreamble, shellQuote } from "../preamble.js";
import type { ProviderAdapter, SpawnContext } from "./index.js";

const MAX_TEXT = 4096;

function transcriptPath(ctx: SpawnContext, sessionId: string): string {
  return join(
    claudeSessionDir(encodeProjectPath(ctx.checkout)),
    `${sessionId}.jsonl`,
  );
}

/**
 * Claude Code headless worker (`claude -p --output-format stream-json`).
 * The prompt goes only through stdin; the worker contract goes through
 * --append-system-prompt. Sandbox settings are passed per call (--settings).
 */
export const claude: ProviderAdapter = {
  bin: "claude",

  buildSpawn(task, ctx) {
    // Only this task's dir: other tasks' files (task.json) stay out of reach.
    const filesystem: Record<string, string[]> = { allowWrite: [ctx.taskDir] };
    // denyWrite blocks paths even inside the otherwise writable cwd.
    if (task.readOnly) filesystem.denyWrite = [ctx.checkout];
    const settings = {
      sandbox: {
        enabled: true,
        allowUnsandboxedCommands: false,
        failIfUnavailable: true,
        filesystem,
      },
    };
    const preamble = buildPreamble({
      taskId: task.id,
      readOnly: task.readOnly,
      provider: "claude",
      cfInvocation: ctx.cfInvocation,
      orchDir: ctx.orchDir,
    });
    // dontAsk denies every Bash call that would prompt, sandbox or not, so the
    // worker's own cf ask/done (exactly as the preamble prints them) need an
    // allow rule. Allowed commands still run inside the sandbox.
    const cf = ctx.cfInvocation.map(shellQuote).join(" ");
    // Variadic options (--add-dir, --allowedTools, --disallowedTools) are
    // always followed by another option: no positional.
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--session-id",
      ctx.sessionUuid,
      "--permission-mode",
      task.readOnly ? "dontAsk" : "acceptEdits",
      "--add-dir",
      ctx.taskDir,
      "--allowedTools",
      `Bash(${cf} ask *)`,
      `Bash(${cf} done *)`,
      ...(task.readOnly
        ? ["--disallowedTools", "Edit", "Write", "NotebookEdit"]
        : []),
      "--settings",
      JSON.stringify(settings),
      "--append-system-prompt",
      preamble,
    ];
    return {
      cmd: "claude",
      args,
      stdin: task.prompt,
      env: {
        ...process.env,
        CF_TASK_ID: task.id,
        CF_ORCHESTRATOR_DIR: ctx.orchDir,
      },
    };
  },

  parseLine(line, acc) {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (!ev || typeof ev !== "object") return;
    if (!acc.sessionId && typeof ev.session_id === "string") {
      acc.sessionId = ev.session_id;
    }
    if (ev.type !== "result") return;
    // The last result event wins (a run can emit more than one).
    const ok = ev.subtype === "success" && ev.is_error !== true;
    acc.outcome = ok ? "succeeded" : "failed";
    acc.lastMessage =
      typeof ev.result === "string" ? ev.result.slice(0, MAX_TEXT) : undefined;
    if (ok) {
      acc.error = undefined;
    } else {
      const errors = Array.isArray(ev.errors)
        ? ev.errors.filter((e): e is string => typeof e === "string")
        : [];
      acc.error = (
        errors.join("; ") ||
        acc.lastMessage ||
        `claude result: ${String(ev.subtype)}`
      ).slice(0, MAX_TEXT);
    }
  },

  session(acc, ctx) {
    if (!acc.sessionId) return undefined;
    return {
      sessionId: acc.sessionId,
      transcriptPath: transcriptPath(ctx, acc.sessionId),
    };
  },

  finish(acc, exitCode, ctx) {
    const outcome = acc.outcome ?? (exitCode === 0 ? "succeeded" : "failed");
    const error =
      acc.error ??
      (outcome === "failed"
        ? `claude exited (${exitCode === null ? "signal" : `code ${exitCode}`}) without a result event`
        : undefined);
    return {
      outcome,
      ...claude.session(acc, ctx),
      ...(acc.lastMessage !== undefined && { lastMessage: acc.lastMessage }),
      ...(error !== undefined && { error }),
    };
  },
};
