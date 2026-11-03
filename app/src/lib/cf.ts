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

// ─── Config (cf config get|schema|set --json) ───────────────────────────

export type ConfigScope = "global" | "local";

/**
 * `config get --json`. Settings global calls it bare (cwd = $HOME, so `local` is the global
 * file again): use only `effective` and `global` there.
 */
export interface ConfigFullView {
  global: Record<string, unknown>;
  local: Record<string, unknown>;
  /** Defaults, then global, then local. */
  effective: Record<string, unknown>;
  paths: { global: string; local: string };
  /** The main repo root, set when called with a project. */
  project?: string;
}

export interface ConfigSetResult {
  scope: ConfigScope;
  path: string;
  key: string;
  /** `null` when the key was deleted. */
  value: unknown;
  warnings: string[];
  project?: string;
}

function hasPath(obj: Record<string, unknown>, key: string): boolean {
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur))
      return false;
    if (!Object.hasOwn(cur, part)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return true;
}

/**
 * Where a dotted key's effective value comes from. The global scope (Settings) never
 * answers "local".
 */
export function valueSource(
  key: string,
  view: ConfigFullView,
  scope: ConfigScope,
): ConfigScope | "default" {
  if (scope === "local" && hasPath(view.local, key)) return "local";
  if (hasPath(view.global, key)) return "global";
  return "default";
}

/** One editable config leaf. `select` options and the drafts of boolean/select are JSON. */
export type ConfigField = { key: string } & (
  | { kind: "boolean" | "string" | "json" }
  | { kind: "select"; options: unknown[] }
  | { kind: "number"; integer: boolean; min?: number }
);

type SchemaNode = Record<string, unknown>;

const isNode = (x: unknown): x is SchemaNode =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** An object with its own properties: walked into, never edited as a whole. */
const isBranch = (node: SchemaNode) =>
  node.type === "object" && isNode(node.properties);

/** Every value the node allows when it is a finite set of literals, else `null`. */
function literals(node: SchemaNode): unknown[] | null {
  if (Array.isArray(node.enum)) return node.enum;
  if ("const" in node) return [node.const];
  if (node.type === "boolean") return [true, false];
  const union = node.anyOf ?? node.oneOf;
  if (!Array.isArray(union)) return null;
  const all: unknown[] = [];
  for (const member of union) {
    const values = isNode(member) ? literals(member) : null;
    if (!values) return null;
    all.push(...values);
  }
  return all;
}

function leaf(key: string, node: SchemaNode): ConfigField {
  if (node.type === "boolean") return { key, kind: "boolean" };
  const options = literals(node);
  if (options) return { key, kind: "select", options };
  if (node.type === "integer" || node.type === "number") {
    const min = typeof node.minimum === "number" ? node.minimum : undefined;
    return {
      key,
      kind: "number",
      integer: node.type === "integer",
      ...(min !== undefined && { min }),
    };
  }
  if (node.type === "string") return { key, kind: "string" };
  // Arrays, records (`additionalProperties`) and mixed unions.
  return { key, kind: "json" };
}

/**
 * The config JSON Schema's leaves as dotted keys (`learn.autoCommit`), in schema order. A
 * parent object is never a field: `config set learn {...}` would overwrite its siblings.
 */
export function configFields(schema: unknown, prefix = ""): ConfigField[] {
  if (!isNode(schema) || !isNode(schema.properties)) return [];
  return Object.entries(schema.properties).flatMap(([name, node]) => {
    const key = prefix + name;
    if (!isNode(node)) return [];
    return isBranch(node) ? configFields(node, `${key}.`) : [leaf(key, node)];
  });
}

/** Dotted keys of `values` the schema does not know; shown read-only. */
export function unknownConfigKeys(
  schema: unknown,
  values: Record<string, unknown>,
  prefix = "",
): string[] {
  const props =
    isNode(schema) && isNode(schema.properties) ? schema.properties : {};
  return Object.entries(values).flatMap(([name, value]) => {
    const key = prefix + name;
    const node = props[name];
    if (!isNode(node)) return [key];
    return isBranch(node) && isNode(value)
      ? unknownConfigKeys(node, value, `${key}.`)
      : [];
  });
}

