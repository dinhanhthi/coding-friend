// Devin CLI plugin helpers. Install state is read from Devin's own lock file at
// ~/.local/share/devin/cli/plugins/lock.json (XDG_DATA_HOME honored); installs go
// through `devin plugins install/remove` — never by writing lock.json directly.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";

import { run } from "./exec.js";
import { readJson } from "./json.js";
import { log } from "./log.js";
import {
  claudeJsonPath,
  devinMcpConfigPath,
  devinPluginsLockPath,
  devStatePath,
} from "./paths.js";

const PLUGIN_NAME = "coding-friend";
const PLUGIN_SUBDIR = "plugin-devin";
const GITHUB_SPEC = "dinhanhthi/coding-friend#plugin-devin";
const GITHUB_REPO_URL = "https://github.com/dinhanhthi/coding-friend";
const GITHUB_REPO_GIT = `${GITHUB_REPO_URL}.git`;
const GITHUB_MANIFEST_RAW_URL = `https://raw.githubusercontent.com/dinhanhthi/coding-friend/HEAD/${PLUGIN_SUBDIR}/.claude-plugin/plugin.json`;
const FETCH_TIMEOUT_MS = 10_000;

export type DevinInstallKind = "github" | "local" | "none" | "unknown";

export interface DevinInstallState {
  kind: DevinInstallKind;
  /** local: spec.path (installed dir, realpath'd by Devin). github: spec.url. */
  path?: string;
  /** github only: spec.path — the repo subdir ("plugin" vs "plugin-devin"). */
  subdir?: string;
  /** version_dir from the lock entry, when present. */
  version?: string;
}

export type DevinDesiredSource =
  | { kind: "local"; path: string }
  | { kind: "github"; spec: string };

export type DevinReconcileAction =
  | "installed"
  | "updated"
  | "replaced"
  | "unchanged";

