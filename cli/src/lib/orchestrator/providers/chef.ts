import { readdirSync, unlinkSync } from "fs";
import { isAbsolute, join } from "path";
import { run } from "../../exec.js";
import { compareVersions, extractVersion } from "../../host.js";
import { CHEF_OUTPUT_SCHEMA } from "../chef-actions.js";
import { CHEF_CONTRACT } from "../chef-digest.js";
import { makeChefHooksDir } from "../chef-git.js";
import { type ChefRecord, makeChefPrivateDir } from "../chef-store.js";
import {
  createOnce,
  isSessionId,
  type Provider,
  readRegularFile,
  serialize,
} from "../store.js";
import { claude } from "./claude.js";
import { codex, MIN_CODEX_VERSION } from "./codex.js";
import type { SpawnContext, StreamAcc } from "./index.js";

/**
 * Chef process spawn (C2b task 3.4), separate from the worker `buildSpawn`.
 * Builders only prepare dirs and files under `chefs/<id>/private/`; the wake
 * (3.7) spawns, times out and kills the process group.
 *
 * Both providers run with cwd = `chefs/<id>/private/cwd`, a CF-owned empty
 * dir that is not a git repo, and read the checkout by absolute path
 * (Claude through `--add-dir`). Probe 2026-10-22 (claude 2.1.308): with
 * cwd = checkout, Claude Code runs `git status` in the checkout on every
 * turn; with the empty cwd its only git calls run in that dir.
 */

/** Oldest claude with `--restricted --safe-mode` (and `--add-dir` under them). */
export const MIN_CLAUDE_VERSION = "2.1.248";

/** Flags the Claude chef cannot run without (checked at `cf chef start`). */
export const REQUIRED_CLAUDE_FLAGS = ["--safe-mode", "--add-dir"] as const;

/** Cap on the Codex `-o` file (20 actions with 32k prompts fit easily). */
export const MAX_CHEF_OUTPUT_BYTES = 1024 * 1024;

/** `CLAUDE_CODE_*` variables tying a process to the parent Claude Code session. */
const SESSION_LINK_ENV = /^CLAUDE_CODE_\w*(SESSION|CHILD|SOCKET|MESSAGING)/;

const PROFILE = "cf_chef";
const SCHEMA_FILE = "output-schema.json";
const LAST_MESSAGE_FILE = "last-message";

export interface ChefSpawnInput {
  chef: Pick<
    ChefRecord,
    "id" | "provider" | "checkout" | "binaries" | "sessionUuid"
  >;
  /** Wake number: the Codex schema and `-o` files live in `private/<wake>/`. */
  wake: number;
  /** Digest of this wake (chef-digest.ts), sent on stdin. */
  digest: string;
  /** Session to continue (Claude session id / Codex thread id); absent on the first wake. */
  resume?: { sessionId: string };
}

export interface ChefSpawnSpec {
  provider: Provider;
  /** Absolute binary from chef.json, never resolved through PATH. */
  cmd: string;
  args: string[];
  /** `chefs/<id>/private/cwd`: never the checkout. */
  cwd: string;
  stdin: string;
  env: NodeJS.ProcessEnv;
  /** Codex `-o` file (CF-owned), read by `finishChefRun`. */
  outputFile?: string;
}

export interface ChefStreamAcc extends StreamAcc {
  /** Claude: `structured_output` of the last `result` event. */
  structuredOutput?: unknown;
  /** Claude: `subtype` of the last `result` event. */
  resultSubtype?: string;
}

export type ChefRunResult =
  | { outcome: "ok"; output: unknown; sessionId?: string }
  | {
      outcome: "quota";
      resetsAt: number | null;
      sessionId?: string;
      error?: string;
    }
  | { outcome: "failed"; error: string; sessionId?: string };

// ─── env ────────────────────────────────────────────────────────────────

