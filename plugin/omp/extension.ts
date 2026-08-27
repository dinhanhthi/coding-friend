import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HookAPI } from "./pi-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CF_HOST = "omp";
const PLUGIN_ROOT_COMMENT = /^\/\/ CODING_FRIEND_PLUGIN_ROOT=(.+)$/;
const SECURITY_HOOKS = new Set(["privacy-block.sh", "scout-block.cjs"]);

interface HookRun {
  status: number;
  stdout: string;
  stderr: string;
}

function pluginRootFromComment(file: string): string | undefined {
  try {
    const line = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
    const match = line.match(PLUGIN_ROOT_COMMENT);
    const root = match?.[1]?.trim();
    return root || undefined;
  } catch {
    return undefined;
  }
}

function pluginRoot(): string {
  const fromEnv = process.env.CODING_FRIEND_PLUGIN_ROOT?.trim();
  if (fromEnv) return fromEnv;

  const nearby = join(__dirname, "..");
  if (existsSync(join(nearby, "hooks"))) return nearby;

  const shims = [join(process.cwd(), ".omp", "extensions", "coding-friend.ts")];
  const ompHome = process.env.OMP_HOME;
  if (ompHome) {
    shims.push(join(ompHome, "agent", "extensions", "coding-friend.ts"));
  }
  for (const shim of shims) {
    const root = pluginRootFromComment(shim);
    if (root) return root;
  }
  return nearby;
}

function hooksDir(): string {
  return join(pluginRoot(), "hooks");
}

function hookEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
  const root = pluginRoot();
  return {
    ...process.env,
    CF_HOST,
    CODING_FRIEND_PLUGIN_ROOT: root,
    CLAUDE_PLUGIN_ROOT: root,
    ...extraEnv,
  };
}

function stripOmpSelector(value: string): string {
  return value.replace(/:(?:raw|conflicts|\d+-\d+)$/i, "");
}

