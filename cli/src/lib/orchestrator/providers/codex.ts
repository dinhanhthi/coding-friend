import { lstatSync, readFileSync } from "fs";
import { join } from "path";
import { buildPreamble } from "../preamble.js";
import type { ProviderAdapter, SpawnContext } from "./index.js";

const MAX_TEXT = 4096;
const PROFILE = "cf_task";
/**
 * Permission profiles (beta) changed through 0.142–0.156; this is the oldest
 * version verified to enforce them. Older versions may silently ignore the
 * `-c` keys and fall back to the user's sandbox_mode.
 */
export const MIN_CODEX_VERSION = "0.161.0";

/**
 * In the runner's private dir, not the worker-writable task dir: codex writes
 * `-o` outside its sandbox, so a worker-planted symlink there would redirect it.
 */
function lastMessageFile(ctx: SpawnContext): string {
  return join(ctx.privateDir, "last-message.txt");
}

function readLastMessage(ctx: SpawnContext): string | undefined {
  try {
    const file = lastMessageFile(ctx);
    if (!lstatSync(file).isFile()) return undefined; // never read through a symlink
    const text = readFileSync(file, "utf-8");
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
    // A permission profile, not --sandbox (which would override it): the store
    // is read-only even under the writable /tmp, and only this task's dir is
    // writable, so read-only workers can run cf ask/done too. Paths are TOML
    // basic strings: JSON escaping is valid TOML there.
    const filesystem = `{${JSON.stringify(ctx.orchDir)}="read",${JSON.stringify(ctx.taskDir)}="write"}`;
    const args = [
      "exec",
      "--json",
      "--color",
      "never",
      "-c",
      `default_permissions="${PROFILE}"`,
      "-c",
      `permissions.${PROFILE}.extends="${task.readOnly ? ":read-only" : ":workspace"}"`,
      "-c",
      `permissions.${PROFILE}.filesystem=${filesystem}`,
      "-C",
      ctx.checkout,
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
