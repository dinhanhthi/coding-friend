import { execFileSync, spawn } from "child_process";
import {
  DEFAULT_LABEL,
  install,
  isSupported,
  status,
  tccProtectedPaths,
  tickLogPath,
  tickProgramArgs,
  uninstall,
  type LaunchdStatus,
} from "../lib/launchd.js";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { shellQuote } from "../lib/orchestrator/preamble.js";
import { listTasks } from "../lib/orchestrator/store.js";
import {
  hasLiveRunner,
  readHeartbeat,
  tickOnce,
} from "../lib/orchestrator/supervisor.js";
import { orchestratorDir } from "../lib/paths.js";

interface Flags {
  json?: boolean;
}

interface LabelFlags extends Flags {
  label?: string;
}

/** JSON mode → envelope; human mode → log CliError then exit 1 via runHuman. */
async function run<T>(
  json: boolean | undefined,
  fn: () => T | Promise<T>,
  print: (data: T) => void,
): Promise<void> {
  if (json) {
    await runJson(fn);
    return;
  }
  await runHuman(async () => {
    try {
      print(await fn());
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

/**
 * crontab line running the tick every minute (non-darwin hint). cron's own
 * PATH lacks claude/codex: pass this shell's, as the launchd plist does.
 */
function cronLine(): string {
  let env = process.env.PATH ? `PATH=${shellQuote(process.env.PATH)} ` : "";
  if (process.env.CF_ORCHESTRATOR_DIR) {
    env += `CF_ORCHESTRATOR_DIR=${shellQuote(orchestratorDir())} `;
  }
  const command = `${env}${tickProgramArgs().map(shellQuote).join(" ")}`;
  // cron reads an unescaped % as a newline, even inside quotes.
  return `* * * * * ${command.replace(/%/g, "\\%")}`;
}

function assertSupported(): void {
  if (isSupported()) return;
  throw new CliError(
    "PROVIDER_UNAVAILABLE",
    `launchd is only available on macOS. Run the tick from cron instead:\n  ${cronLine()}`,
  );
}

export async function supervisorInstallCommand(
  opts: LabelFlags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      assertSupported();
      const storeDir = orchestratorDir();
      const programArgs = tickProgramArgs();
      const res = install({
        label: opts.label ?? DEFAULT_LABEL,
        programArgs,
        storeDir,
        path: process.env.PATH ?? "",
      });
      const warnings: string[] = [];
      const protectedPaths = tccProtectedPaths(programArgs);
      if (protectedPaths.length) {
        warnings.push(
          `launchd cannot run program path(s) in a macOS privacy-protected folder without Full Disk Access: ${protectedPaths.join(", ")}. Move node / the cf CLI out of Desktop, Documents, Downloads or iCloud Drive and reinstall, or grant Full Disk Access to node.`,
        );
      }
      return { ...res, logPath: tickLogPath(storeDir), storeDir, warnings };
    },
    (r) => {
      log.success(`Installed launchd agent ${r.label}`);
      console.log(`  plist: ${r.plistPath}`);
      console.log(`  log:   ${r.logPath}`);
      console.log(`  store: ${r.storeDir}`);
      for (const w of r.warnings) log.warn(w);
      log.warn(
        "Credentials set only in this shell's environment are not passed to launchd: runners it starts after a reboot will not see them.",
      );
    },
  );
}

export async function supervisorUninstallCommand(
  opts: LabelFlags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      assertSupported();
      return uninstall({ label: opts.label ?? DEFAULT_LABEL });
    },
    (r) =>
      log.success(
        r.removed
          ? `Uninstalled launchd agent ${r.label} (removed ${r.plistPath})`
          : `Launchd agent ${r.label} was not installed`,
      ),
  );
}

interface SupervisorStatus {
  supported: boolean;
  /** null off darwin. */
  launchd: LaunchdStatus | null;
  /** null when no tick ever ran. */
  heartbeat: { at: string; ageSeconds: number | null } | null;
  paused: number;
  /** Paused tasks whose runner is gone (the tick adopts them when due). */
  orphaned: number;
}

