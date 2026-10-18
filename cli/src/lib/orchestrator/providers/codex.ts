import { readFileSync } from "fs";
import { join } from "path";
import { buildPreamble } from "../preamble.js";
import type { ProviderAdapter, SpawnContext } from "./index.js";

const MAX_TEXT = 4096;

function lastMessageFile(ctx: SpawnContext): string {
  return join(ctx.taskDir, "last-message.txt");
}

function readLastMessage(ctx: SpawnContext): string | undefined {
  try {
    const text = readFileSync(lastMessageFile(ctx), "utf-8");
    return text ? text.slice(0, MAX_TEXT) : undefined;
  } catch {
    return undefined;
  }
}

function errorMessage(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const m = (v as { message?: unknown }).message;
  return typeof m === "string" ? m.slice(0, MAX_TEXT) : undefined;
}

/**
 * Codex worker (`codex exec --json`). Preamble + prompt go through stdin
 * (`-`). The last agent message is written by codex itself to `-o`.
 */
export const codex: ProviderAdapter = {
  bin: "codex",

  buildSpawn(task, ctx) {
    const args = [
      "exec",
      "--json",
      "--color",
      "never",
      "--sandbox",
      task.readOnly ? "read-only" : "workspace-write",
      "-C",
      ctx.checkout,
      // Read-only: no writable task dir, so the preamble omits cf ask/done.
      ...(task.readOnly ? [] : ["--add-dir", ctx.taskDir]),
      "-o",
      lastMessageFile(ctx),
      "-",
    ];
    const preamble = buildPreamble({
      taskId: task.id,
      readOnly: task.readOnly,
      provider: "codex",
      cfInvocation: ctx.cfInvocation,
      orchDir: ctx.orchDir,
    });
    return {
      cmd: "codex",
      args,
      stdin: `${preamble}\n\n---\n\n${task.prompt}`,
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
    switch (ev.type) {
      case "thread.started":
        if (!acc.sessionId && typeof ev.thread_id === "string") {
          acc.sessionId = ev.thread_id;
        }
        break;
      case "turn.completed":
        acc.outcome = "succeeded";
        acc.error = undefined;
        break;
      case "turn.failed":
        acc.outcome = "failed";
        acc.error = errorMessage(ev.error) ?? acc.error ?? "turn failed";
        break;
      // Not terminal on its own: a turn.failed (or turn.completed) may follow.
      case "error":
        acc.error = errorMessage(ev) ?? acc.error;
        break;
      case "item.completed": {
        const item = ev.item as { type?: unknown; text?: unknown } | undefined;
        if (item?.type === "agent_message" && typeof item.text === "string") {
          acc.lastMessage = item.text.slice(0, MAX_TEXT);
        }
        break;
      }
    }
  },

  session(acc) {
    return acc.sessionId ? { sessionId: acc.sessionId } : undefined;
  },

  finish(acc, exitCode, ctx) {
    const outcome =
      acc.outcome ??
      (exitCode === 0 && acc.error === undefined ? "succeeded" : "failed");
    const error =
      outcome === "failed"
        ? (acc.error ??
          `codex exited (${exitCode === null ? "signal" : `code ${exitCode}`}) without a turn result`)
        : undefined;
    const lastMessage = readLastMessage(ctx) ?? acc.lastMessage;
    return {
      outcome,
      ...(acc.sessionId !== undefined && { sessionId: acc.sessionId }),
      ...(lastMessage !== undefined && { lastMessage }),
      ...(error !== undefined && { error }),
    };
  },
};
