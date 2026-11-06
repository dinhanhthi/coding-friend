import type { DoneOutcome, Provider, TaskRecord } from "../store.js";
import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { opencode } from "./opencode.js";

/** Everything a provider needs to spawn one worker for a task. */
export interface SpawnContext {
  orchDir: string;
  taskDir: string;
  /** Runner-only dir (`<store>/runner/<id>`), never writable by the worker. */
  privateDir: string;
  checkout: string;
  /** [process.execPath, ...process.execArgv, process.argv[1]] */
  cfInvocation: string[];
  /** Fresh UUID for Claude's --session-id (unused by Codex). */
  sessionUuid: string;
  /** Continue this provider session instead of starting a fresh one. */
  resume?: { sessionId: string };
  /** Model for this attempt's provider (`policy.models[provider]`). */
  model?: string;
  /**
   * Session id returned by `prepare()`, set before `buildSpawn`. Like
   * `SpawnSpec.sessionId`, the runner records it only once `acc.accepted`.
   */
  preparedSessionId?: string;
}

export interface SpawnSpec {
  cmd: string;
  args: string[];
  /** Written to the worker's stdin, then stdin is closed. */
  stdin: string;
  env: NodeJS.ProcessEnv;
  /** Worker cwd; default the task's checkout. */
  cwd?: string;
  /**
   * Preset session id. The runner records it only once the stream confirms
   * the prompt was received (`StreamAcc.accepted`), never right after spawn.
   * Must pass `isSessionId` (store.ts), else the record throws and the id is
   * dropped.
   */
  sessionId?: string;
}

/** Usage-limit hit seen in the stream; resetsAt is epoch seconds, null when unknown. */
export interface QuotaSignal {
  resetsAt: number | null;
  /** Which stream signal reported it (e.g. the event type). */
  source: string;
}

/** State parsed from the worker's JSON event stream, kept in memory only. */
export interface StreamAcc {
  sessionId?: string;
  outcome?: DoneOutcome;
  lastMessage?: string;
  error?: string;
  quota?: QuotaSignal;
  /** Set by parseLine once the stream shows the provider received the prompt. */
  accepted?: boolean;
  /** Set by parseLine on a mid-run safety violation: the runner kills the worker. */
  abort?: string;
}

/** Field names match SessionRecord / ResultRecord in store.ts. */
export interface FinishResult {
  outcome: DoneOutcome;
  sessionId?: string;
  transcriptPath?: string;
  lastMessage?: string;
  error?: string;
  /** Set when the run failed on a usage limit; outcome stays a DoneOutcome. */
  quota?: QuotaSignal;
}

/** Why a provider cannot run a task, as a CliError code + message. */
export interface Ineligibility {
  code: "USAGE" | "PROVIDER_UNAVAILABLE";
  message: string;
}

/** What eligibility knows about a task (no prompt, no store paths). */
export type ProviderRequest = {
  isGitRepo: boolean;
  readOnly: boolean;
  models?: Partial<Record<Provider, string>>;
  checkout: string;
};

/**
 * Run a command without a shell, with a timeout (injected by the runner).
 * The child's env is the runner's env (what a worker gets) with `opts.env`
 * added or overriding; `CLAUDECODE`, `CF_TASK_DIGEST` and `CF_TASK_CHECKOUT`
 * are always removed. `timeoutMs` (clamped to 1 ms..10 min) covers the run
 * until exit; on timeout the call rejects within a short drain even if a
 * grandchild keeps the pipes open. Calls are sequential: a stop signal only
 * reaches the latest exec.
 */
export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string; timeoutMs: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** What a provider can do; eligibility filters on it. */
export interface ProviderCaps {
  writer: boolean;
  readOnly: boolean;
  /** Read-only tasks may run outside a git repo. */
  nonGitReadOnly: boolean;
  /** Needs `task.models.<p>` or `--model`: no usable default model. */
  needsModel: boolean;
  chef: boolean;
  /** The worker can run the preamble's `cf ask` / `cf done` in its shell. */
  cfShell: boolean;
}

/**
 * Per attempt, in this order: `preflight` → `workspaceFiles` → `prepare` →
 * `buildSpawn`. `buildSpawn` and `prepare` may throw: the attempt then fails
 * without a spawn and without a session id.
 */
export interface ProviderAdapter {
  bin: string;
  caps: ProviderCaps;
  /** Seconds the preamble's `cf ask` waits for an answer. */
  askTimeoutS?: number;
  /** Provider-specific refusal before any spawn, else undefined. */
  preflight?(req: ProviderRequest): Ineligibility | undefined;
  /** Files (path relative to the workspace → content) the runner writes into `workspaceDir()`. */
  workspaceFiles?(
    task: TaskRecord,
    ctx: SpawnContext,
    prompt: string,
  ): { files: Record<string, string> } | undefined;
  /**
   * Attempt-level side effects before spawn (the only place for them). A
   * returned `sessionId` must pass `isSessionId` (store.ts), else the record
   * throws and the id is dropped.
   */
  prepare?(
    task: TaskRecord,
    ctx: SpawnContext,
    exec: ExecFn,
  ): Promise<{ sessionId?: string }>;
  /** Task-level paths the runner/tick removes when the task ends. */
  cleanupPaths?(task: TaskRecord): string[];
  buildSpawn(task: TaskRecord, ctx: SpawnContext): SpawnSpec;
  parseLine(
    line: string,
    acc: StreamAcc,
    ctx?: SpawnContext,
    task?: TaskRecord,
  ): void;
  /** session.json data once a session id was seen, else undefined. */
  session(
    acc: StreamAcc,
    ctx: SpawnContext,
  ): { sessionId: string; transcriptPath?: string } | undefined;
  /** `sessionId` only when the stream confirmed it (never a preset id). */
  finish(
    acc: StreamAcc,
    exitCode: number | null,
    ctx: SpawnContext,
    stderrTail?: string,
  ): FinishResult;
}

export const PROVIDERS: Record<Provider, ProviderAdapter> = {
  claude,
  codex,
  opencode,
};