/** Same limit as Rust `MAX_CONFIG_VALUE` (bytes). */
const MAX_CONFIG_VALUE = 4096;

/**
 * The `<value>` word for `config set` (the CLI JSON-parses it first, so a string is always
 * JSON-quoted and JSON is minified: Rust refuses line breaks). Throws a message for the user.
 */
export function encodeConfigValue(field: ConfigField, draft: string): string {
  let value: string;
  if (field.kind === "string") {
    value = JSON.stringify(draft);
  } else if (field.kind === "number") {
    const text = draft.trim();
    const n = Number(text);
    if (text === "" || !Number.isFinite(n)) throw new Error("Enter a number.");
    if (field.integer && !Number.isInteger(n))
      throw new Error("Enter a whole number.");
    if (field.min !== undefined && n < field.min)
      throw new Error(`Enter ${field.min} or more.`);
    value = String(n);
  } else {
    try {
      value = JSON.stringify(JSON.parse(draft));
    } catch {
      throw new Error("Not valid JSON.");
    }
  }
  if (new TextEncoder().encode(value).length > MAX_CONFIG_VALUE)
    throw new Error(`Longer than ${MAX_CONFIG_VALUE} bytes.`);
  return value;
}

// ─── Docs (cf docs list|show --json) ────────────────────────────────────

/** cli/src/lib/docs-tree.ts `DocEntry`: `path` is posix, relative to `docsDir`. */
export interface DocEntry {
  path: string;
  size: number;
  mtime: string;
}

export interface DocsList {
  /** The main repo root. */
  project: string;
  docsDir: string;
  exists: boolean;
  /** Sorted by path. */
  files: DocEntry[];
  /** The CLI stopped at its file cap. */
  truncated: boolean;
}

export interface DocContent {
  project: string;
  path: string;
  content: string;
  size: number;
  mtime: string;
  sha256: string;
}

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * A leading YAML frontmatter block (`---` fences on their own lines, at the very start)
 * split off the markdown body; `frontmatter` is the text between the fences.
 */
export function splitFrontmatter(text: string): {
  frontmatter: string | null;
  body: string;
} {
  const match = FRONTMATTER.exec(text);
  if (!match) return { frontmatter: null, body: text };
  return { frontmatter: match[1] ?? "", body: text.slice(match[0].length) };
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

/** One POSIX shell word that pastes as literal text: `$(...)`, backticks and `'` stay inert. */
export function shellQuote(arg: string): string {
  return `'${arg.replaceAll("'", "'\\''")}'`;
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
/** No project: the global view for Settings. */
export const configView = (project?: string) =>
  invoke<ConfigFullView>("config_view", { project });
/** The JSON Schema of the config (`z.toJSONSchema`). */
export const configSchema = () =>
  invoke<Record<string, unknown>>("config_schema");
/** Rust shows the native confirm. `value` is parsed as JSON by the CLI; `"null"` deletes. */
export const configSet = (args: {
  scope: ConfigScope;
  project?: string;
  key: string;
  value: string;
}) => invoke<ConfigSetResult>("config_set", args);
export const docsList = (project: string) =>
  invoke<DocsList>("docs_list", { project });
/** `path` is relative to the docs folder. */
export const docsShow = (project: string, path: string) =>
  invoke<DocContent>("docs_show", { project, relpath: path });
/** Rust checks the `https:` URL and shows the native confirm; Cancel rejects `cancelled`. */
export const openUrl = (url: string) => invoke<void>("open_url", { url });
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
  op: "update" | "fix" | "projectRemove" | "configSet";
}

const RUN_OPS: ReadonlySet<string> = new Set<RunStarted["op"]>([
  "update",
  "fix",
  "projectRemove",
  "configSet",
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
