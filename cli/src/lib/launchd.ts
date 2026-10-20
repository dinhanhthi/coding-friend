import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import { runWithStderr, type RunResult } from "./exec.js";
import { CliError } from "./output.js";

/** launchd agent that runs `cf supervisor tick` every minute (macOS only). */

export const DEFAULT_LABEL = "com.coding-friend.supervisor";
export const START_INTERVAL_SECONDS = 60;

const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,127}$/;

/** Runs `launchctl <args>` without a shell; injectable for tests. */
export type LaunchctlRunner = (args: string[]) => RunResult;

export const runLaunchctl: LaunchctlRunner = (args) =>
  runWithStderr("/bin/launchctl", args);

export interface LaunchdOptions {
  label?: string;
  /** Overrides ~/Library/LaunchAgents (tests). */
  launchAgentsDir?: string;
  uid?: number;
  launchctl?: LaunchctlRunner;
}

export interface InstallOptions extends LaunchdOptions {
  programArgs: string[];
  storeDir: string;
  path: string;
}

export interface LaunchdStatus {
  label: string;
  plistPath: string;
  plistExists: boolean;
  loaded: boolean;
  programArgs: string[] | null;
  /** Absolute paths named in ProgramArguments that no longer exist. */
  missingPaths: string[];
  needsReinstall: boolean;
}

export function isSupported(): boolean {
  return process.platform === "darwin";
}

/** The label becomes a file name and a launchctl target: allow a safe subset only. */
export function validateLabel(label: string): string {
  if (!LABEL_RE.test(label) || label.includes("..")) {
    throw new CliError(
      "INVALID_VALUE",
      `Invalid label "${label}": use letters, digits, "." and "-" (max 128, no "..").`,
    );
  }
  return label;
}

export function launchAgentsDir(home: string = homedir()): string {
  return join(home, "Library", "LaunchAgents");
}

export function plistPath(
  label: string,
  opts: { launchAgentsDir?: string } = {},
): string {
  return join(
    opts.launchAgentsDir ?? launchAgentsDir(),
    `${validateLabel(label)}.plist`,
  );
}

export function tickLogPath(storeDir: string): string {
  return join(storeDir, "supervisor", "tick.log");
}

/** Command line of this cf process, pointed at `supervisor tick`. */
export function tickProgramArgs(): string[] {
  return [
    process.execPath,
    ...process.execArgv,
    realpathSync(process.argv[1]),
    "supervisor",
    "tick",
  ];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function str(value: string): string {
  return `<string>${escapeXml(value)}</string>`;
}

export function buildPlist(opts: {
  label: string;
  programArgs: string[];
  storeDir: string;
  path: string;
}): string {
  const log = tickLogPath(opts.storeDir);
  const args = opts.programArgs.map((a) => `\t\t${str(a)}`).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `\t<key>Label</key>`,
    `\t${str(validateLabel(opts.label))}`,
    `\t<key>ProgramArguments</key>`,
    `\t<array>`,
    args,
    `\t</array>`,
    `\t<key>StartInterval</key>`,
    `\t<integer>${START_INTERVAL_SECONDS}</integer>`,
    `\t<key>RunAtLoad</key>`,
    `\t<true/>`,
    `\t<key>StandardOutPath</key>`,
    `\t${str(log)}`,
    `\t<key>StandardErrorPath</key>`,
    `\t${str(log)}`,
    `\t<key>EnvironmentVariables</key>`,
    `\t<dict>`,
    `\t\t<key>PATH</key>`,
    `\t\t${str(opts.path)}`,
    `\t\t<key>CF_ORCHESTRATOR_DIR</key>`,
    `\t\t${str(opts.storeDir)}`,
    `\t</dict>`,
    `</dict>`,
    `</plist>`,
    ``,
  ].join("\n");
}

/** ProgramArguments of a plist written by buildPlist, or null if unreadable. */
export function readProgramArgs(file: string): string[] | null {
  let xml: string;
  try {
    xml = readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  const m = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(
    xml,
  );
  if (!m) return null;
  return [...m[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((s) =>
    unescapeXml(s[1]),
  );
}

function target(opts: LaunchdOptions) {
  const label = validateLabel(opts.label ?? DEFAULT_LABEL);
  const uid = opts.uid ?? process.getuid?.() ?? 0;
  return {
    label,
    file: plistPath(label, opts),
    domain: `gui/${uid}`,
    service: `gui/${uid}/${label}`,
    launchctl: opts.launchctl ?? runLaunchctl,
  };
}

function writePlistAtomic(file: string, xml: string): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, xml, { encoding: "utf-8", mode: 0o644 });
    // launchd refuses group/world-writable plists; do not depend on umask.
    chmodSync(tmp, 0o644);
    renameSync(tmp, file);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // best effort
    }
    throw err;
  }
}

function failure(what: string, r: RunResult): CliError {
  const detail = (r.stderr || r.stdout).trim();
  return new CliError(
    "COMMAND_FAILED",
    `launchctl ${what} failed (exit ${r.exitCode})${detail ? `: ${detail}` : ""}`,
  );
}

/** Write the plist and (re)load it into the user's GUI domain. */
export function install(opts: InstallOptions): {
  label: string;
  plistPath: string;
} {
  const { label, file, domain, service, launchctl } = target(opts);
  const xml = buildPlist({
    label,
    programArgs: opts.programArgs,
    storeDir: opts.storeDir,
    path: opts.path,
  });
  mkdirSync(opts.launchAgentsDir ?? launchAgentsDir(), { recursive: true });
  // launchd does not create the log's parent directory.
  mkdirSync(join(opts.storeDir, "supervisor"), {
    recursive: true,
    mode: 0o700,
  });
  writePlistAtomic(file, xml);
  launchctl(["bootout", service]); // not loaded yet is fine
  const r = launchctl(["bootstrap", domain, file]);
  if (r.exitCode !== 0) throw failure("bootstrap", r);
  return { label, plistPath: file };
}

/** Unload the agent (if loaded) and remove its plist. */
export function uninstall(opts: LaunchdOptions = {}): {
  label: string;
  plistPath: string;
  removed: boolean;
} {
  const { label, file, service, launchctl } = target(opts);
  const r = launchctl(["bootout", service]);
  // bootout fails when the service is not loaded; only a still-loaded service is an error.
  if (r.exitCode !== 0 && launchctl(["print", service]).exitCode === 0) {
    throw failure("bootout", r);
  }
  let removed = true;
  try {
    unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    removed = false;
  }
  return { label, plistPath: file, removed };
}

/** Plist present, service loaded, and the program paths it names still exist. */
export function status(opts: LaunchdOptions = {}): LaunchdStatus {
  const { label, file, service, launchctl } = target(opts);
  const plistExists = existsSync(file);
  // `launchctl print` output is not API: only its exit code is used.
  const loaded = launchctl(["print", service]).exitCode === 0;
  const programArgs = plistExists ? readProgramArgs(file) : null;
  const missingPaths = (programArgs ?? []).filter(
    (a) => a.startsWith("/") && !existsSync(a),
  );
  return {
    label,
    plistPath: file,
    plistExists,
    loaded,
    programArgs,
    missingPaths,
    needsReinstall: missingPaths.length > 0,
  };
}
