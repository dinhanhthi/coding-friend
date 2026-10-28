import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Typed wrappers for the Tauri commands in src-tauri/src/commands.rs.
// Rust `Option<T>` arrives as `null`; CLI data omits unset fields, so those are `?:`.
// Strings from the CLI (prompts, details, hints) are untrusted: render as plain text only.

// ─── Bridge (src-tauri/src/cf.rs) ───────────────────────────────────────

export type LoginPathSource = "login-shell" | "fallback";

export type CfError =
  | { kind: "cliNotFound"; path: string }
  | { kind: "timeout"; secs: number; stderrTail: string | null }
  | { kind: "cliTooOld"; stderrTail: string | null }
  | { kind: "incompatible"; contractVersion: number; stderrTail: string | null }
  | {
      kind: "cliError";
      code: string;
      message: string;
      stderrTail: string | null;
    }
  | { kind: "io"; message: string; stderrTail: string | null }
  | {
      kind: "nodeNotFound";
      stderrTail: string | null;
      loginPathSource: LoginPathSource;
    }
  | { kind: "refused"; message: string }
  | { kind: "cancelled" };

const CF_ERROR_KINDS: ReadonlySet<string> = new Set<CfError["kind"]>([
  "cliNotFound",
  "timeout",
  "cliTooOld",
  "incompatible",
  "cliError",
  "io",
  "nodeNotFound",
  "refused",
  "cancelled",
]);

export function isCfError(e: unknown): e is CfError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { kind?: unknown }).kind === "string" &&
    CF_ERROR_KINDS.has((e as { kind: string }).kind)
  );
}

/** The user pressed Cancel in a native dialog or picker: show nothing. */
export function isCancelled(e: unknown): boolean {
  return isCfError(e) && e.kind === "cancelled";
}