/**
 * Env of a chef process (both providers): the parent env without inherited
 * `GIT_*`, `CLAUDE_CODE_RETRY_WATCHDOG*` (CF, not Claude, handles quota),
 * `CLAUDECODE` (nested-session refusal) and the `CLAUDE_CODE_*` variables
 * that link a process to the Claude Code session that started CF (names
 * containing SESSION, CHILD, SOCKET or MESSAGING, e.g.
 * `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION`,
 * `CLAUDE_CODE_MESSAGING_SOCKET`/`_TOKEN`: a chef is its own session, never
 * a child of the user's), plus a hardened git config: CF's empty hooks dir
 * and no fsmonitor for any git the process runs. Other `CLAUDE_CODE_*`
 * variables are kept (conservative: they may configure the provider).
 *
 * Defence in depth only: Claude Code replaces `GIT_CONFIG_COUNT`/`KEY_*`/
 * `VALUE_*` with its own list for its git calls (probe 2026-10-22), so this
 * env never reaches them. The real control is the cwd rule: the chef runs in
 * an empty non-repo dir, so its own git calls never touch the checkout.
 */
export function chefEnv(
  hooksDir: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) {
    if (k.startsWith("GIT_")) continue;
    if (k.startsWith("CLAUDE_CODE_RETRY_WATCHDOG") || k === "CLAUDECODE") {
      continue;
    }
    if (SESSION_LINK_ENV.test(k)) continue;
    env[k] = v;
  }
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_COUNT = "2";
  env.GIT_CONFIG_KEY_0 = "core.hooksPath";
  env.GIT_CONFIG_VALUE_0 = hooksDir;
  env.GIT_CONFIG_KEY_1 = "core.fsmonitor";
  env.GIT_CONFIG_VALUE_1 = "false";
  return env;
}

// ─── spawn ──────────────────────────────────────────────────────────────

function chefBinary(input: ChefSpawnInput, provider: Provider): string {
  const bin = input.chef.binaries[provider];
  if (!bin || !isAbsolute(bin)) {
    throw new Error(`chef ${input.chef.id} has no absolute ${provider} binary`);
  }
  return bin;
}

/** `private/cwd`, refused unless it is a real, empty dir. */
function chefCwd(id: string): string {
  const cwd = makeChefPrivateDir(id, "cwd");
  if (readdirSync(cwd).length !== 0) {
    throw new Error(`chef cwd is not empty: ${cwd}`);
  }
  return cwd;
}

function resumeId(input: ChefSpawnInput): string | undefined {
  if (!input.resume) return undefined;
  if (!isSessionId(input.resume.sessionId)) {
    throw new Error("refusing to resume an invalid chef session id");
  }
  return input.resume.sessionId;
}

/**
 * Claude chef: read-only tools confined to the checkout (`--add-dir`), no
 * settings/CLAUDE.md/skills/hooks/MCP (`--restricted --safe-mode
 * --strict-mcp-config`). The contract goes through --append-system-prompt
 * (frozen at the first request), the digest through stdin. Never `--bare`.
 */
export function buildClaudeChefSpawn(input: ChefSpawnInput): ChefSpawnSpec {
  const cmd = chefBinary(input, "claude");
  const resume = resumeId(input);
  // Variadic options (--add-dir, --tools) are always followed by another option.
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    ...(resume
      ? ["--resume", resume]
      : ["--session-id", input.chef.sessionUuid]),
    "--restricted",
    "--safe-mode",
    "--add-dir",
    input.chef.checkout,
    "--tools",
    "Read",
    "Grep",
    "Glob",
    "--strict-mcp-config",
    "--permission-mode",
    "dontAsk",
    "--json-schema",
    JSON.stringify(CHEF_OUTPUT_SCHEMA),
    "--append-system-prompt",
    CHEF_CONTRACT,
  ];
  return {
    provider: "claude",
    cmd,
    args,
    cwd: chefCwd(input.chef.id),
    stdin: input.digest,
    env: chefEnv(makeChefHooksDir(input.chef.id)),
  };
}

