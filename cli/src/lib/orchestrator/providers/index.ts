import type { DoneOutcome, Provider, TaskRecord } from "../store.js";
import { claude } from "./claude.js";
import { codex } from "./codex.js";

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
}

export interface SpawnSpec {
  cmd: string;
  args: string[];
  /** Written to the worker's stdin, then stdin is closed. */
  stdin: string;
  env: NodeJS.ProcessEnv;
}

/** State parsed from the worker's JSON event stream, kept in memory only. */
export interface StreamAcc {
  sessionId?: string;
  outcome?: DoneOutcome;
  lastMessage?: string;
  error?: string;
}

/** Field names match SessionRecord / ResultRecord in store.ts. */
export interface FinishResult {
  outcome: DoneOutcome;
  sessionId?: string;
  transcriptPath?: string;
  lastMessage?: string;
  error?: string;
}

export interface ProviderAdapter {
  bin: string;
  buildSpawn(task: TaskRecord, ctx: SpawnContext): SpawnSpec;
  parseLine(line: string, acc: StreamAcc): void;
  /** session.json data once a session id was seen, else undefined. */
  session(
    acc: StreamAcc,
    ctx: SpawnContext,
  ): { sessionId: string; transcriptPath?: string } | undefined;
  finish(
    acc: StreamAcc,
    exitCode: number | null,
    ctx: SpawnContext,
  ): FinishResult;
}

export const PROVIDERS: Record<Provider, ProviderAdapter> = { claude, codex };