function ageLabel(s: number | null): string {
  if (s === null) return "?";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function readStatus(opts: LabelFlags): SupervisorStatus {
  const supported = isSupported();
  const launchd = supported
    ? status({ label: opts.label ?? DEFAULT_LABEL })
    : null;
  const at = readHeartbeat();
  let heartbeat: SupervisorStatus["heartbeat"] = null;
  if (at !== undefined) {
    const ms = Date.now() - Date.parse(at);
    heartbeat = {
      at,
      ageSeconds: Number.isFinite(ms)
        ? Math.max(0, Math.floor(ms / 1000))
        : null,
    };
  }
  const paused = listTasks().filter((t) => t.attempts && t.state === "paused");
  const orphaned = paused.filter((t) => !hasLiveRunner(t.id)).length;
  return {
    supported,
    launchd,
    heartbeat,
    paused: paused.length,
    orphaned,
  };
}

function printStatus(s: SupervisorStatus): void {
  if (s.launchd) {
    const l = s.launchd;
    console.log(`Supervisor (launchd agent ${l.label})`);
    console.log(
      `  plist:     ${l.plistPath}${l.plistExists ? "" : " (not installed)"}`,
    );
    console.log(`  loaded:    ${l.loaded ? "yes" : "no"}`);
  } else {
    console.log(`Supervisor (launchd unsupported on ${process.platform})`);
  }
  console.log(
    `  heartbeat: ${s.heartbeat ? `${ageLabel(s.heartbeat.ageSeconds)} ago (${s.heartbeat.at})` : "never"}`,
  );
  console.log(`  paused:    ${s.paused} (${s.orphaned} orphaned)`);
  if (s.launchd?.needsReinstall) {
    log.warn(
      `Missing program path(s): ${s.launchd.missingPaths.join(", ")}. Reinstall with \`cf supervisor install\`.`,
    );
  }
  if (!s.supported) log.info(`Run the tick from cron:\n  ${cronLine()}`);
}

export async function supervisorStatusCommand(opts: LabelFlags): Promise<void> {
  await run(opts.json, () => readStatus(opts), printStatus);
}

/** Below launchd's StartInterval (60 s): a hung tick ends before the next. */
const TICK_TIMEOUT_S = 45;

/** `ps` columns naming one process: its start time and full command line. */
const PS_IDENTITY = ["-ww", "-o", "lstart=,command=", "-p"];

/** Start time + command line of `pid` as `ps` prints them, "" when unknown. */
export function processIdentity(pid: number): string {
  try {
    return execFileSync("/bin/ps", [...PS_IDENTITY, String(pid)], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).replace(/\n+$/, ""); // as sh's $(...) strips it
  } catch {
    return "";
  }
}

/**
 * argv of the watchdog: after `delayS`, SIGTERM `pid` only if `ps` still
 * reports the identity captured at start, so a reused pid is never killed.
 * pid and identity are positional args, never parsed as shell code.
 */
export function watchdogArgv(
  pid: number,
  identity: string,
  delayS: number,
): string[] {
  const ps = `/bin/ps ${PS_IDENTITY.join(" ")} "$2" 2>/dev/null`;
  return [
    "/bin/sh",
    "-c",
    `sleep "$1"; [ "$(${ps})" = "$3" ] && kill -TERM "$2"`,
    "sh",
    String(delayS),
    String(pid),
    identity,
  ];
}

/**
 * SIGTERM this process after TICK_TIMEOUT_S unless it exits first. A
 * separate process, not a timer: the tick is synchronous, so a blocked read
 * would also block any timer.
 */
function startWatchdog(): void {
  if (process.platform === "win32") return;
  const identity = processIdentity(process.pid);
  if (!identity) return; // no identity to check: never kill blind
  const [sh, ...args] = watchdogArgv(process.pid, identity, TICK_TIMEOUT_S);
  const child = spawn(sh, args, { detached: true, stdio: "ignore" });
  child.once("error", () => {}); // no watchdog: the tick still runs
  child.unref();
  // On every exit (process.exit included): stop sh and its sleep.
  process.once("exit", () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  });
}

export async function supervisorTickCommand(opts: Flags): Promise<void> {
  startWatchdog();
  await run(
    opts.json,
    () => tickOnce(),
    (s) => {
      // stdout is tick.log under launchd: silent unless something happened.
      for (const id of s.adopted) console.log(`supervisor: adopted task ${id}`);
      for (const id of s.failed) console.log(`supervisor: failed task ${id}`);
    },
  );
}
