import { execFileSync } from "child_process";
import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
  type Stats,
} from "fs";
import { tmpdir } from "os";
import { dirname, join, relative, resolve, sep } from "path";
import { compareVersions } from "../../host.js";
import { buildPreamble } from "../preamble.js";
import { isModelName, isSessionId } from "../store.js";
import type {
  ProviderAdapter,
  ProviderCaps,
  SpawnContext,
  StreamAcc,
} from "./index.js";
import { binaryVersion } from "./version.js";

const MAX_TEXT = 4096;
/** Oldest probed version; v3 may change the permission model again. */
export const MIN_OPENCODE_VERSION = "2.0.13";
const MAX_OPENCODE_MAJOR = 3;
/** The CF-defined agent every run is pinned to (`--agent` + `default_agent`). */
export const OPENCODE_AGENT = "cf-reader";

/**
 * Read-only only: OpenCode has no OS sandbox, so safety rests on these
 * permission rules. No shell rule at all (an allowed prefix plus a redirect
 * wrote outside the checkout), hence `cfShell: false`.
 */
const CAPS = {
  writer: false,
  readOnly: true,
  nonGitReadOnly: false,
  needsModel: true,
  chef: false,
  cfShell: false,
} as const satisfies ProviderCaps;

type Rule = {
  action: string;
  resource: string;
  effect: "allow" | "deny";
};

const rule = (
  action: string,
  resource: string,
  effect: Rule["effect"],
): Rule => ({ action, resource, effect });

/**
 * Last match wins. `* deny` first: a config-defined agent starts from
 * defaults that allow everything and "ask" for some actions, and a
 * non-interactive "ask" aborts the run. Every v2 action gets an explicit
 * effect, never "ask"; `* deny` also covers MCP tools and unknown actions.
 */
export const OPENCODE_RULES: readonly Rule[] = [
  rule("*", "*", "deny"),
  rule("edit", "*", "deny"), // write, edit and patch tools
  rule("shell", "*", "deny"),
  rule("webfetch", "*", "deny"),
  rule("websearch", "*", "deny"),
  rule("subagent", "*", "deny"),
  rule("skill", "*", "deny"),
  rule("question", "*", "deny"),
  rule("execute", "*", "deny"), // codemode
  rule("external_directory", "*", "deny"),
  rule("read", "*", "allow"),
  // Best-effort only: grep checks its permission against the search pattern,
  // not the file path (opencode 2.0.13 packages/core/src/tool/plugin/grep.ts:87-89),
  // and ripgrep searches a named file even when gitignored (ripgrep.ts:219-233),
  // so a grep on a dotenv path still shows it. Read-only Claude/Codex workers
  // can read dotenv files too: not a baseline guarantee.
  rule("read", "*.env", "deny"),
  rule("read", "*.env.*", "deny"),
  rule("read", "*.npmrc", "deny"),
  rule("read", "*.netrc", "deny"),
  rule("read", "*.envrc", "deny"),
  rule("read", "*.git/config", "deny"),
  rule("read", "*.git/*", "deny"), // packed history, config.worktree, hooks
  rule("read", "*.git-credentials", "deny"),
  rule("read", "*.pypirc", "deny"),
  rule("read", "*.docker/config.json", "deny"),
  rule("read", "*.env.example", "allow"),
  rule("glob", "*", "allow"),
  rule("grep", "*", "allow"),
];

/**
 * `opencode.json` of the CF-owned config dir. The rules sit at the top level
 * too: OpenCode pushes top-level permissions into every agent after the
 * built-in ones. Never add an AGENTS.md next to it (loaded as instructions).
 */
export const OPENCODE_CONFIG = {
  default_agent: OPENCODE_AGENT,
  update: "disable",
  share: "disabled",
  snapshots: false,
  permissions: OPENCODE_RULES,
  agents: {
    [OPENCODE_AGENT]: {
      description: "Coding Friend read-only worker",
      mode: "primary",
      permissions: OPENCODE_RULES,
    },
  },
};

/** CF-owned `OPENCODE_CONFIG_DIR`, in the runner-only dir of the attempt. */
function configDir(ctx: SpawnContext): string {
  return join(ctx.privateDir, "opencode-config");
}

