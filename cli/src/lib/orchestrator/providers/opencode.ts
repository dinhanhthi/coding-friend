import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
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

/**
 * OpenCode read-only worker (`opencode run --format json`). Preamble +
 * prompt go only through stdin (closed by the runner). `prepare()` writes the
 * CF config dir; `buildSpawn` has no side effect.
 */
export const opencode: ProviderAdapter = {
  bin: "opencode",
  caps: CAPS,

  preflight() {
    const found = binaryVersion("opencode", {
      env: { OPENCODE_DISABLE_AUTOUPDATE: "1" },
    });
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
    return undefined;
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
    // Only an id the stream reported (a failed lookup reports "").
    if (!acc.sessionId && typeof ev.sessionID === "string" && ev.sessionID) {
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
