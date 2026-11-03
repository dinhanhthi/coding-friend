import { execFileSync } from "child_process";
import { existsSync, readFileSync, realpathSync } from "fs";
import { createConnection } from "net";
import { homedir } from "os";
import { join } from "path";
import { isMemoryInitialized } from "../commands/memory.js";
import { ConfigSchema, findUnknownKeys, resolveLearnDir } from "./config.js";
import { listMdFilesRecursive } from "./fs-utils.js";
import {
  detectHostsAvailable,
  compareVersions,
  getAgyMinVersion,
  getCodexMinVersion,
  getDevinMinVersion,
  getOmpMinVersion,
  type Host,
} from "./host.js";
import { readJson } from "./json.js";
import { learnStatus } from "./learn-storage.js";
import {
  DEFAULT_LABEL,
  START_INTERVAL_SECONDS,
  isSupported as launchdSupported,
  status as launchdStatus,
} from "./launchd.js";
import { getLibPath } from "./lib-path.js";
import {
  checkLearnMcpHealth,
  checkMemoryMcpHealth,
  type McpHealthResult,
} from "./mcp-health.js";
import { detectMemoryMcpState } from "./mcp-state.js";
import { binaryVersion } from "./orchestrator/providers/version.js";
import { readHeartbeat } from "./orchestrator/supervisor.js";
import { globalConfigPath, memoryDepsDir, resolvePath } from "./paths.js";
import {
  detectPluginScope,
  isMarketplaceRegistered,
  isPluginDisabled,
  isPluginInstalled,
} from "./plugin-state.js";
import { canonicalProjectPath, listProjects } from "./project-registry.js";
import type { CodingFriendConfig } from "../types.js";

/**
 * `cf doctor`: a read-only health report. No network, no file writes, no
 * mkdir; every host binary call is bounded by a timeout with stdin ignored.
 */

export type DoctorStatus = "ok" | "warn" | "fail";

export interface DoctorFix {
  /** Arguments after `cf`, always ending with `--json`. */
  argv: string[];
  label: string;
}

export interface DoctorCheck {
  /** Stable dotted id, e.g. `memory.mcp.registered`. */
  id: string;
  group: string;
  label: string;
  status: DoctorStatus;
  detail?: string;
  /** Safe to run without a prompt; always one of RUNNABLE_FIXES. */
  fix?: DoctorFix;
  /** A manual command, never run for the user. */
  hint?: string;
}

export interface DoctorData {
  cli: { version: string; node: string; path: string };
  checks: DoctorCheck[];
}

/** `cf doctor --project-dir`: only checks in group `project`. */
export interface ProjectDoctorData extends DoctorData {
  project: string;
}

/** The only fixes a caller may run (no prompt, JSON envelope out). */
export const RUNNABLE_FIXES = {
  supervisorInstall: {
    argv: ["supervisor", "install", "--json"],
    label: "Install the supervisor launchd agent",
  },
  supervisorTick: {
    argv: ["supervisor", "tick", "--json"],
    label: "Run one supervisor tick",
  },
  pluginInstall: {
    argv: ["install", "--user", "--yes", "--json"],
    label: "Install the Coding Friend plugin at user scope",
  },
} as const satisfies Record<string, DoctorFix>;

const PROBE_TIMEOUT_MS = 10_000;
const MIN_NODE_MAJOR = 20;
/** Three missed launchd intervals. */
const HEARTBEAT_STALE_S = 3 * START_INTERVAL_SECONDS;

const MEMORY_MCP_NAME = "coding-friend-memory";
const LEARN_MCP_NAME = "coding-friend-learn";

/**
 * When a failed check is only a warning: "always", or "notSetUp" while the
 * feature has not been set up yet (optional, so missing is not broken).
 */
type SoftFail = "always" | "notSetUp";

/** McpHealthResult label → doctor id and manual hint (one table per server). */
type HealthMap = Record<
  string,
  { id: string; hint?: string; softFail?: SoftFail }
>;