function unwrapHashline(value: string): string {
  const wrapped = value.match(/^\[([^#\]]+)#[^\]]*\]$/);
  return wrapped?.[1] ?? value;
}

function normalizePathCandidate(value: string): string {
  return stripOmpSelector(unwrapHashline(value.trim()));
}

function hashlinePaths(value: string): string[] {
  const paths: string[] = [];
  const re = /\[([^#\]]+)#[^\]]*\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const path = normalizePathCandidate(match[1]);
    if (path) paths.push(path);
  }
  return paths;
}

function collectPathCandidates(obj: Record<string, unknown>): string[] {
  const raw: unknown[] = [obj.file_path, obj.path];
  if (typeof obj.path === "string" && obj.path.includes(";")) {
    raw.push(...obj.path.split(";"));
  }
  if (Array.isArray(obj.paths)) raw.push(...obj.paths);
  if (typeof obj.input === "string") raw.push(...hashlinePaths(obj.input));
  if (typeof obj.command === "string") raw.push(...hashlinePaths(obj.command));
  const paths: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || !value.trim()) continue;
    const path = normalizePathCandidate(value);
    if (path) paths.push(path);
  }
  return paths;
}

/**
 * Claude privacy-block greps `tool_input.file_path`. omp uses `input.path`
 * (and sometimes `paths[]` or hashline `[PATH#TAG]`).
 */
function normalizeToolInput(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const obj = { ...(input as Record<string, unknown>) };
  const paths = collectPathCandidates(obj);
  if (paths.length > 0) {
    obj.file_path = paths.join(" ");
  }
  return obj;
}

/**
 * Claude hooks expect snake_case fields (`tool_name`, `tool_input`).
 * omp events use camelCase (`toolName`, `input`). Emit a lean payload so
 * memory-capture's `grep session_id` cannot match nested message text.
 */
function toHookStdin(
  event: unknown,
  extras: Record<string, unknown> = {},
): string {
  const src: Record<string, unknown> =
    event !== null && typeof event === "object"
      ? (event as Record<string, unknown>)
      : {};
  const payload: Record<string, unknown> = {};
  const sessionId = src.session_id ?? src.sessionId;
  if (sessionId != null) payload.session_id = sessionId;
  const toolName = src.tool_name ?? src.toolName;
  if (toolName != null) payload.tool_name = toolName;
  const rawInput = src.tool_input ?? src.input;
  if (rawInput != null) payload.tool_input = normalizeToolInput(rawInput);
  const agentType =
    src.agent_type ?? src.agentType ?? src.agentName ?? src.agent_name;
  if (agentType != null) payload.agent_type = agentType;
  Object.assign(payload, extras);
  try {
    return JSON.stringify(payload);
  } catch {
    return "{}";
  }
}

function failClosedRun(stderr: string, stdout = ""): HookRun {
  console.error(stderr || "coding-friend omp security hook failed closed");
  return { status: 1, stdout, stderr };
}

function runHook(
  script: string,
  extraEnv: Record<string, string> = {},
  stdin = "",
): HookRun {
  const failClosed = SECURITY_HOOKS.has(script);
  const file = join(hooksDir(), script);
  if (!existsSync(file)) {
    const stderr = `coding-friend omp hook missing: ${file}`;
    return failClosed
      ? failClosedRun(stderr)
      : { status: 0, stdout: "", stderr: "" };
  }

  const ext = extname(file);
  const command = ext === ".cjs" || ext === ".js" ? "node" : "bash";
  try {
    const result = spawnSync(command, [file], {
      input: stdin,
      encoding: "utf8",
      env: hookEnv(extraEnv),
      maxBuffer: 8 * 1024 * 1024,
    });
    const stderr =
      result.stderr || (result.error ? result.error.message : "") || "";
    const spawnFailed = result.error != null || result.status == null;
    if (failClosed && spawnFailed) {
      return failClosedRun(stderr, result.stdout ?? "");
    }
    return {
      status: result.status ?? (failClosed ? 1 : 0),
      stdout: result.stdout ?? "",
      stderr,
    };
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err);
    return failClosed
      ? failClosedRun(stderr)
      : { status: 0, stdout: "", stderr };
  }
}

function hookReason(result: HookRun, fallback: string): string {
  const err = result.stderr.trim();
  if (err) return err;
  const out = result.stdout.trim();
  if (out) {
    try {
      const parsed = JSON.parse(out) as {
        hookSpecificOutput?: {
          reason?: unknown;
          permissionDecisionReason?: unknown;
        };
      };
      const specific = parsed.hookSpecificOutput;
      if (typeof specific?.reason === "string" && specific.reason) {
        return specific.reason;
      }
      if (
        typeof specific?.permissionDecisionReason === "string" &&
        specific.permissionDecisionReason
      ) {
        return specific.permissionDecisionReason;
      }
    } catch {
      // stdout is not Claude hook JSON
    }
  }
  return fallback;
}

function additionalContextFromStdout(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as {
      hookSpecificOutput?: { additionalContext?: unknown };
    };
    const ctx = parsed.hookSpecificOutput?.additionalContext;
    if (typeof ctx === "string" && ctx.length > 0) return ctx;
  } catch {
    // not Claude hook JSON — use raw stdout
  }
  return trimmed;
}

function onSessionStart(pi: HookAPI, event: unknown): void {
  const result = runHook("session-init.sh", {}, toHookStdin(event));
  if (result.status !== 0) return;
  const additionalContext = additionalContextFromStdout(result.stdout);
  if (!additionalContext) return;
  // omp session_start is void; inject via HookAPI.sendMessage (extensions.md).
  pi.sendMessage?.({
    customType: "coding-friend.session-init",
    content: additionalContext,
    display: false,
  });
}

function onToolCall(
  event: unknown,
): { block: true; reason: string } | undefined {
  const stdin = toHookStdin(event);
  const privacy = runHook("privacy-block.sh", {}, stdin);
  if (privacy.status !== 0) {
    return {
      block: true,
      reason: hookReason(privacy, "blocked by privacy-block"),
    };
  }
  const scout = runHook("scout-block.cjs", {}, stdin);
  if (scout.status !== 0) {
    return {
      block: true,
      reason: hookReason(scout, "blocked by scout-block"),
    };
  }
  const approve = runHook("auto-approve.cjs", {}, stdin);
  if (approve.status !== 0) {
    return {
      block: true,
      reason: hookReason(approve, "denied by auto-approve"),
    };
  }
  return undefined;
}

function captureMemory(event: unknown): string {
  return runHook("memory-capture.sh", {}, toHookStdin(event)).stdout.trim();
}

function onSessionBeforeCompact(event: unknown): void {
  // Real contract is { cancel, compaction } — we do not use that.
  // Capture may run as fire-and-forget; never return { context }.
  captureMemory(event);
}

function onSessionCompacting(
  event: unknown,
): { context: string[] } | undefined {
  const text = captureMemory(event);
  if (!text) return undefined;
  return { context: [text] };
}

function onSessionShutdown(event: unknown): void {
  runHook("session-log.sh", {}, toHookStdin(event));
}

function onBeforeAgentStart(event: unknown): void {
  runHook(
    "agent-tracker.sh",
    {},
    toHookStdin(event, { hook_event_name: "SubagentStart" }),
  );
}

export default function createExtension(pi: HookAPI): void {
  pi.on("session_start", (event) => onSessionStart(pi, event));
  pi.on("tool_call", onToolCall);
  // Official compact events (hooks.md / extensions.md). Only
  // session.compacting accepts { context }; session_compacting is not real.
  pi.on("session_before_compact", onSessionBeforeCompact);
  pi.on("session.compacting", onSessionCompacting);
  pi.on("session_compact", onSessionCompacting);
  pi.on("session_shutdown", onSessionShutdown);
  pi.on("before_agent_start", onBeforeAgentStart);
}