/** Any rejection as a CfError; a non-CfError one (e.g. a plain string) becomes `io`. */
export function toCfError(e: unknown): CfError {
  if (isCfError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return { kind: "io", message, stderrTail: null };
}

/** One line for the user; CLI-provided parts stay plain text. */
export function describeCfError(e: CfError): string {
  switch (e.kind) {
    case "cliNotFound":
      return e.path === "cf"
        ? "No cf command on your login shell's PATH."
        : `No cf command at ${e.path}.`;
    case "timeout":
      return `cf did not answer within ${e.secs} s.`;
    case "cliTooOld":
      return "This cf does not have the commands the app needs.";
    case "incompatible":
      return `This cf speaks JSON contract ${e.contractVersion}; the app speaks 1.`;
    case "cliError":
      return `${e.message} (${e.code})`;
    case "io":
    case "refused":
      return e.message;
    case "nodeNotFound":
      return "node was not found on the login PATH.";
    case "cancelled":
      return "Cancelled.";
  }
}

export function stderrTailOf(e: CfError): string | null {
  return "stderrTail" in e ? e.stderrTail : null;
}

export type CfSource = "env" | "settings" | "path";

export interface ResolvedCf {
  path: string;
  source: CfSource;
}

export type GateState =
  "ok" | "notFound" | "tooOld" | "nodeNotFound" | "incompatible" | "error";

export interface CliStatus {
  state: GateState;
  cf: ResolvedCf | null;
  /** Semver from `version --json`; informational only. */
  version: string | null;
  error: CfError | null;
  /** `doctor --json` data from the probe, so doctor need not run again. */
  doctor: DoctorData | null;
}

export interface CfInfo {
  /** `null` when no cf was found; `error` then says why. */
  cf: ResolvedCf | null;
  error: CfError | null;
  loginPath: string;
  loginPathSource: LoginPathSource;
}

// ─── CLI data (cli/src) ─────────────────────────────────────────────────

export type Host = "claude" | "codex" | "omp" | "agy" | "devin";

export interface HostVersion {
  installed: boolean;
  version: string | null;
}

/** cli/src/lib/version-info.ts */
export interface VersionInfo {
  cli: string;
  contractVersion: 1;
  hosts: Record<Host, HostVersion>;
}

export type DoctorStatus = "ok" | "warn" | "fail";

export interface DoctorFix {
  /** Arguments after `cf`, always ending with `--json`. */
  argv: string[];
  label: string;
}

/** cli/src/lib/doctor.ts */
export interface DoctorCheck {
  id: string;
  group: string;
  label: string;
  status: DoctorStatus;
  detail?: string;
  fix?: DoctorFix;
  /** A manual command, never run for the user. */
  hint?: string;
}

export interface DoctorData {
  cli: { version: string; node: string; path: string };
  checks: DoctorCheck[];
}

/** cli/src/lib/project-registry.ts `ProjectEntry`. */
export interface RegisteredProject {
  path: string;
  hosts: string[];
  firstSeen: string;
  lastSeen: string;
}

/** An entry of `project list` (`ListedProject`). */
export interface ProjectEntry extends RegisteredProject {
  exists: boolean;
}

export interface ProjectList {
  projects: ProjectEntry[];
  warning?: string;
}

export type Provider = "claude" | "codex" | "opencode";

export type TaskState =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "paused";

export interface AskRecord {
  schemaVersion: 1;
  qid: string;
  taskId: string;
  question: string;
  createdAt: string;
}

export interface RunnerRecord {
  schemaVersion: 1;
  pid: number;
  startedAt: string;
}

export interface SessionRecord {
  schemaVersion: 1;
  sessionId: string;
  transcriptPath?: string;
}

export interface ResultRecord {
  schemaVersion: 1;
  exitCode: number | null;
  outcome: "succeeded" | "failed" | "cancelled";
  lastMessage?: string;
  error?: string;
  finishedAt: string;
}

export interface DoneRecord {
  schemaVersion: 1;
  outcome: "succeeded" | "failed";
  summary: string;
  handoff?: string;
  finishedAt: string;
}

export interface CancelRecord {
  schemaVersion: 1;
  cancelledAt: string;
}

export interface AttemptSummary {
  n: number;
  provider: Provider;
  kind: "fresh" | "resume" | "switch";
  pid?: number;
  sessionId?: string;
  transcriptPath?: string;
  pause?: { resetsAt: number | null; source: string };
}

export interface PauseRecord {
  schemaVersion: 1;
  provider: Provider;
  /** Epoch seconds of the announced reset, null when unknown. */
  resetsAt: number | null;
  source: string;
  lastMessage?: string;
  error?: string;
  createdAt: string;
}

/** cli/src/lib/orchestrator/store.ts `TaskView`, plus `task list`'s `hint`. */
export interface TaskView {
  schemaVersion: 1;
  id: string;
  provider: Provider;
  prompt: string;
  readOnly: boolean;
  checkout: string;
  createdAt: string;
  state: TaskState;
  pendingAsks: AskRecord[];
  runner?: RunnerRecord;
  session?: SessionRecord;
  result?: ResultRecord;
  done?: DoneRecord;
  cancel?: CancelRecord;
  attempts?: AttemptSummary[];
  pause?: PauseRecord & { n: number };
  /** A paused task nobody will resume: what to do about it. */
  hint?: string;
}

export type ChefState = "active" | "paused" | "stopped" | "quota-wait";

/** cli/src/commands/chef.ts */
export interface ChefStatusView {
  id: string;
  provider: Provider;
  state: ChefState;
  /** paused: the pause reason; stopped: the stop reason. */
  reason?: string;
  /** quota-wait: reset in epoch seconds (null when unknown). */
  resetsAt?: number | null;
  planDir: string;
  checkout: string;
  branch: string;
  commit: boolean;
  createdAt: string;
  wakes: number;
  lastWake?: {
    n: number;
    outcome?: string;
    error?: string;
    finishedAt?: string;
  };
  runningTasks: string[];
  inbox: number;
}

/** cli/src/lib/launchd.ts */
export interface LaunchdStatus {
  label: string;
  plistPath: string;
  plistExists: boolean;
  loaded: boolean;
  programArgs: string[] | null;
  missingPaths: string[];
  needsReinstall: boolean;
}

/** cli/src/commands/supervisor.ts */
export interface SupervisorStatus {
  supported: boolean;
  /** null off darwin. */
  launchd: LaunchdStatus | null;
  /** null when no tick ever ran. */
  heartbeat: { at: string; ageSeconds: number | null } | null;
  paused: number;
  orphaned: number;
}

export interface HostUpdateCheck {
  host: Host;
  installed: boolean;
  current: string | null;
  updateAvailable: boolean | null;
}

/** cli/src/lib/update-info.ts */
export interface UpdateCheck {
  cli: {
    current: string;
    latest: string | null;
    updateAvailable: boolean | null;
    linked: boolean;
  };
  plugin: { latest: string | null };
  hosts: HostUpdateCheck[];
  statusline: { current: string | null };
}

export interface UpdateResult {
  performed: Host[];
  /** What actually changed: step failures only log, the envelope stays ok. */
  after: UpdateCheck;
}

// ─── Manual commands ────────────────────────────────────────────────────

export const INSTALL_COMMAND = "npm i -g coding-friend-cli";
export const UPDATE_COMMAND = "npm install -g coding-friend-cli@latest";

/**
 * The doctor fixes Rust's `run_fix` accepts. Keep identical to app/src-tauri/src/commands.rs
 * RUNNABLE_FIXES and cli/src/lib/doctor.ts.
 */
export const RUNNABLE_FIXES: readonly (readonly string[])[] = [
  ["supervisor", "install", "--json"],
  ["supervisor", "tick", "--json"],
  ["install", "--user", "--yes", "--json"],
];

/** `argv` equals one of RUNNABLE_FIXES word for word, so `run_fix` will accept it. */
export function isRunnableFix(argv: readonly string[]): boolean {
  return RUNNABLE_FIXES.some(
    (fix) =>
      fix.length === argv.length && fix.every((word, i) => word === argv[i]),
  );
}

/** `cf` and plain words or flags: no shell metacharacters, quotes or line breaks. */
const PLAIN_CF_COMMAND = /^cf(?: (?:--?)?[a-z0-9][a-z0-9:-]*)+$/;

/**
 * A CLI-provided hint the app may show as a copyable command (`$` prompt + copy). Anything
 * else (a slash command, prose) is plain text.
 */
export function isCopyableCommand(hint: string): boolean {
  if (/[\r\n]/.test(hint)) return false;
  return (
    hint === INSTALL_COMMAND ||
    hint === UPDATE_COMMAND ||
    PLAIN_CF_COMMAND.test(hint)
  );
}

// ─── Commands ───────────────────────────────────────────────────────────

export const cfVersion = () => invoke<VersionInfo>("cf_version");
export const cfDoctor = () => invoke<DoctorData>("cf_doctor");
export const lastDoctor = () => invoke<DoctorData | null>("last_doctor");
export const projectList = () => invoke<ProjectList>("project_list");
/** Rust shows the folder picker. */
export const addProject = () =>
  invoke<{ project: RegisteredProject }>("add_project");
/** Rust shows the native confirm. */
export const projectRemove = (path: string) =>
  invoke<{ path: string; removed: true }>("project_remove", { path });
export const taskList = () => invoke<TaskView[]>("task_list");
export const chefStatus = () => invoke<ChefStatusView[]>("chef_status");
export const supervisorStatus = () =>
  invoke<SupervisorStatus>("supervisor_status");
export const updateCheck = () => invoke<UpdateCheck>("update_check");
/** Rust shows the native confirm. */
export const updateYes = () => invoke<UpdateResult>("update_yes");
/** `argv` must be an allow-listed doctor fix; the result differs per fix. */
export const runFix = (argv: string[]) => invoke<unknown>("run_fix", { argv });
export const checkCli = () => invoke<CliStatus>("check_cli");
export const getCfInfo = () => invoke<CfInfo>("get_cf_info");
/** Rust shows the folder picker. */
export const chooseCfPath = () => invoke<ResolvedCf>("choose_cf_path");
export const clearCfPath = () => invoke<void>("clear_cf_path");

// ─── Events ─────────────────────────────────────────────────────────────

/** Rust `confirm`: the user pressed OK and `cf` is starting. */
export interface RunStarted {
  /** The command line the confirm showed. */
  command: string;
  op: "update" | "fix" | "projectRemove";
}

const RUN_OPS: ReadonlySet<string> = new Set<RunStarted["op"]>([
  "update",
  "fix",
  "projectRemove",
]);

export function isRunStarted(x: unknown): x is RunStarted {
  if (typeof x !== "object" || x === null) return false;
  const { op, command } = x as { op?: unknown; command?: unknown };
  return (
    typeof op === "string" && RUN_OPS.has(op) && typeof command === "string"
  );
}

/**
 * Calls `cb` each time a confirmed command starts (a malformed payload is ignored).
 * Returns an unsubscribe that is safe to call before `listen` has resolved (an effect
 * cleanup).
 */
export function onRunStarted(cb: (run: RunStarted) => void): () => void {
  let active = true;
  let unlisten: UnlistenFn | undefined;
  listen<unknown>("cf-run-started", (event) => {
    if (isRunStarted(event.payload)) cb(event.payload);
  }).then(
    (fn) => {
      if (active) unlisten = fn;
      else fn();
    },
    (e: unknown) => {
      console.warn("Could not listen for cf-run-started:", e);
    },
  );
  return () => {
    active = false;
    unlisten?.();
  };
}