const MEMORY_IDS: HealthMap = {
  "Registered (user scope)": {
    id: "memory.mcp.registered",
    hint: "cf mcp",
    softFail: "notSetUp",
  },
  "Project .mcp.json": { id: "memory.mcp.projectShadow", hint: "cf update" },
  "Package built": {
    id: "memory.built",
    hint: "cf memory init",
    softFail: "notSetUp",
  },
  Daemon: { id: "memory.daemon", hint: "cf memory start-daemon" },
};

// Learn MCP is registered by `cf mcp` or `cf init`, not by `cf install`.
const LEARN_IDS: HealthMap = {
  "Registered (claude mcp)": {
    id: "learn.mcp.registered",
    hint: "cf mcp",
    softFail: "notSetUp",
  },
  "Package built": {
    id: "learn.mcp.built",
    hint: "cf mcp",
    softFail: "notSetUp",
  },
  "Docs directory": { id: "learn.docs", hint: "/cf-learn", softFail: "always" },
};

const HOST_MIN_VERSION: Record<Exclude<Host, "claude">, () => string> = {
  codex: getCodexMinVersion,
  omp: getOmpMinVersion,
  agy: getAgyMinVersion,
  devin: getDevinMinVersion,
};

function fix(f: { argv: readonly string[]; label: string }): DoctorFix {
  return { argv: [...f.argv], label: f.label };
}

function libPathOrNull(name: "cf-memory" | "learn-mcp"): string | null {
  try {
    return getLibPath(name);
  } catch {
    return null;
  }
}

type McpProbe = "registered" | "missing" | "timeout" | "noClaude";

/**
 * `claude mcp get <name>` exits 0 when the server is registered. Runs from
 * the home dir so a project .mcp.json in cwd is never health-checked (spawned).
 */