/** Write the strict output schema for `--output-schema` (create-once). */
function writeSchemaFile(dir: string): string {
  const file = join(dir, SCHEMA_FILE);
  if (!createOnce(file, CHEF_OUTPUT_SCHEMA)) {
    const bytes = readRegularFile(file);
    if (bytes?.toString("utf-8") !== serialize(CHEF_OUTPUT_SCHEMA)) {
      throw new Error(`unexpected chef schema file: ${file}`);
    }
  }
  return file;
}

/**
 * Codex chef: `:read-only` permission profile (never `--sandbox`), user
 * config ignored, empty non-repo cwd (`--skip-git-repo-check`). Every
 * exec-level flag stays before `resume`, which rejects -C/--color. Codex has
 * no system-prompt flag: the contract precedes the digest on stdin each wake.
 */
export function buildCodexChefSpawn(input: ChefSpawnInput): ChefSpawnSpec {
  const cmd = chefBinary(input, "codex");
  const resume = resumeId(input);
  const cwd = chefCwd(input.chef.id);
  const wakeDir = makeChefPrivateDir(input.chef.id, input.wake);
  const schemaFile = writeSchemaFile(wakeDir);
  const outputFile = join(wakeDir, LAST_MESSAGE_FILE);
  // A failed run must never read an output left by an earlier attempt.
  try {
    unlinkSync(outputFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const args = [
    "exec",
    "--json",
    "--color",
    "never",
    "--ignore-user-config",
    "-c",
    `default_permissions="${PROFILE}"`,
    "-c",
    `permissions.${PROFILE}.extends=":read-only"`,
    "--skip-git-repo-check",
    "-C",
    cwd,
    "--output-schema",
    schemaFile,
    "-o",
    outputFile,
    ...(resume ? ["resume", resume] : []),
    "-",
  ];
  return {
    provider: "codex",
    cmd,
    args,
    cwd,
    stdin: `${CHEF_CONTRACT}\n\n---\n\n${input.digest}`,
    env: chefEnv(makeChefHooksDir(input.chef.id)),
    outputFile,
  };
}

export function buildChefSpawn(input: ChefSpawnInput): ChefSpawnSpec {
  return input.chef.provider === "claude"
    ? buildClaudeChefSpawn(input)
    : buildCodexChefSpawn(input);
}

// ─── output ─────────────────────────────────────────────────────────────

/**
 * One stream line. The C2a parsers keep session id, outcome, error and quota;
 * Claude's `result` event additionally carries `structured_output`.
 */
export function parseChefLine(
  provider: Provider,
  line: string,
  acc: ChefStreamAcc,
): void {
  if (provider === "codex") {
    codex.parseLine(line, acc);
    return;
  }
  claude.parseLine(line, acc);
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  if (!ev || typeof ev !== "object" || ev.type !== "result") return;
  // The last result event wins, as in claude.parseLine.
  acc.resultSubtype = typeof ev.subtype === "string" ? ev.subtype : undefined;
  acc.structuredOutput = ev.structured_output;
}

/**
 * The C2a `finish` only decides outcome/error/quota: its lastMessage is
 * capped at 4 KiB and its transcript path assumes cwd = checkout, so neither
 * is used here.
 */
function workerFinish(
  spec: ChefSpawnSpec,
  acc: ChefStreamAcc,
  exitCode: number | null,
) {
  // Only checkout/privateDir are read (transcript path, codex lastMessage),
  // and both results are dropped.
  const ctx: SpawnContext = {
    orchDir: "",
    taskDir: "",
    privateDir: spec.cwd,
    checkout: spec.cwd,
    cfInvocation: [],
    sessionUuid: "",
  };
  return (spec.provider === "claude" ? claude : codex).finish(
    acc,
    exitCode,
    ctx,
  );
}

function readCodexOutput(
  spec: ChefSpawnSpec,
): { output: unknown } | { error: string } {
  const bytes = spec.outputFile
    ? readRegularFile(spec.outputFile, MAX_CHEF_OUTPUT_BYTES)
    : undefined;
  if (!bytes) {
    return { error: "codex wrote no usable output file (-o)" };
  }
  try {
    return { output: JSON.parse(bytes.toString("utf-8")) };
  } catch {
    return { error: "codex output file is not valid JSON" };
  }
}

/**
 * Outcome of a finished chef run. A usage limit wins (the chef waits for the
 * reset, never switches provider); otherwise the raw structured output, which
 * the wake passes to `validateActions` (schema errors fail the wake there).
 */
export function finishChefRun(
  spec: ChefSpawnSpec,
  acc: ChefStreamAcc,
  exitCode: number | null,
): ChefRunResult {
  const fin = workerFinish(spec, acc, exitCode);
  const session =
    acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {};
  if (fin.quota) {
    return {
      outcome: "quota",
      resetsAt: fin.quota.resetsAt,
      ...session,
      ...(fin.error !== undefined && { error: fin.error }),
    };
  }
  // Before the generic failure: the worker parser marks this subtype failed.
  if (
    spec.provider === "claude" &&
    acc.resultSubtype === "error_max_structured_output_retries"
  ) {
    return {
      outcome: "failed",
      error: "claude could not produce output matching the chef schema",
      ...session,
    };
  }
  if (fin.outcome !== "succeeded") {
    return {
      outcome: "failed",
      error: fin.error ?? `${spec.provider} chef failed`,
      ...session,
    };
  }
  if (spec.provider === "codex") {
    const r = readCodexOutput(spec);
    if ("error" in r) return { outcome: "failed", error: r.error, ...session };
    return { outcome: "ok", output: r.output, ...session };
  }
  if (acc.structuredOutput === undefined || acc.structuredOutput === null) {
    return {
      outcome: "failed",
      error: "claude result has no structured_output",
      ...session,
    };
  }
  return { outcome: "ok", output: acc.structuredOutput, ...session };
}

// ─── version and flag checks ────────────────────────────────────────────

/** `<bin> --version` with a neutral cwd (`chefs/<id>/private`), never the checkout. */
function versionOf(bin: string, cwd: string): string | undefined {
  const out = run(bin, ["--version"], { cwd });
  return out ? extractVersion(out) : undefined;
}

/** Why this claude cannot run a chef (too old or unknown), else undefined. */
export function claudeVersionError(
  bin: string,
  cwd: string,
): string | undefined {
  const actual = versionOf(bin, cwd);
  if (!actual || compareVersions(actual, MIN_CLAUDE_VERSION) < 0) {
    return `claude ${MIN_CLAUDE_VERSION} or newer is required for a chef (found ${actual ?? "unknown"})`;
  }
  return undefined;
}

/** Why this codex cannot run a chef (too old or unknown), else undefined. */
export function codexChefVersionError(
  bin: string,
  cwd: string,
): string | undefined {
  const actual = versionOf(bin, cwd);
  if (!actual || compareVersions(actual, MIN_CODEX_VERSION) < 0) {
    return `codex ${MIN_CODEX_VERSION} or newer is required for a chef (found ${actual ?? "unknown"})`;
  }
  return undefined;
}

/** Why `claude --help` lacks a flag the chef needs (`--safe-mode`, `--add-dir`), else undefined. */
export function claudeFlagsError(bin: string, cwd: string): string | undefined {
  const help = run(bin, ["--help"], { cwd });
  if (help === null) return "could not run claude --help";
  const missing = REQUIRED_CLAUDE_FLAGS.filter(
    (f) => !new RegExp(`(^|[\\s,])${f}(?![\\w-])`).test(help),
  );
  return missing.length
    ? `claude does not support ${missing.join(", ")} (required for a chef)`
    : undefined;
}
