import { execFileSync } from "child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "fs";
import { createConnection } from "net";
import { homedir } from "os";
import { basename, join } from "path";
import { isMemoryInitialized } from "../commands/memory.js";
import {
  ConfigSchema,
  findUnknownKeys,
  localConfigHasDecision,
  resolveDecisionConfig,
  resolveLearnDir,
  resolveSessionDir,
  type DecisionConfig,
} from "./config.js";
import { checkGate } from "./decide.js";
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
import { inGitWorkTree, learnStatus } from "./learn-storage.js";
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
import {
  claudeProjectsDir,
  claudeSettingsPath,
  globalConfigPath,
  memoryDepsDir,
  quotaSnapshotPath,
  resolvePath,
} from "./paths.js";
import {
  detectPluginScope,
  isMarketplaceRegistered,
  isModsInstalled,
  installedModsVersion,
  isPluginDisabled,
  isPluginInstalled,
} from "./plugin-state.js";
import { canonicalProjectPath, listProjects } from "./project-registry.js";
import {
  MEASURED_AT_MAX_SKEW_S,
  readQuotaSnapshot,
  snapshotAgeSeconds,
} from "./quota-snapshot.js";
import {
  isSessionUuid,
  listProjectTranscripts,
  listSavedSessions,
  type SavedSession,
} from "./session.js";
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
  const modsVersion = isModsInstalled() ? (installedModsVersion() ?? "") : null;
  checks.push({
    id: "plugin.mods",
    group,
    label: "Mods plugin (optional)",
    status: "ok",
    detail:
      modsVersion === null
        ? "optional: cf install --mods"
        : modsVersion
          ? `installed v${modsVersion}`
          : "installed",
  });
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

/** Claude Code's default when no settings scope sets `cleanupPeriodDays`. */
const DEFAULT_CLEANUP_DAYS = 30;
/** Warn this many days before Claude's cleanup deletes a transcript. */
const RETENTION_MARGIN_DAYS = 7;
const DAY_MS = 86_400_000;
/** Settings files at or above this size are skipped. */
const MAX_SETTINGS_BYTES = 1024 * 1024;

/**
 * `cleanupPeriodDays` from one Claude settings file, or null when the file is
 * missing, not a regular file under 1 MiB, broken or the value is not a whole
 * number >= 1. Only this key is read, and no error text is kept: JSON.parse
 * messages quote the file.
 */
function readCleanupDays(file: string): number | null {
  try {
    // A symlink to /dev/zero or a FIFO in an untrusted repo must not hang doctor.
    const st = lstatSync(file);
    if (!st.isFile() || st.size >= MAX_SETTINGS_BYTES) return null;
    const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
    if (!isPlainObject(parsed)) return null;
    const days = parsed.cleanupPeriodDays;
    return Number.isInteger(days) && (days as number) >= 1
      ? (days as number)
      : null;
  } catch {
    return null;
  }
}

/** First valid `cleanupPeriodDays` in precedence order, else Claude's default. */
function cleanupDays(files: string[]): number {
  for (const file of files) {
    const days = readCleanupDays(file);
    if (days !== null) return days;
  }
  return DEFAULT_CLEANUP_DAYS;
}

/** Session ids of saved (not placeholder) sessions with a valid UUID. */
function savedSessionIds(sessions: SavedSession[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sessions) {
    if (s.status === "ok" && isSessionUuid(s.meta?.sessionId)) {
      ids.add(s.meta.sessionId);
    }
  }
  return ids;
}

/** Every live `<claude>/projects/<dir>/<uuid>.jsonl` (lstat only, no symlinks). */
function allClaudeTranscripts(): { path: string; mtime: number }[] {
  const base = claudeProjectsDir();
  let dirs: string[];
  try {
    dirs = readdirSync(base);
  } catch {
    return [];
  }
  const out: { path: string; mtime: number }[] = [];
  for (const d of dirs) {
    const dir = join(base, d);
    let names: string[];
    try {
      if (!lstatSync(dir).isDirectory()) continue;
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      if (!isSessionUuid(basename(name, ".jsonl"))) continue;
      const path = join(dir, name);
      try {
        const st = lstatSync(path);
        if (st.isFile()) out.push({ path, mtime: st.mtimeMs });
      } catch {
        continue;
      }
    }
  }
  return out;
}