function claudeMcpProbe(name: string, claudePresent: boolean): McpProbe {
  if (!claudePresent) return "noClaude";
  try {
    execFileSync("claude", ["mcp", "get", name], {
      cwd: homedir(),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: PROBE_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    return "registered";
  } catch (err) {
    const e = err as { code?: string; signal?: string | null };
    return e.code === "ETIMEDOUT" || e.signal ? "timeout" : "missing";
  }
}

/**
 * Like cf-memory's isDaemonRunning, but never removes stale pid/socket files
 * and never creates ~/.coding-friend/memory (getDaemonPaths would mkdir it).
 */
function memoryDaemonRunning(): Promise<boolean> {
  const dir = memoryDepsDir();
  const pidFile = join(dir, "daemon.pid");
  if (!existsSync(pidFile)) return Promise.resolve(false);
  const pid = parseInt(
    readFileSync(pidFile, "utf-8").trim().split("\n")[0],
    10,
  );
  if (isNaN(pid)) return Promise.resolve(false);
  try {
    process.kill(pid, 0);
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const client = createConnection({ path: join(dir, "daemon.sock") }, () => {
      client.end();
      resolve(true);
    });
    client.on("error", () => resolve(false));
    client.setTimeout(1000, () => {
      client.destroy();
      resolve(false);
    });
  });
}

function fromHealth(
  result: McpHealthResult,
  group: string,
  ids: HealthMap,
  probe: McpProbe,
  setUp: boolean,
): DoctorCheck[] {
  return result.checks.map((c) => {
    const entry: HealthMap[string] = ids[c.label] ?? {
      id: `${group}.${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
    };
    const soft =
      entry.softFail === "always" || (entry.softFail === "notSetUp" && !setUp);
    const status: DoctorStatus = c.ok ? "ok" : c.warn || soft ? "warn" : "fail";
    const check: DoctorCheck = { id: entry.id, group, label: c.label, status };
    if (c.detail) check.detail = c.detail;
    if (status !== "ok" && entry.hint) check.hint = entry.hint;
    const registration = entry.id.endsWith(".mcp.registered");
    if (probe === "timeout" && registration) {
      check.status = "warn";
      check.detail = "claude mcp get timed out";
      delete check.hint;
    }
    // Without the claude CLI a registration cannot be checked, only flagged.
    if (probe === "noClaude" && registration) {
      check.status = "warn";
      check.detail = "claude CLI not found";
      delete check.hint;
    }
    return check;
  });
}

function cliChecks(): DoctorCheck[] {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  const ok = major >= MIN_NODE_MAJOR;
  return [
    {
      id: "cli.node",
      group: "cli",
      label: "Node.js",
      status: ok ? "ok" : "fail",
      detail: ok
        ? process.version
        : `${process.version} (requires >= ${MIN_NODE_MAJOR})`,
    },
  ];
}

function pluginChecks(claudePresent: boolean): DoctorCheck[] {
  const group = "plugin";
  if (!claudePresent) {
    return [
      {
        id: "plugin.installed",
        group,
        label: "Plugin installed (Claude Code)",
        status: "warn",
        detail: "claude CLI not found",
        hint: "cf install",
      },
    ];
  }
  const checks: DoctorCheck[] = [];
  const installed = isPluginInstalled();
  checks.push(
    installed
      ? {
          id: "plugin.installed",
          group,
          label: "Plugin installed (Claude Code)",
          status: "ok",
        }
      : {
          id: "plugin.installed",
          group,
          label: "Plugin installed (Claude Code)",
          status: "fail",
          detail: "coding-friend plugin not installed",
          fix: fix(RUNNABLE_FIXES.pluginInstall),
        },
  );
  const registered = isMarketplaceRegistered();
  checks.push({
    id: "plugin.marketplace",
    group,
    label: "Marketplace registered",
    status: registered ? "ok" : "warn",
    ...(registered
      ? {}
      : {
          detail: "coding-friend-marketplace not registered",
          hint: "cf install --user",
        }),
  });
  if (installed) {
    const scope = detectPluginScope();
    const disabled = isPluginDisabled(scope);
    checks.push({
      id: "plugin.enabled",
      group,
      label: "Plugin enabled",
      status: disabled ? "warn" : "ok",
      detail: disabled ? `disabled at ${scope} scope` : `${scope} scope`,
      ...(disabled ? { hint: `cf enable --${scope}` } : {}),
    });
  }
  return checks;
}

async function memoryChecks(claudePresent: boolean): Promise<DoctorCheck[]> {
  const mcpDir = libPathOrNull("cf-memory");
  const memoryDistPath = mcpDir
    ? join(mcpDir, "dist", "index.js")
    : "/unavailable";
  const built = existsSync(memoryDistPath);
  const probe = claudeMcpProbe(MEMORY_MCP_NAME, claudePresent);
  const result = await checkMemoryMcpHealth({
    readMcpJson: () =>
      readJson<Record<string, unknown>>(join(process.cwd(), ".mcp.json")),
    pathExists: existsSync,
    isDaemonRunning: built ? memoryDaemonRunning : async () => false,
    memoryDistPath,
    isRegistered: () => probe === "registered",
  });
  return fromHealth(result, "memory", MEMORY_IDS, probe, isMemoryInitialized());
}

async function learnChecks(claudePresent: boolean): Promise<DoctorCheck[]> {
  const learnMcpDir = libPathOrNull("learn-mcp");
  const probe = claudeMcpProbe(LEARN_MCP_NAME, claudePresent);
  const registered = probe === "registered";
  const result = await checkLearnMcpHealth({
    checkRegistered: () => registered,
    pathExists: existsSync,
    listMdFiles: listMdFilesRecursive,
    docsDir: resolveLearnDir(readJson<CodingFriendConfig>(globalConfigPath())),
    learnMcpDistPath: learnMcpDir
      ? join(learnMcpDir, "dist", "index.js")
      : "/unavailable",
  });
  // Learn is set up once its MCP is registered; until then nothing is broken.
  return fromHealth(result, "learn", LEARN_IDS, probe, registered);
}

/** Git (history, push) and a cloud folder (sync) both move the same files: pick one. */
function learnStorageCheck(): DoctorCheck {
  const s = learnStatus(readJson<CodingFriendConfig>(globalConfigPath()));
  const base = { id: "learn.storage", group: "learn", label: "Learn storage" };
  if (s.mode === "git" && s.cloud) {
    return {
      ...base,
      status: "warn",
      detail: `git repo inside ${s.cloud.provider} folder ${s.cloud.root}`,
      hint: "use either git or a cloud folder for learn notes",
    };
  }
  const where = s.cloud ? ` in ${s.cloud.provider}` : "";
  return { ...base, status: "ok", detail: `${s.mode}${where}: ${s.outputDir}` };
}

function hostChecks(hosts: Host[]): DoctorCheck[] {
  return hosts.map((host) => {
    const id = `host.${host}.version`;
    const label = `${host} version`;
    const actual = binaryVersion(host);
    if (!actual) {
      return {
        id,
        group: "hosts",
        label,
        status: "warn",
        detail: `could not read \`${host} --version\` (failed or timed out)`,
      };
    }
    if (host === "claude") {
      return { id, group: "hosts", label, status: "ok", detail: actual };
    }
    const min = HOST_MIN_VERSION[host]();
    const ok = compareVersions(actual, min) >= 0;
    return {
      id,
      group: "hosts",
      label,
      status: ok ? "ok" : "warn",
      detail: ok ? actual : `${actual} (requires >= ${min})`,
      ...(ok ? {} : { hint: `Upgrade ${host} to >= ${min}` }),
    };
  });
}

