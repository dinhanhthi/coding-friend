import { join } from "path";
import { claudeSessionDir, encodeProjectPath } from "../../paths.js";
import { buildPreamble, shellQuote } from "../preamble.js";
import { normalizeResetsAt } from "../quota.js";
import { isModelName, isSessionId } from "../store.js";
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
  caps: {
    writer: true,
    readOnly: true,
    nonGitReadOnly: true,
    needsModel: false,
    chef: true,
    cfShell: true,
  },
  askTimeoutS: 100,

  buildSpawn(task, ctx) {
    if (ctx.resume && !isSessionId(ctx.resume.sessionId)) {
      throw new Error("refusing to resume an invalid session id");
    }
    if (ctx.model !== undefined && !isModelName(ctx.model)) {
      throw new Error("refusing an invalid model name");
    }
    // Only this task's dir: other tasks' files (task.json) stay out of reach.
    const filesystem: Record<string, string[]> = { allowWrite: [ctx.taskDir] };
    // denyWrite blocks paths even inside the otherwise writable cwd, and wins
    // over the sandbox's default per-user temp dir write access: the store's
    // trusted dirs stay out of reach even if the store lives there. (Denying
    // the whole store would also block the nested task dir.)
    filesystem.denyWrite = [
      ...(task.readOnly ? [ctx.checkout] : []),
      ...["runs", "leases", "runner", "supervisor", "chefs"].map((d) =>
        join(ctx.orchDir, d),
      ),
    ];
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
      ...(ctx.resume
        ? ["--resume", ctx.resume.sessionId]
        : ["--session-id", ctx.sessionUuid]),
      ...(ctx.model !== undefined ? ["--model", ctx.model] : []),
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
    // No CLAUDE_CODE_RETRY_WATCHDOG*: CF, not Claude, decides wait or switch.
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (!k.startsWith("CLAUDE_CODE_RETRY_WATCHDOG")) env[k] = v;
    }
    env.CF_TASK_ID = task.id;
    env.CF_ORCHESTRATOR_DIR = ctx.orchDir;
    return { cmd: "claude", args, stdin: task.prompt, env };
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
    if (ev.type === "rate_limit_event") {
      const info = ev.rate_limit_info as Record<string, unknown> | undefined;
      // "allowed" / "allowed_warning" are not a stop.
      if (info && typeof info === "object" && info.status === "rejected") {
        acc.quota = {
          resetsAt: normalizeResetsAt(info.resetsAt),
          source: "claude.rate_limit_event",
        };
      }
      return;
    }
    // Fallbacks without a reset time; never replace an event-derived quota.
    if (ev.type === "assistant" && ev.error === "rate_limit") {
      acc.quota ??= { resetsAt: null, source: "claude.assistant.rate_limit" };
      return;
    }
    if (ev.type !== "result") return;
    if (ev.is_error === true && ev.api_error_status === 429) {
      acc.quota ??= { resetsAt: null, source: "claude.result.429" };
    }
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
      ...(acc.quota && outcome === "failed" && { quota: acc.quota }),
    };
  },
};