/** Unsaved transcripts Claude's cleanup deletes within RETENTION_MARGIN_DAYS. */
function retentionCheck(
  base: { id: string; group: string; label: string },
  days: number,
  transcripts: { path: string; mtime: number }[],
  saved: Set<string>,
): DoctorCheck {
  const ageDays = Math.max(1, days - RETENTION_MARGIN_DAYS);
  const cutoff = Date.now() - ageDays * DAY_MS;
  const atRisk = transcripts.filter(
    (t) => t.mtime < cutoff && !saved.has(basename(t.path, ".jsonl")),
  ).length;
  const detail = `${atRisk} unsaved session(s) within ${RETENTION_MARGIN_DAYS} days of the ${days}-day cleanup`;
  if (atRisk === 0) return { ...base, status: "ok", detail };
  return {
    ...base,
    status: "warn",
    detail,
    hint: "cf session save, or raise cleanupPeriodDays in Claude settings",
  };
}

/** Saved transcripts are verbatim (unredacted): a git repo could commit them. */
function sessionChecks(): DoctorCheck[] {
  const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
  const dir = resolveSessionDir(globalCfg);
  const group = "session";
  const storageBase = {
    id: "session.storage",
    group,
    label: "Session storage",
  };
  let storage: DoctorCheck;
  if (!isDir(dir)) {
    storage = {
      ...storageBase,
      status: "ok",
      detail: `not created yet: ${dir}`,
    };
  } else if (inGitWorkTree(dir)) {
    storage = {
      ...storageBase,
      status: "warn",
      detail: `inside a git work tree (unredacted transcripts could be committed): ${dir}`,
      hint: "use a folder that is not a git repo",
    };
  } else {
    storage = { ...storageBase, status: "ok", detail: dir };
  }
  const retention = retentionCheck(
    { id: "session.retention", group, label: "Session retention" },
    cleanupDays([claudeSettingsPath()]),
    allClaudeTranscripts(),
    savedSessionIds(listSavedSessions(dir, "saved")),
  );
  return [storage, retention];
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
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

const DECISION_ENV_KEYS: Record<DecisionConfig["provider"], string[]> = {
  off: [],
  local: [],
  typesafe: ["TYPESAFE_API_KEY"],
  cloudflare: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
};

/**
 * The global-only `decision` block. Offline: env keys are reported by name
 * (set/missing), never by value, and the provider is never called.
 */
function decisionChecks(): DoctorCheck[] {
  const cfg = resolveDecisionConfig();
  const group = "decision";
  const checks: DoctorCheck[] = [];
  const provider = {
    id: "decision.provider",
    group,
    label: "Decision provider",
  };
  if (cfg.provider === "off") {
    checks.push({ ...provider, status: "ok", detail: "off" });
  } else {
    const keys = DECISION_ENV_KEYS[cfg.provider];
    const missing = keys.filter((k) => !process.env[k]?.trim());
    const env = keys.map(
      (k) => `${k} ${missing.includes(k) ? "missing" : "set"}`,
    );
    const detail = [`${cfg.provider} ${cfg.model}`, ...env].join("; ");
    checks.push(
      missing.length === 0
        ? { ...provider, status: "ok", detail }
        : {
            ...provider,
            status: "warn",
            detail,
            hint: `export ${missing.join(" and ")} in your shell (never in config)`,
          },
    );
  }

  // Remote per the gate itself: with allowRemote off, only remote is refused.
  const probe = checkGate({ ...cfg, allowRemote: false });
  if (!probe.ok && probe.reason === "gate") {
    const gate = { id: "decision.gate", group, label: "Decision data gate" };
    checks.push(
      cfg.allowRemote
        ? { ...gate, status: "ok", detail: "allowRemote is true" }
        : {
            ...gate,
            status: "warn",
            detail:
              "nothing will be sent until decision.allowRemote is true in the global config",
          },
    );
  }

  if (cfg.provider === "typesafe" && /-(latest|preview)$/.test(cfg.model)) {
    checks.push({
      id: "decision.model",
      group,
      label: "Decision model",
      status: "warn",
      detail: `${cfg.model} is not a pinned version`,
      hint: "set decision.model to a versioned id, e.g. jev-1.14.0",
    });
  }

  if (localConfigHasDecision(process.cwd())) {
    checks.push({
      id: "decision.local",
      group,
      label: "Local decision block",
      status: "warn",
      detail: "ignored: decision is read from the global config only",
      hint: "remove the decision block from .coding-friend/config.json by hand",
    });
  }
  return checks;
}

/** A quota snapshot older than this (seconds) is reported as stale. */
const QUOTA_SNAPSHOT_STALE_S = 24 * 3600;

function formatAge(s: number): string {
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86_400)} day(s)`;
}

/**
 * The Claude quota snapshot written by the statusline or coding-friend-mods.
 * Read-only and offline: only the local file is inspected.
 */
function quotaSnapshotCheck(): DoctorCheck {
  const base = {
    id: "quota.snapshot",
    group: "quota",
    label: "Quota snapshot",
  };
  const path = quotaSnapshotPath();
  let isFile: boolean;
  try {
    isFile = lstatSync(path).isFile();
  } catch {
    return {
      ...base,
      status: "ok",
      detail: "not recorded (needs CF statusline or coding-friend-mods)",
    };
  }
  const snap = readQuotaSnapshot(path);
  if (!snap) {
    return {
      ...base,
      status: "warn",
      detail: `${isFile ? "malformed" : "not a regular file"} (${path})`,
      hint: "remove it; the statusline or coding-friend-mods rewrites it",
    };
  }
  const now = Math.floor(Date.now() / 1000);
  const age = snapshotAgeSeconds(snap, now);
  if (-age > MEASURED_AT_MAX_SKEW_S) {
    return {
      ...base,
      status: "warn",
      detail: `measuredAt is ${formatAge(-age)} in the future`,
      hint: "check the system clock, or remove the file to let it be rewritten",
    };
  }
  const detail = `measured ${formatAge(Math.max(0, age))} ago by ${snap.source}`;
  if (age > QUOTA_SNAPSHOT_STALE_S) {
    return {
      ...base,
      status: "warn",
      detail,
      hint: "is the CF statusline or coding-friend-mods running for this Claude account?",
    };
  }
  return { ...base, status: "ok", detail };
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
    ...sessionChecks(),
    ...hostChecks(hosts),
    ...supervisorChecks(),
    ...registryChecks(),
    ...decisionChecks(),
    quotaSnapshotCheck(),
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

  // Claude's precedence for cleanupPeriodDays: local, then project, then user.
  const sessionDir = resolveSessionDir(global as CodingFriendConfig | null);
  const legacyDir = join(docsDir, "sessions");
  const legacy = listSavedSessions(legacyDir, "legacy");
  checks.push(
    retentionCheck(
      { id: "project.retention", group, label: "Session retention" },
      cleanupDays([
        join(root, ".claude", "settings.local.json"),
        join(root, ".claude", "settings.json"),
        claudeSettingsPath(),
      ]),
      listProjectTranscripts(root),
      savedSessionIds([...listSavedSessions(sessionDir, "saved"), ...legacy]),
    ),
  );
  checks.push({
    id: "project.legacySessions",
    group,
    label: "Legacy sessions",
    status: "ok",
    ...(legacy.length > 0
      ? {
          detail: `${legacy.length} session(s) in ${legacyDir}`,
          hint: `mkdir -p ${quotePath(sessionDir)} && mv ${quotePath(legacyDir)}/* ${quotePath(sessionDir)}/`,
        }
      : { detail: "none" }),
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