export interface ReconcileDevinOptions {
  /** Allow removing a differently-sourced install before installing. */
  allowReplace?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Tolerant parse of Devin's plugins lock.json. Returns the state of the
 * `coding-friend` entry in resolved[]:
 * - missing file / no matching entry → "none"
 * - spec.source "git-subdir" → "github" (path = repo url, subdir = spec.path)
 * - spec.source "local" → "local" (path = spec.path, stored realpath)
 * - unparseable file or unrecognized spec → "unknown" (callers remove+reinstall)
 */
export function readDevinInstallState(): DevinInstallState {
  const lockPath = devinPluginsLockPath();
  if (!existsSync(lockPath)) return { kind: "none" };

  const data = readJson<Record<string, unknown>>(lockPath);
  if (!isPlainObject(data) || !Array.isArray(data.resolved)) {
    return { kind: "unknown" };
  }

  const entry = data.resolved.find(
    (e): e is Record<string, unknown> =>
      isPlainObject(e) && e.name === PLUGIN_NAME,
  );
  if (!entry) return { kind: "none" };

  const version =
    typeof entry.version_dir === "string" && entry.version_dir
      ? entry.version_dir
      : undefined;
  const spec = isPlainObject(entry.spec) ? entry.spec : {};

  if (spec.source === "local" && typeof spec.path === "string") {
    return { kind: "local", path: spec.path, version };
  }

  if (spec.source === "git-subdir") {
    return {
      kind: "github",
      path: typeof spec.url === "string" ? spec.url : undefined,
      subdir: typeof spec.path === "string" ? spec.path : undefined,
      version,
    };
  }

  return { kind: "unknown", version };
}

/**
 * How many lock.json entries are named coding-friend. The Devin spec allows the
 * same name from two sources to coexist; plain `remove` then needs a dir-label
 * disambiguator we cannot construct, so callers must not treat count > 1 as a
 * normal single install.
 */
function devinInstallCount(): number {
  const lockPath = devinPluginsLockPath();
  if (!existsSync(lockPath)) return 0;

  const data = readJson<Record<string, unknown>>(lockPath);
  if (!isPlainObject(data) || !Array.isArray(data.resolved)) {
    return 0;
  }
  return data.resolved.filter(
    (e) => isPlainObject(e) && e.name === PLUGIN_NAME,
  ).length;
}

/**
 * The plugin source that SHOULD be installed. Dev mode (`cf dev on`) wins —
 * same rule as resolveAgyPluginSource — but unlike agy there is no fallback:
 * a missing built artifact is an error, not a reason to silently go to GitHub.
 */
export function desiredDevinSource(): DevinDesiredSource {
  const devState = readJson<{ localPath?: unknown }>(devStatePath());
  if (typeof devState?.localPath === "string" && devState.localPath.trim()) {
    const path = join(resolve(devState.localPath.trim()), PLUGIN_SUBDIR);
    const manifest = join(path, ".claude-plugin", "plugin.json");
    if (!existsSync(manifest)) {
      throw new Error(
        `Dev mode is on but ${manifest} is missing — run \`npm run build:devin\` first.`,
      );
    }
    return { kind: "local", path };
  }
  return { kind: "github", spec: GITHUB_SPEC };
}

/**
 * Throws unless `devin auth status` succeeds. MUST run before any remove —
 * `devin plugins install` requires auth, so removing first would strand the
 * user without a plugin they cannot reinstall.
 */
export function ensureDevinAuth(): void {
  if (run("devin", ["auth", "status"]) === null) {
    throw new Error(
      "Devin CLI is not signed in. Run `devin auth login` first, then retry.",
    );
  }
}

/**
 * Throws unless the desired source can actually be installed. Runs BEFORE any
 * remove so a broken target leaves the current install untouched.
 * - local: <path>/.claude-plugin/plugin.json must exist
 * - github: the repo must be reachable AND plugin-devin/.claude-plugin/plugin.json
 *   must exist on the default branch
 */
export async function checkDevinTargetResolvable(
  desired: DevinDesiredSource,
): Promise<void> {
  if (desired.kind === "local") {
    const manifest = join(desired.path, ".claude-plugin", "plugin.json");
    if (!existsSync(manifest)) {
      throw new Error(
        `Devin plugin manifest not found at ${manifest} — run \`npm run build:devin\` first.`,
      );
    }
    return;
  }

  const remote = run("git", ["ls-remote", GITHUB_REPO_GIT, "HEAD"]);
  if (remote === null) {
    throw new Error(
      `Cannot reach ${GITHUB_REPO_GIT} (git ls-remote failed). Check your network and that git is installed, or use dev mode: \`cf dev on .\``,
    );
  }

  let reachable = false;
  try {
    const res = await fetch(GITHUB_MANIFEST_RAW_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    throw new Error(
      `${GITHUB_SPEC} is not on the default branch yet — use dev mode \`cf dev on .\` to install from a local checkout. If it should already be published, check your network.`,
    );
  }
}

function realpathOrResolved(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** spec.path in lock.json is the realpath (e.g. /tmp → /private/tmp on macOS). */
function samePath(a: string, b: string): boolean {
  return realpathOrResolved(a) === realpathOrResolved(b);
}

function sameGithubRepo(url: string): boolean {
  const normalized = url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  return (
    normalized === "github.com/dinhanhthi/coding-friend" ||
    normalized === "github.com:dinhanhthi/coding-friend"
  );
}

/** True when the installed state already matches the desired source+target. */
function sameInstall(
  state: DevinInstallState,
  desired: DevinDesiredSource,
): boolean {
  if (desired.kind === "local") {
    return (
      state.kind === "local" &&
      typeof state.path === "string" &&
      samePath(state.path, desired.path)
    );
  }
  return (
    state.kind === "github" &&
    state.subdir === PLUGIN_SUBDIR &&
    typeof state.path === "string" &&
    sameGithubRepo(state.path)
  );
}

function describeState(state: DevinInstallState): string {
  switch (state.kind) {
    case "github":
      return `github ${state.path ?? "?"}#${state.subdir ?? "?"}`;
    case "local":
      return `local ${state.path ?? "?"}`;
    case "unknown":
      return "an unrecognized lock entry";
    case "none":
      return "nothing";
  }
}

function describeDesired(desired: DevinDesiredSource): string {
  return desired.kind === "local"
    ? `a local install (${desired.path})`
    : `the GitHub source ${desired.spec}`;
}

function installArgsFor(desired: DevinDesiredSource): string[] {
  return desired.kind === "local"
    ? ["plugins", "install", "--local", desired.path, "-y"]
    : ["plugins", "install", desired.spec, "-y"];
}

/**
 * Remove the installed plugin with the flag matching the detected kind.
 * Plain `remove` covers user-scope (manifest) installs; `--local` covers
 * "this machine"-scope installs. Every failure is ignored — the goal is to
 * clear whatever is there, and "not installed" is fine.
 */
function removeInstalledPlugin(kind: DevinInstallKind): void {
  const plain = ["plugins", "remove", PLUGIN_NAME, "-y"];
  const local = ["plugins", "remove", PLUGIN_NAME, "--local", "-y"];
  if (kind === "github") {
    run("devin", plain);
    return;
  }
  if (kind === "local") {
    run("devin", plain);
    run("devin", local);
    return;
  }
  // unknown shape: try both scopes.
  run("devin", plain);
  run("devin", local);
}

/**
 * Make the installed Devin plugin match desiredDevinSource().
 * Order is strict: auth → target resolvable → compare. Nothing is ever removed
 * before both checks pass.
 */
export async function reconcileDevinPlugin(
  opts: ReconcileDevinOptions = {},
): Promise<DevinReconcileAction> {
  ensureDevinAuth();
  const desired = desiredDevinSource();
  await checkDevinTargetResolvable(desired);

  const state = readDevinInstallState();
  const count = devinInstallCount();
  if (count > 1) {
    throw new Error(
      `Devin's lock.json lists coding-friend ${count} times — remove the extras manually (\`devin plugins remove\` will ask which install), then retry.`,
    );
  }

  if (sameInstall(state, desired)) {
    if (desired.kind === "github") {
      log.step("Updating Devin plugin from GitHub...");
      if (run("devin", ["plugins", "update", PLUGIN_NAME]) === null) {
        throw new Error(
          "`devin plugins update coding-friend` failed. Try it manually, or reinstall with `cf install --devin`.",
        );
      }
      return "updated";
    }
    log.dim("Devin plugin is a live --local link — edits are picked up by new sessions.");
    return "unchanged";
  }

  const replaceNeeded = state.kind !== "none";
  if (replaceNeeded && !opts.allowReplace) {
    throw new Error(
      `Devin currently has coding-friend installed from ${describeState(state)}, but ${describeDesired(desired)} is wanted. Run \`cf install --devin\` to replace it.`,
    );
  }

  if (state.kind === "github") {
    log.warn(
      `Replacing GitHub-installed coding-friend (${describeState(state)}). Devin syncs manifest installs to the cloud — reinstall via \`devin plugins install ${state.path}#${state.subdir}\` to restore it.`,
    );
  } else if (state.kind === "local") {
    log.info(
      `Replacing locally installed coding-friend (${describeState(state)}).`,
    );
  } else if (state.kind === "unknown") {
    log.warn(
      "coding-friend in Devin's lock.json has an unrecognized shape — removing it before install.",
    );
  }

  if (replaceNeeded) {
    removeInstalledPlugin(state.kind);
  }

  const installArgs = installArgsFor(desired);
  log.step(
    `Installing Devin plugin (${desired.kind === "local" ? "local" : "github"} source)...`,
  );
  if (run("devin", installArgs) === null) {
    throw new Error(
      `Devin plugin install failed. Restore it manually: devin ${installArgs.join(" ")}`,
    );
  }
  return replaceNeeded ? "replaced" : "installed";
}

/** Remove the plugin entirely (uninstall path), flag matching detected kind. */
export function removeDevinPlugin(): void {
  const state = readDevinInstallState();
  if (state.kind === "none") return;
  removeInstalledPlugin(state.kind);
  if (devinInstallCount() > 0) {
    log.warn(
      "coding-friend still appears in Devin's lock.json — remove the remaining install(s) with `devin plugins remove`.",
    );
  }
}

/** True when lock.json has a coding-friend entry of any shape. */
export function isDevinPluginInstalled(): boolean {
  return readDevinInstallState().kind !== "none";
}

/** Installed plugin version from lock.json's version_dir, or null. */
export function readDevinPluginVersion(): string | null {
  return readDevinInstallState().version ?? null;
}

// ─── User-scope MCP config (~/.config/devin/mcp_config.json) ─────────
//
// Spec S6: the file is {"mcpServers":{…}}; existing entries may use the
// HTTP `serverUrl` form — stdio entries write `command`/`args`/`env`.
// Entries we do not own are preserved verbatim on every write.

export interface DevinMcpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** HTTP/SSE form used by Devin's own entries. */
  serverUrl?: string;
}

export interface DevinMcpJson {
  mcpServers: Record<string, DevinMcpServer>;
}

/**
 * Write JSON via temp+rename so a crash never leaves a torn config file.
 * Follows symlinks (rename would otherwise replace the link itself), keeps
 * the existing file's mode, and defaults to 0600 — mcp_config.json routinely
 * holds API keys in env blocks.
 */
function writeMcpConfigAtomic(
  filePath: string,
  data: Record<string, unknown>,
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const target = existsSync(filePath) ? realpathSync(filePath) : filePath;
  const tmp = `${target}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    chmodSync(tmp, existsSync(target) ? statSync(target).mode & 0o777 : 0o600);
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Tolerant read of ~/.config/devin/mcp_config.json. Missing, unparseable, or
 * a file without an mcpServers object → null (never throws).
 */
export function readDevinMcpConfig(): DevinMcpJson | null {
  const data = readJson<Record<string, unknown>>(devinMcpConfigPath());
  if (!data || !isPlainObject(data.mcpServers)) return null;
  return data as unknown as DevinMcpJson;
}

/**
 * Read the raw mcp_config.json, distinguishing three file states that
 * readJson() conflates: absent → null (fine to create); corrupt → null (safe
 * to replace, we hold no secrets of ours there); exists-but-unreadable →
 * throw, because silently replacing would destroy valid entries we could
 * not see.
 */
function readMcpConfigForUpdate(
  filePath: string,
): Record<string, unknown> | null {
  const data = readJson<Record<string, unknown>>(filePath);
  if (data === null && existsSync(filePath)) {
    try {
      readFileSync(filePath, "utf-8");
    } catch {
      throw new Error(
        `${filePath} exists but cannot be read — fix its permissions or remove it manually; refusing to replace a config we cannot see.`,
      );
    }
  }
  return data;
}

/** Upsert one mcpServers entry, preserving all other entries and top keys. */
export function writeDevinMcpEntry(
  name: string,
  server: DevinMcpServer,
): void {
  const filePath = devinMcpConfigPath();
  const existing = readMcpConfigForUpdate(filePath);
  const data: Record<string, unknown> = isPlainObject(existing)
    ? { ...existing }
    : {};
  const mcpServers: Record<string, DevinMcpServer> = isPlainObject(
    data.mcpServers,
  )
    ? { ...(data.mcpServers as Record<string, DevinMcpServer>) }
    : {};
  mcpServers[name] = server;
  data.mcpServers = mcpServers;
  writeMcpConfigAtomic(filePath, data);
}

/** Remove one mcpServers entry; no-op when the file or entry is absent. */
export function removeDevinMcpEntry(name: string): void {
  const filePath = devinMcpConfigPath();
  const existing = readMcpConfigForUpdate(filePath);
  if (!existing || !isPlainObject(existing.mcpServers)) return;
  const mcpServers = {
    ...(existing.mcpServers as Record<string, DevinMcpServer>),
  };
  if (!(name in mcpServers)) return;
  delete mcpServers[name];
  writeMcpConfigAtomic(filePath, { ...existing, mcpServers });
}

/**
 * True when ~/.claude.json registers `name` under mcpServers. Devin imports
 * Claude's user MCPs by default — a server already defined there reaches
 * Devin, and writing the same name into mcp_config.json would create a
 * duplicate-name entry (S6: dedup by name, first source wins).
 */
export function claudeJsonHasMcpServer(name: string): boolean {
  const data = readJson<Record<string, unknown>>(claudeJsonPath());
  return isPlainObject(data?.mcpServers) && name in data.mcpServers;
}