function heartbeatAge(at: string | undefined): number | null {
  if (at === undefined) return null;
  const ms = Date.now() - Date.parse(at);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : null;
}

function supervisorChecks(): DoctorCheck[] {
  if (!launchdSupported()) return [];
  const group = "supervisor";
  const s = launchdStatus({ label: DEFAULT_LABEL });
  const launchd: DoctorCheck = {
    id: "supervisor.launchd",
    group,
    label: "launchd agent",
    status: "ok",
    detail: "installed and loaded",
  };
  if (!s.plistExists) {
    launchd.status = "warn";
    launchd.detail = `not installed (${s.plistPath})`;
  } else if (s.needsReinstall) {
    launchd.status = "fail";
    launchd.detail = `missing program path(s): ${s.missingPaths.join(", ")}`;
  } else if (!s.loaded) {
    launchd.status = "warn";
    launchd.detail = "installed but not loaded";
  }
  // `supervisor install` rewrites the plist and bootstraps it.
  if (launchd.status !== "ok")
    launchd.fix = fix(RUNNABLE_FIXES.supervisorInstall);

  const at = readHeartbeat();
  const age = heartbeatAge(at);
  const stale = age === null || age > HEARTBEAT_STALE_S;
  const heartbeat: DoctorCheck = {
    id: "supervisor.heartbeat",
    group,
    label: "Heartbeat",
    status: stale ? "warn" : "ok",
    detail: at === undefined ? "no tick has run yet" : `last tick ${at}`,
  };
  // A tick only helps once launchd runs the agent; otherwise fix launchd first.
  if (stale && s.loaded) heartbeat.fix = fix(RUNNABLE_FIXES.supervisorTick);
  return [launchd, heartbeat];
}