function errorText(v: unknown): { type?: string; message?: string } {
  if (!v || typeof v !== "object") return {};
  const { type, message } = v as { type?: unknown; message?: unknown };
  return {
    ...(typeof type === "string" && { type }),
    ...(typeof message === "string" && { message: message.slice(0, MAX_TEXT) }),
  };
}

/** Quota error types of 2.0.13; the error line carries no reset time. */
const QUOTA_TYPES = new Set(["provider.rate-limit", "provider.quota"]);

/** `*` matches anything (also `/`), like opencode's wildcard. */
function wildcard(pattern: string, value: string): boolean {
  const re = pattern
    .split("*")
    .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}$`, "s").test(value);
}

/**
 * The default file systems of macOS and Windows ignore case: `.ENV` opens the
 * same file as its lowercase name, so the guard compares names folded there.
 */
const FOLD_CASE = process.platform === "darwin" || process.platform === "win32";
const fold = (s: string): string => (FOLD_CASE ? s.toLowerCase() : s);

/** Effect of OPENCODE_RULES for a read of `path` (last match wins). */
function readEffect(path: string): Rule["effect"] | undefined {
  return [...OPENCODE_RULES]
    .reverse()
    .find(
      (r) =>
        wildcard(r.action, "read") && wildcard(fold(r.resource), fold(path)),
    )?.effect;
}

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_OUTPUT = 64 * 1024 * 1024;

/**
 * Why the checkout must not run under opencode, else undefined. Opencode
 * follows symlinks and checks its read rules against the link name (probe
 * 2026-11-06, v2.0.13), so a link may lead outside the checkout or to a
 * denied file under a harmless name. Every tracked, untracked and ignored
 * path (also inside ignored dirs: a `.gitignore` or repo excludesFile can
 * hide a link) is lstat'ed: a link is refused when its target (realpath,
 * else lexical for a dead link) is outside the checkout, inside a `.git`
 * dir or a denied read (names compared case-folded on macOS and Windows,
 * realpaths in their on-disk spelling). For tracked and untracked paths, a
 * submodule, nested repo or other listed dir (git does not list its files)
 * and a hard link are refused too; ignored ones are checked for links only
 * (pnpm hard-links node_modules). A name git printed lossily (not UTF-8,
 * possible on Linux) is refused: it cannot be lstat'ed. Not checked:
 * symlinks inside an ignored nested repo and inside `.git/`. A missing
 * checkout is accepted; a git failure (or output over the cap) and an
 * lstat failure other than a deleted path are refused. git
 * runs with a replaced env, no system config, no fsmonitor, no discovery
 * above the checkout and an explicit work tree (a repo config could run a
 * command or move the listing); ls-files runs no hook.
 */
function symlinkRefusal(checkout: string): string | undefined {
  let root: string;
  try {
    root = realpathSync.native(checkout);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return `opencode: cannot resolve the checkout (${String(err)})`;
  }
  // No discovery above the checkout: a vanished `.git` must not let git
  // list an ancestor repo instead.
  const env: NodeJS.ProcessEnv = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: dirname(root),
    // Never fetch, prompt, take locks or follow replace refs.
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };
  for (const k of ["PATH", "HOME"]) {
    if (process.env[k] !== undefined) env[k] = process.env[k];
  }
  const lsFiles = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-c",
        "core.splitIndex=false",
        "-c",
        "core.sparseCheckout=false",
        "-c",
        "protocol.allow=never",
        "-C",
        root,
        // A planted core.worktree must not move the listing elsewhere.
        `--work-tree=${root}`,
        "ls-files",
        "-z",
        ...args,
      ],
      {
        encoding: "utf-8",
        cwd: tmpdir(),
        env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: GIT_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: GIT_MAX_OUTPUT,
      },
    );
  let listed: string;
  let ignored: string;
  try {
    listed = lsFiles("-c", "-o", "--exclude-standard");
    // Walks ignored dirs too (node_modules): the output cap still applies.
    ignored = lsFiles("-o", "-i", "--exclude-standard");
  } catch {
    return "opencode: cannot list the checkout's files with git, so its symlinks cannot be checked";
  }
  const check = (out: string, linksOnly: boolean): string | undefined => {
    for (const rel of new Set(out.split("\0"))) {
      if (!rel) continue;
      const why = pathRefusal(root, rel, linksOnly);
      if (why) return why;
    }
    return undefined;
  };
  return check(listed, false) ?? check(ignored, true);
}

/** Why `rel` (as listed by git) makes the checkout unsafe, else undefined. */
function pathRefusal(
  root: string,
  rel: string,
  linksOnly: boolean,
): string | undefined {
  // git printed a byte sequence that is not UTF-8: the decoded name is not
  // the one on disk, so lstat would check another path (or none).
  if (rel.includes("\uFFFD")) {
    return `opencode refuses the checkout: ${JSON.stringify(rel)} is not a UTF-8 name, which cannot be checked`;
  }
  const abs = join(root, rel);
  let target: string;
  let st: Stats;
  try {
    st = lstatSync(abs);
  } catch (err) {
    // Tracked but deleted, or removed since the listing.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return `opencode refuses the checkout: cannot check ${JSON.stringify(rel)} (${String(err)})`;
  }
  if (!linksOnly) {
    // ls-files lists a dir only for a submodule, a nested repo or a tracked
    // path replaced by a dir: git does not list what is inside, so its links
    // cannot be checked.
    if (st.isDirectory()) {
      return `opencode refuses the checkout: submodule, nested repository or directory ${JSON.stringify(rel)} cannot be checked`;
    }
    // A hard link shares the inode of a file that may be outside the
    // checkout or denied; a clone never makes one, so refuse it.
    if (st.isFile() && st.nlink > 1) {
      return `opencode refuses the checkout: ${JSON.stringify(rel)} is a hard link, which cannot be checked`;
    }
  }
  if (!st.isSymbolicLink()) return undefined;
  try {
    target = realpathSync.native(abs);
  } catch {
    try {
      target = resolve(dirname(abs), readlinkSync(abs));
    } catch {
      return `opencode refuses the checkout: cannot read symlink ${JSON.stringify(rel)}`;
    }
  }
  if (target !== root && !target.startsWith(root + sep)) {
    return `opencode refuses the checkout: symlink ${JSON.stringify(rel)} points outside it (opencode follows links past its read rules)`;
  }
  // A link into a `.git` dir: `g` → `.git`, then `g/config` escapes the
  // `*.git/config` rule. Other dir links stay allowed.
  if (fold(relative(root, target)).split(sep).includes(".git")) {
    return `opencode refuses the checkout: symlink ${JSON.stringify(rel)} points into a .git directory`;
  }
  if (readEffect(target) !== "allow") {
    return `opencode refuses the checkout: symlink ${JSON.stringify(rel)} points to a file its read rules deny`;
  }
  return undefined;
}

/**
 * OpenCode read-only worker (`opencode run --format json`). Preamble +
 * prompt go only through stdin (closed by the runner). `prepare()` writes the
 * CF config dir; `buildSpawn` has no side effect.
 */
export const opencode: ProviderAdapter = {
  bin: "opencode",
  caps: CAPS,

  preflight(req) {
    // Only PATH and HOME: an inherited OPENCODE_* (config dir, config
    // content) must not reach even the --version run.
    const env: NodeJS.ProcessEnv = { OPENCODE_DISABLE_AUTOUPDATE: "1" };
    for (const k of ["PATH", "HOME"]) {
      if (process.env[k] !== undefined) env[k] = process.env[k];
    }
    const found = binaryVersion("opencode", { env, replaceEnv: true });
    const major = found ? Number(found.split(".")[0]) : NaN;
    if (
      !found ||
      compareVersions(found, MIN_OPENCODE_VERSION) < 0 ||
      major >= MAX_OPENCODE_MAJOR
    ) {
      return {
        code: "PROVIDER_UNAVAILABLE",
        message: `opencode >=${MIN_OPENCODE_VERSION} <${MAX_OPENCODE_MAJOR} is required (found ${found ?? "unknown"})`,
      };
    }
    const symlink = symlinkRefusal(req.checkout);
    return symlink
      ? { code: "PROVIDER_UNAVAILABLE", message: symlink }
      : undefined;
  },

  async prepare(_task, ctx) {
    // Rebuilt from the constant before every spawn: nothing else survives.
    const dir = configDir(ctx);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { mode: 0o700 });
    writeFileSync(
      join(dir, "opencode.json"),
      `${JSON.stringify(OPENCODE_CONFIG, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    return {};
  },

  buildSpawn(task, ctx) {
    if (!task.readOnly) {
      throw new Error("opencode runs read-only tasks only");
    }
    if (ctx.resume && !isSessionId(ctx.resume.sessionId)) {
      throw new Error("refusing to resume an invalid session id");
    }
    if (ctx.model === undefined) {
      throw new Error("opencode needs a model");
    }
    if (!isModelName(ctx.model)) {
      throw new Error("refusing an invalid model name");
    }
    // Never --auto / --yolo / --dangerously-skip-permissions. --standalone:
    // a private server, not the shared background service. No message
    // argument: the prompt comes only through stdin.
    const args = [
      "run",
      "--standalone",
      "--format",
      "json",
      "-m",
      ctx.model,
      "--agent",
      OPENCODE_AGENT,
      ...(ctx.resume ? ["--session", ctx.resume.sessionId] : []),
    ];
    const preamble = buildPreamble({
      taskId: task.id,
      readOnly: task.readOnly,
      cfInvocation: ctx.cfInvocation,
      orchDir: ctx.orchDir,
      cfShell: CAPS.cfShell,
    });
    // An inherited OPENCODE_* could re-enable project config
    // (OPENCODE_CONFIG_PROJECT_DISABLE wins), add a config layer or move home.
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (!k.toUpperCase().startsWith("OPENCODE_")) env[k] = v;
    }
    env.OPENCODE_CONFIG_DIR = configDir(ctx);
    env.OPENCODE_DISABLE_PROJECT_CONFIG = "1";
    env.OPENCODE_DISABLE_AUTOUPDATE = "1";
    env.CF_TASK_ID = task.id;
    env.CF_ORCHESTRATOR_DIR = ctx.orchDir;
    return {
      cmd: "opencode",
      args,
      stdin: `${preamble}\n\n---\n\n${task.prompt}`,
      env,
      cwd: ctx.checkout,
    };
  },

  parseLine(line, acc: StreamAcc) {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (!ev || typeof ev !== "object") return;
    // Any event means the run read the prompt (no preset session id: inert
    // for the runner); finish() uses it to tell "no event" from "no id".
    if (typeof ev.type === "string") acc.accepted = true;
    // Only an id an event reported (a failed lookup reports ""): an object
    // line without a string type is not an event.
    if (
      !acc.sessionId &&
      typeof ev.type === "string" &&
      typeof ev.sessionID === "string" &&
      ev.sessionID
    ) {
      acc.sessionId = ev.sessionID;
    }
    switch (ev.type) {
      case "text": {
        const part = ev.part as { text?: unknown } | undefined;
        if (typeof part?.text === "string") {
          acc.lastMessage = part.text.slice(0, MAX_TEXT);
        }
        break;
      }
      // No terminal success event: success = exit 0 without an error line.
      case "error": {
        const { type, message } = errorText(ev.error);
        acc.error = message ?? type ?? acc.error ?? "opencode error";
        if (type !== undefined && QUOTA_TYPES.has(type)) {
          acc.quota = { resetsAt: null, source: `opencode.${type}` };
        }
        break;
      }
      // step_start, step_finish, tool_use (2.0.13) / tool (later): nothing to keep.
    }
  },

  session(acc) {
    return acc.sessionId ? { sessionId: acc.sessionId } : undefined;
  },

  finish(acc, exitCode) {
    const ok =
      exitCode === 0 && acc.error === undefined && acc.sessionId !== undefined;
    const error = ok
      ? undefined
      : (acc.error ??
        (exitCode === 0
          ? acc.accepted
            ? "opencode exited without a session id"
            : "opencode exited without any event"
          : `opencode exited (${exitCode === null ? "signal" : `code ${exitCode}`}) without an error event`));
    return {
      outcome: ok ? "succeeded" : "failed",
      ...(acc.sessionId !== undefined && { sessionId: acc.sessionId }),
      ...(acc.lastMessage !== undefined && { lastMessage: acc.lastMessage }),
      ...(error !== undefined && { error }),
      ...(!ok && acc.quota !== undefined && { quota: acc.quota }),
    };
  },
};