function registryChecks(): DoctorCheck[] {
  const base = {
    id: "registry.readable",
    group: "registry",
    label: "Project registry",
  };
  try {
    const { projects, warning } = listProjects();
    return warning
      ? [{ ...base, status: "warn", detail: warning }]
      : [{ ...base, status: "ok", detail: `${projects.length} project(s)` }];
  } catch (err) {
    return [
      {
        ...base,
        status: "warn",
        detail: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

export function cliInfo(cliVersion: string): DoctorData["cli"] {
  return { version: cliVersion, node: process.versions.node, path: cliPath() };
}

function cliPath(): string {
  const entry = process.argv[1] ?? "";
  try {
    return realpathSync(entry);
  } catch {
    return entry;
  }
}

export async function collectDoctor(cliVersion: string): Promise<DoctorData> {
  const hosts = detectHostsAvailable();
  const claudePresent = hosts.includes("claude");
  const checks: DoctorCheck[] = [
    ...cliChecks(),
    ...pluginChecks(claudePresent),
    ...(await memoryChecks(claudePresent)),
    ...(await learnChecks(claudePresent)),
    learnStorageCheck(),
    ...hostChecks(hosts),
    ...supervisorChecks(),
    ...registryChecks(),
  ];
  return { cli: cliInfo(cliVersion), checks };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parsed JSON object, or the reason it is not one. */
function readJsonObject(
  file: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf-8"));
    return isPlainObject(value)
      ? { ok: true, value }
      : { ok: false, error: "not a JSON object" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
/** POSIX single-quote a path for a copyable hint (`'` → `'\''`). */
/** POSIX single-quote a path for a copyable hint (`'` → `'\\''`). */
function quotePath(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/** Registry, local config, docs, memory and `.mcp.json` of one project root. */
export function collectProjectChecks(root: string): DoctorCheck[] {
  const group = "project";
  const checks: DoctorCheck[] = [];

  const { projects, warning } = listProjects();
  const canonical = canonicalProjectPath(root);
  const registered = projects.some((p) => p.path === canonical);
  checks.push({
    id: "project.registered",
    group,
    label: "Registered",
    status: registered ? "ok" : "warn",
    ...(registered
      ? {}
      : {
          detail: warning ?? "not in the project registry",
          hint: `cf project add -- ${quotePath(root)}`,
        }),
  });

  // Same checks loadConfig's validation runs, without its log.warn output.
  const configPath = join(root, ".coding-friend", "config.json");
  const configBase = { id: "project.config", group, label: "Local config" };
  let local: Record<string, unknown> = {};
  const parsed = existsSync(configPath) ? readJsonObject(configPath) : null;
  if (parsed === null) {
    checks.push({ ...configBase, status: "ok", detail: "none" });
  } else if (!parsed.ok) {
    checks.push({
      ...configBase,
      status: "fail",
      detail: `${configPath}: ${parsed.error}`,
      hint: `Fix or delete ${configPath}`,
    });
  } else {
    local = parsed.value;
    const problems = [
      ...findUnknownKeys(local).map(
        (u) => `unknown key '${[...u.path, u.key].join(".")}'`,
      ),
      ...(ConfigSchema.safeParse(local).error?.issues ?? []).map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    ];
    checks.push(
      problems.length === 0
        ? { ...configBase, status: "ok", detail: configPath }
        : {
            ...configBase,
            status: "warn",
            detail: problems.join("; "),
            hint: `Edit ${configPath}`,
          },
    );
  }

  // loadConfig's precedence for docsDir: local, then global, then "docs".
  const global = readJson<Record<string, unknown>>(globalConfigPath());
  const docsSetting = [local.docsDir, global?.docsDir].find(
    (v): v is string => typeof v === "string",
  );
  const docsDir = resolvePath(docsSetting ?? "docs", root);
  const docsExists = existsSync(docsDir);
  checks.push({
    id: "project.docsDir",
    group,
    label: "Docs directory",
    status: docsExists ? "ok" : "warn",
    detail: docsExists ? docsDir : `missing: ${docsDir}`,
  });

  const memoryDir = join(docsDir, "memory");
  const memoryExists = existsSync(memoryDir);
  checks.push({
    id: "project.memory",
    group,
    label: "Memory",
    status: memoryExists ? "ok" : "warn",
    detail: memoryExists
      ? `${listMdFilesRecursive(memoryDir).length} file(s) in ${memoryDir}`
      : `missing: ${memoryDir}`,
  });

  // Same condition as memory.mcp.projectShadow, for this root's .mcp.json.
  const state = detectMemoryMcpState(
    readJson<Record<string, unknown>>(join(root, ".mcp.json")),
    existsSync,
  );
  const shadowDetail =
    state.kind === "stale"
      ? `Stale entry shadows user-scope server (path missing: ${state.path})`
      : state.kind === "legacy-valid"
        ? "Legacy absolute-path entry shadows user-scope server"
        : state.kind === "npx"
          ? "Project-scope npx entry shadows user-scope server"
          : null;
  checks.push({
    id: "project.mcpShadow",
    group,
    label: "Project .mcp.json",
    ...(shadowDetail
      ? {
          status: "warn",
          detail: shadowDetail,
          // cf update only cleans the cwd's .mcp.json, so run it in root.
          hint: `cd ${quotePath(root)} && cf update`,
        }
      : { status: "ok", detail: "no coding-friend-memory entry" }),
  });

  return checks;
}
