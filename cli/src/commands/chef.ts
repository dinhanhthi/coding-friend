import { randomUUID } from "crypto";
import {
  accessSync,
  constants as fsc,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
} from "fs";
import { tmpdir } from "os";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "path";
import { loadConfig } from "../lib/config.js";
import { run as exec } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { isTerminalState } from "../lib/orchestrator/chef-actions.js";
import {
  ChefGitError,
  computeFingerprint,
  readStartConfig,
  readSymbolicHead,
  resolveBranchHead,
  snapshotRepoGuard,
  snapshotSteering,
  type ChefFingerprint,
  type GitCtx,
} from "../lib/orchestrator/chef-git.js";
import {
  chefStatus,
  claimChefCheckout,
  createChef,
  listAsks,
  listChefs,
  listChefTasks,
  listCommits,
  listDecisions,
  listMessages,
  listPauses,
  listResumes,
  listWakes,
  readChef,
  recordEvent,
  recordMessage,
  recordResume,
  recordStop,
  releaseChefCheckout,
  type ChefAsk,
  type ChefCommitRecord,
  type ChefDecision,
  type ChefLimits,
  type ChefRecord,
  type ChefStatus,
} from "../lib/orchestrator/chef-store.js";
import {
  chefGitCtx,
  runWake,
  updateChefSummary,
} from "../lib/orchestrator/chef-wake.js";
import { assertStoreOutsideCheckout } from "../lib/orchestrator/dispatch.js";
import {
  claudeFlagsError,
  claudeVersionError,
  codexChefVersionError,
} from "../lib/orchestrator/providers/chef.js";
import { resolveTaskPolicy } from "../lib/orchestrator/quota.js";
import {
  isOlderThan,
  isPidAlive,
  MAX_TEXT,
  newId,
  readRegularFile,
  readTask,
  SPAWN_GRACE_MS,
  type Provider,
  type TaskState,
} from "../lib/orchestrator/store.js";
import {
  isWakeCommand,
  readHeartbeat,
} from "../lib/orchestrator/supervisor.js";
import { sanitize } from "./task.js";

/**
 * `cf chef`: start a chef for one plan on one checkout, talk to it, read
 * its state and stop/resume it. Wakes themselves run detached
 * (`cf chef _wake`, spawned by the supervisor tick).
 */

interface Flags {
  json?: boolean;
}

interface StartFlags extends Flags {
  provider?: string;
  /** false with --no-commit (commander's negatable option). */
  commit?: boolean;
}

/** `chef.*` defaults ("moderate"), applied when the config leaves a key unset. */
const DEFAULT_LIMITS: ChefLimits = {
  minWakeMinutes: 5,
  maxWakesPerDay: 48,
  maxTasksPerWake: 3,
  maxConcurrentTasks: 2,
  schedule: [],
  notify: true,
};

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

function oneLine(text: unknown, max: number): string {
  return sanitize(String(text ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Multi-line text indented under a label. */
function indented(text: unknown): string {
  return sanitize(String(text ?? "")).replace(/\n/g, "\n    ");
}

/** `p` is `root` or below it (both absolute). */
function isInside(root: string, p: string): boolean {
  const rel = relative(root, p);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function realNative(p: string): string {
  return realpathSync.native(p);
}

// ─── start: checks ──────────────────────────────────────────────────────

/**
 * The checkout root, found in Node without spawning git (a hostile repo
 * config could steer it): the realpath of the cwd or the nearest ancestor
 * holding a `.git` entry of any kind (pinGitDir validates it).
 */
function findCheckoutRoot(): string {
  let d = realNative(process.cwd());
  for (;;) {
    try {
      lstatSync(join(d, ".git"));
      return d;
    } catch {
      // not here
    }
    const parent = dirname(d);
    if (parent === d) {
      throw new CliError(
        "USAGE",
        "cf chef start must run inside a git checkout",
      );
    }
    d = parent;
  }
}

/**
 * The checkout's git dir, read in Node from its `.git` entry (a directory,
 * or a linked worktree's `gitdir:` file), as a realpath. Git never runs to
 * find it.
 */
function pinGitDir(checkout: string): string {
  const dotGit = join(checkout, ".git");
  let st;
  try {
    st = lstatSync(dotGit);
  } catch {
    throw new CliError("USAGE", `${checkout} has no .git entry`);
  }
  let dir: string;
  if (st.isDirectory()) {
    dir = dotGit;
  } else if (st.isFile()) {
    const bytes = readRegularFile(dotGit, 64 * 1024);
    const m = bytes && /^gitdir: *(.+?)\s*$/m.exec(bytes.toString("utf-8"));
    if (!m) throw new CliError("USAGE", `${dotGit} is not a gitdir file`);
    dir = resolve(checkout, m[1]);
  } else {
    throw new CliError("USAGE", `${dotGit} is a symlink or special file`);
  }
  let real: string;
  try {
    real = realNative(dir);
  } catch {
    throw new CliError("USAGE", `git dir ${dir} does not exist`);
  }
  if (!lstatSync(real).isDirectory()) {
    throw new CliError("USAGE", `git dir ${real} is not a directory`);
  }
  return real;
}

/** PATH entries; refuses an empty or relative entry (cwd-dependent lookup). */
function pathEntries(): string[] {
  const entries = (process.env.PATH ?? "").split(delimiter);
  const bad = entries.find((e) => !isAbsolute(e));
  if (bad !== undefined) {
    throw new CliError(
      "USAGE",
      `PATH has a relative entry (${JSON.stringify(bad)}): remove it before starting a chef`,
    );
  }
  return entries;
}

/** First executable regular file `name` on PATH (absolute), else undefined. */
function findBinary(name: string, entries: string[]): string | undefined {
  for (const dir of entries) {
    const p = join(dir, name);
    try {
      accessSync(p, fsc.X_OK);
      if (statSync(p).isFile()) return p;
    } catch {
      // not here
    }
  }
  return undefined;
}

/**
 * Absolute git/claude/codex from PATH: git and the chef's provider are
 * required; none may live inside the checkout (by path or realpath), where
 * a writer task could replace it.
 */
function resolveBinaries(
  checkout: string,
  provider: Provider,
): ChefRecord["binaries"] {
  const entries = pathEntries();
  const found: Partial<Record<"git" | Provider, string>> = {};
  for (const name of ["git", "claude", "codex"] as const) {
    const p = findBinary(name, entries);
    if (!p) continue;
    let real = p;
    try {
      real = realNative(p);
    } catch {
      // keep p
    }
    if (isInside(checkout, p) || isInside(checkout, real)) {
      throw new CliError(
        "USAGE",
        `${name} resolves inside the checkout (${real}): a task could replace it`,
      );
    }
    found[name] = p;
  }
  for (const name of ["git", provider] as const) {
    if (!found[name]) {
      throw new CliError("PROVIDER_UNAVAILABLE", `${name} not found on PATH`);
    }
  }
  return { ...found, git: found.git! };
}

/** Too old or missing flags: the chef's provider cannot run a chef. */
function assertProviderReady(
  provider: Provider,
  bin: string,
  cwd: string,
): void {
  const error =
    provider === "claude"
      ? (claudeVersionError(bin, cwd) ?? claudeFlagsError(bin, cwd))
      : codexChefVersionError(bin, cwd);
  if (error) throw new CliError("PROVIDER_UNAVAILABLE", error);
}

/** Plan dir realpath, strictly inside the checkout. */
function resolvePlanDir(arg: string, checkout: string): string {
  const abs = resolve(process.cwd(), arg);
  let real: string;
  try {
    real = realNative(abs);
  } catch {
    throw new CliError("NOT_FOUND", `Plan dir ${abs} does not exist`);
  }
  if (!statSync(real).isDirectory()) {
    throw new CliError("USAGE", `Plan dir ${real} is not a directory`);
  }
  if (real === checkout || !isInside(checkout, real)) {
    throw new CliError(
      "USAGE",
      `Plan dir ${real} must be inside the checkout ${checkout}`,
    );
  }
  return real;
}

function chefLimits(config: ReturnType<typeof loadConfig>): ChefLimits {
  const c = config.chef ?? {};
  return {
    minWakeMinutes: c.minWakeMinutes ?? DEFAULT_LIMITS.minWakeMinutes,
    maxWakesPerDay: c.maxWakesPerDay ?? DEFAULT_LIMITS.maxWakesPerDay,
    maxTasksPerWake: c.maxTasksPerWake ?? DEFAULT_LIMITS.maxTasksPerWake,
    maxConcurrentTasks:
      c.maxConcurrentTasks ?? DEFAULT_LIMITS.maxConcurrentTasks,
    // A dropped invalid entry can leave a hole (sparse array).
    schedule: (c.schedule ?? []).filter((s) => typeof s === "string"),
    notify: c.notify ?? DEFAULT_LIMITS.notify,
  };
}

/** A ChefGitError (over cap, plan dir, git failure) as a start/resume refusal. */
function refuseGit<T>(what: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ChefGitError) {
      throw new CliError(err.code, `${what}: ${err.message}`);
    }
    throw err;
  }
}

/** No supervisor tick within 3 minutes (it runs every 60 s), or none ever. */
function supervisorIsStale(): boolean {
  const at = readHeartbeat();
  return at === undefined || isOlderThan(at, 3 * 60 * 1000);
}

function tryUpdateSummary(): void {
  try {
    updateChefSummary();
  } catch (err) {
    log.warn(`Could not update chefs/summary.json: ${(err as Error).message}`);
  }
}

// ─── start ──────────────────────────────────────────────────────────────

export interface ChefStartResult {
  chefId: string;
  provider: Provider;
  checkout: string;
  planDir: string;
  branch: string;
  headAtStart: string;
  commit: boolean;
  warnings: string[];
  hint?: string;
}

function startChef(planArg: string, opts: StartFlags): ChefStartResult {
  const provider = opts.provider;
  if (provider !== "claude" && provider !== "codex") {
    throw new CliError("USAGE", "--provider must be claude or codex");
  }
  if (process.platform === "win32") {
    throw new CliError(
      "PROVIDER_UNAVAILABLE",
      "Chefs are not available on native Windows",
    );
  }
  pathEntries();
  const checkout = findCheckoutRoot();
  const gitDir = pinGitDir(checkout);
  assertStoreOutsideCheckout(checkout);
  const planDir = resolvePlanDir(planArg, checkout);
  const binaries = resolveBinaries(checkout, provider);
  // Before anything is created: a config error leaves no chef behind.
  const config = loadConfig();
  const taskPolicy = resolveTaskPolicy(config);
  const limits = chefLimits(config);
  const commit = opts.commit !== false && config.chef?.commit !== false;

  // The chef does not exist yet: a temp neutral cwd and empty hooks dir.
  const tmp = realNative(mkdtempSync(join(tmpdir(), "cf-chef-start-")));
  try {
    if (isInside(checkout, tmp)) {
      throw new CliError("USAGE", `TMPDIR ${tmp} is inside the checkout`);
    }
    const hooksDir = join(tmp, "hooks");
    mkdirSync(hooksDir, { mode: 0o700 });
    assertProviderReady(provider, binaries[provider]!, tmp);
    const ctx: GitCtx = {
      gitBin: binaries.git,
      gitDir,
      checkout,
      hooksDir,
      neutralCwd: tmp,
    };
    const baseline = refuseGit("Cannot start a chef", () =>
      readBaseline(ctx, planDir),
    );
    const { branch, head, facts, fingerprint, snapshot } = baseline;
    const changed = Object.keys(fingerprint.changed ?? {});
    const skipped = fingerprint.skipped ?? [];
    if (changed.length || skipped.length) {
      const sample = [...changed, ...skipped].slice(0, 5).join(", ");
      throw new CliError(
        "USAGE",
        `The checkout is not clean (${changed.length} changed, ${skipped.length} skipped: ${sample}); commit or stash first`,
      );
    }
    if (facts.missingIdentity.length) {
      throw new CliError(
        "USAGE",
        `git identity missing for chef commits: ${facts.missingIdentity.join(", ")}; set user.name and user.email in your git config`,
      );
    }
    const warnings: string[] = [];
    if (facts.gpgSign) {
      warnings.push(
        "commit.gpgSign is true: chef commits will be refused (start with --no-commit to only dispatch tasks)",
      );
    }
    if (facts.filterDrivers.length) {
      warnings.push(
        `filter drivers configured (${facts.filterDrivers.join(", ")}): chef commits of paths using them will be refused (consider --no-commit)`,
      );
    }

    const id = newId();
    claimChefCheckout(checkout, id); // create-once: of two starts, one wins
    try {
      createChef({
        id,
        provider,
        planDir,
        checkout,
        isGitRepo: true,
        gitDir,
        branch,
        headAtStart: head,
        sessionUuid: randomUUID(),
        limits,
        taskPolicy,
        binaries,
        commit,
        hooks: { hooksPath: facts.hooksPath, files: facts.hookFiles },
        configDigest: snapshot.repo.config ?? "",
        baseline: { fingerprint, snapshot },
      });
    } catch (err) {
      releaseChefCheckout(checkout, id);
      throw err;
    }
    recordEvent(id, "start", "chef started");
    tryUpdateSummary();
    const result: ChefStartResult = {
      chefId: id,
      provider,
      checkout,
      planDir,
      branch,
      headAtStart: head,
      commit,
      warnings,
    };
    if (supervisorIsStale()) {
      result.hint =
        "No supervisor tick ran recently: install it with `cf supervisor install` so the chef wakes";
    }
    return result;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Branch, its sha, config facts, fingerprint and snapshot (start). */
function readBaseline(ctx: GitCtx, planDir: string) {
  const ref = readSymbolicHead(ctx);
  if (!ref?.startsWith("refs/heads/")) {
    throw new CliError(
      "USAGE",
      "HEAD is detached: check out a branch before starting a chef",
    );
  }
  const branch = ref.slice("refs/heads/".length);
  const head = resolveBranchHead(ctx, branch);
  const facts = readStartConfig(ctx);
  const fingerprint = computeFingerprint(ctx, head);
  const snapshot = {
    repo: snapshotRepoGuard(ctx),
    steering: snapshotSteering(ctx, planDir),
  };
  return { branch, head, facts, fingerprint, snapshot };
}

export async function chefStartCommand(
  planDir: string,
  opts: StartFlags,
): Promise<void> {
  await run(
    opts.json,
    () => startChef(planDir, opts),
    (r) => {
      log.success(`Started chef ${r.chefId} (${r.provider})`);
      console.log(`  plan:     ${r.planDir}`);
      console.log(`  checkout: ${r.checkout} (branch ${sanitize(r.branch)})`);
      console.log(`  commits:  ${r.commit ? "on" : "off (--no-commit)"}`);
      for (const w of r.warnings) log.warn(w);
      if (r.hint) log.info(r.hint);
      console.log(`  Follow it with: cf chef show ${r.chefId}`);
    },
  );
}

// ─── views ──────────────────────────────────────────────────────────────

function taskState(taskId: string): TaskState | "unknown" {
  try {
    return readTask(taskId).state;
  } catch {
    return "unknown";
  }
}

function runningTaskIds(id: string): string[] {
  return listChefTasks(id)
    .filter((t) => {
      const s = taskState(t.taskId);
      return s !== "unknown" && !isTerminalState(s);
    })
    .map((t) => t.taskId);
}

/** Chef questions not seen yet: after the latest resume or user message (as summary.json). */
function unseenAsks(id: string): ChefAsk[] {
  const seen = Math.max(
    0,
    listResumes(id).at(-1)?.seq ?? 0,
    listMessages(id).at(-1)?.seq ?? 0,
  );
  return listAsks(id).filter((a) => a.seq > seen);
}

export interface ChefStatusView {
  id: string;
  provider: Provider;
  state: ChefStatus["state"];
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

function statusView(chef: ChefRecord): ChefStatusView {
  const status = chefStatus(chef.id);
  const wakes = listWakes(chef.id);
  const last = wakes.at(-1);
  const view: ChefStatusView = {
    id: chef.id,
    provider: chef.provider,
    state: status.state,
    planDir: chef.planDir,
    checkout: chef.checkout,
    branch: chef.branch,
    commit: chef.commit,
    createdAt: chef.createdAt,
    wakes: wakes.length,
    runningTasks: runningTaskIds(chef.id),
    inbox: status.state === "stopped" ? 0 : unseenAsks(chef.id).length,
  };
  if (status.pause) view.reason = status.pause.reason;
  if (status.stop?.reason) view.reason = status.stop.reason;
  if (status.state === "quota-wait") view.resetsAt = status.resetsAt ?? null;
  if (last) {
    view.lastWake = { n: last.n };
    if (last.result) {
      view.lastWake.outcome = last.result.outcome;
      view.lastWake.finishedAt = last.result.finishedAt;
      if (last.result.error) view.lastWake.error = last.result.error;
    } else {
      view.lastWake.outcome = last.runner ? "running" : "claimed";
    }
  }
  return view;
}

function resetLabel(resetsAt: number | null | undefined): string {
  return typeof resetsAt === "number" && Number.isFinite(resetsAt)
    ? `resets ${new Date(resetsAt * 1000).toLocaleString()}`
    : "reset unknown";
}

function stateLabel(v: ChefStatusView): string {
  const s = sanitize(v.state);
  if (v.state === "quota-wait") return `${s} (${resetLabel(v.resetsAt)})`;
  if (v.reason) return `${s}: ${oneLine(v.reason, 120)}`;
  return s;
}

function printStatus(v: ChefStatusView): void {
  console.log(`Chef ${sanitize(v.id)}  ${stateLabel(v)}`);
  console.log(`  provider: ${sanitize(v.provider)}`);
  console.log(`  plan:     ${sanitize(v.planDir)}`);
  console.log(
    `  checkout: ${sanitize(v.checkout)} (branch ${sanitize(v.branch)})`,
  );
  console.log(`  commits:  ${v.commit ? "on" : "off"}`);
  const last = v.lastWake
    ? `, last #${v.lastWake.n} ${sanitize(v.lastWake.outcome ?? "")}`
    : "";
  console.log(`  wakes:    ${v.wakes}${last}`);
  if (v.lastWake?.error) {
    console.log(`  last error (untrusted): ${oneLine(v.lastWake.error, 200)}`);
  }
  if (v.runningTasks.length) {
    console.log(`  tasks:    ${v.runningTasks.map(sanitize).join(", ")}`);
  }
  if (v.inbox) console.log(`  inbox:    ${v.inbox} (cf chef inbox ${v.id})`);
}

export async function chefStatusCommand(
  id: string | undefined,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    (): ChefStatusView | ChefStatusView[] =>
      id ? statusView(readChef(id)) : listChefs().map(statusView),
    (data) => {
      const views = Array.isArray(data) ? data : [data];
      if (views.length === 0) {
        console.log("No chefs.");
        return;
      }
      views.forEach((v, i) => {
        if (i) console.log("");
        printStatus(v);
      });
    },
  );
}

// ─── inbox ──────────────────────────────────────────────────────────────

export interface InboxItem {
  chefId: string;
  kind: "ask" | "paused" | "quota";
  /** ask: the chef's question; paused: the pause reason. */
  text?: string;
  seq?: number;
  wake?: number;
  resetsAt?: number | null;
  createdAt?: string;
}

function inboxOf(chef: ChefRecord): InboxItem[] {
  const status = chefStatus(chef.id);
  if (status.state === "stopped") return [];
  const items: InboxItem[] = unseenAsks(chef.id).map((a) => ({
    chefId: chef.id,
    kind: "ask",
    text: a.question,
    seq: a.seq,
    wake: a.wake,
    createdAt: a.createdAt,
  }));
  if (status.state === "paused" && status.pause) {
    const p = status.pause;
    const item: InboxItem = {
      chefId: chef.id,
      kind: "paused",
      text: p.reason,
      seq: p.seq,
      createdAt: p.createdAt,
    };
    if (p.wake !== undefined) item.wake = p.wake;
    items.push(item);
  }
  if (status.state === "quota-wait") {
    items.push({
      chefId: chef.id,
      kind: "quota",
      resetsAt: status.resetsAt ?? null,
    });
  }
  return items;
}

export async function chefInboxCommand(
  id: string | undefined,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => (id ? [readChef(id)] : listChefs()).flatMap(inboxOf),
    (items) => {
      if (items.length === 0) {
        console.log("Inbox is empty.");
        return;
      }
      for (const it of items) {
        const chef = sanitize(it.chefId);
        if (it.kind === "ask") {
          console.log(`${chef}  question (untrusted chef text):`);
          console.log(`    ${indented(it.text)}`);
          console.log(`    answer with: cf chef say ${chef} "<answer>"`);
        } else if (it.kind === "paused") {
          console.log(`${chef}  paused: ${indented(it.text)}`);
          console.log(`    resume with: cf chef resume ${chef}`);
        } else {
          console.log(
            `${chef}  waiting for its own quota (${sanitize(resetLabel(it.resetsAt))})`,
          );
        }
      }
    },
  );
}

// ─── show ───────────────────────────────────────────────────────────────

export interface ChefShowView {
  chef: Omit<ChefRecord, "baseline">;
  status: ChefStatusView;
  wakes: {
    n: number;
    outcome?: string;
    error?: string;
    consumed?: string[];
    rejected?: number;
    pause?: string;
  }[];
  tasks: {
    taskId: string;
    role: string;
    wake: number;
    dispatchSeq: number;
    state: string;
  }[];
  decisions: ChefDecision[];
  commits: ChefCommitRecord[];
  asks: ChefAsk[];
  messages: { seq: number; text: string; createdAt: string }[];
  pauses: { seq: number; reason: string; wake?: number; createdAt: string }[];
  resumes: {
    seq: number;
    knownHead: string;
    afterWake: number;
    createdAt: string;
  }[];
}

function showView(id: string): ChefShowView {
  const record = readChef(id);
  const { baseline: _baseline, ...chef } = record;
  void _baseline; // fingerprints are large and internal
  return {
    chef,
    status: statusView(record),
    wakes: listWakes(id).map((w) => {
      const v: ChefShowView["wakes"][number] = { n: w.n };
      if (w.result) {
        v.outcome = w.result.outcome;
        if (w.result.error) v.error = w.result.error;
        if (w.result.consumed) v.consumed = w.result.consumed;
        if (w.result.rejected !== undefined) v.rejected = w.result.rejected;
      } else {
        v.outcome = w.runner ? "running" : "claimed";
      }
      if (w.pause) v.pause = w.pause.reason;
      return v;
    }),
    tasks: listChefTasks(id).map((t) => ({
      taskId: t.taskId,
      role: t.role,
      wake: t.wake,
      dispatchSeq: t.dispatchSeq,
      state: taskState(t.taskId),
    })),
    decisions: listDecisions(id),
    commits: listCommits(id),
    asks: listAsks(id),
    messages: listMessages(id).map(({ seq, text, createdAt }) => ({
      seq,
      text,
      createdAt,
    })),
    pauses: listPauses(id).map(({ seq, reason, wake, createdAt }) => ({
      seq,
      reason,
      createdAt,
      ...(wake !== undefined && { wake }),
    })),
    resumes: listResumes(id).map(
      ({ seq, knownHead, afterWake, createdAt }) => ({
        seq,
        knownHead,
        afterWake,
        createdAt,
      }),
    ),
  };
}

/** Text of a decision's action (note/ask/pause text, commit message). */
function actionText(action: unknown): string {
  if (!action || typeof action !== "object") return "";
  const a = action as Record<string, unknown>;
  if (typeof a.text === "string") return a.text;
  if (typeof a.message === "string") return a.message;
  return "";
}

const SHOW_DECISIONS = 20;

function printShow(v: ChefShowView): void {
  printStatus(v.status);
  const notes = v.decisions.filter(
    (d) => d.kind === "note" && d.status === "executed",
  );
  const lines: string[] = [];
  for (const d of notes) {
    lines.push(`  #${d.wake} note: ${indented(actionText(d.action))}`);
  }
  for (const d of v.decisions.slice(-SHOW_DECISIONS)) {
    if (d.kind === "note") continue;
    const parts = [
      `#${d.wake}.${d.index}`,
      sanitize(d.kind),
      sanitize(d.status),
    ];
    if (d.taskId) parts.push(`task ${sanitize(d.taskId)}`);
    if (d.reason) parts.push(`(${oneLine(d.reason, 160)})`);
    const text = oneLine(actionText(d.action), 160);
    if (text) parts.push(`: ${text}`);
    lines.push(`  ${parts.join(" ")}`);
  }
  for (const c of v.commits) {
    const sha = c.head ? ` ${sanitize(c.head.slice(0, 12))}` : "";
    const why = c.reason ? ` (${oneLine(c.reason, 160)})` : "";
    lines.push(
      `  commit #${c.wake} ${sanitize(c.outcome)}${sha}: ${oneLine(c.message, 100)}${why}`,
    );
  }
  for (const a of v.asks) {
    lines.push(`  question #${a.wake}: ${indented(a.question)}`);
  }
  for (const w of v.wakes) {
    if (w.error) lines.push(`  wake #${w.n} error: ${oneLine(w.error, 200)}`);
  }
  if (lines.length) {
    console.log("chef activity (untrusted chef/worker text):");
    for (const l of lines) console.log(l);
  }
  if (v.tasks.length) {
    console.log("tasks:");
    for (const t of v.tasks) {
      console.log(
        `  ${sanitize(t.taskId)}  ${sanitize(t.role)}  wake ${t.wake}  ${sanitize(t.state)}`,
      );
    }
  }
}

export async function chefShowCommand(id: string, opts: Flags): Promise<void> {
  await run(opts.json, () => showView(id), printShow);
}

// ─── say ────────────────────────────────────────────────────────────────

export async function chefSayCommand(
  id: string,
  message: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      if (typeof message !== "string" || !message.trim()) {
        throw new CliError("USAGE", "Message is empty");
      }
      readChef(id);
      if (chefStatus(id).state === "stopped") {
        throw new CliError("ALREADY_FINISHED", `Chef ${id} is stopped`);
      }
      const m = recordMessage(id, message);
      tryUpdateSummary();
      return { chefId: id, seq: m.seq, truncated: message.length > MAX_TEXT };
    },
    (r) => {
      log.success(
        `Message ${r.seq} sent to chef ${r.chefId}; it wakes at a coming tick${r.truncated ? ` (truncated to ${MAX_TEXT} characters)` : ""}`,
      );
    },
  );
}

// ─── stop ───────────────────────────────────────────────────────────────

export async function chefStopCommand(id: string, opts: Flags): Promise<void> {
  await run(
    opts.json,
    () => {
      const chef = readChef(id);
      const stopped = recordStop(id, { reason: "stopped by cf chef stop" });
      // Idempotent: a second stop still frees the checkout.
      releaseChefCheckout(chef.checkout, id);
      tryUpdateSummary();
      if (!stopped) {
        throw new CliError("ALREADY_FINISHED", `Chef ${id} already stopped`);
      }
      return { chefId: id, stopped, runningTasks: runningTaskIds(id) };
    },
    (r) => {
      log.success(`Stopped chef ${r.chefId}`);
      for (const t of r.runningTasks) {
        console.log(
          `  task ${sanitize(t)} keeps running: cf task cancel ${sanitize(t)}`,
        );
      }
    },
  );
}

// ─── resume ─────────────────────────────────────────────────────────────

/** `ps -o command=` of `pid` (null when there is no such process). */
function psCommand(pid: number): string | null {
  return exec("/bin/ps", ["-ww", "-o", "command=", "-p", String(pid)]);
}

/**
 * Wake n of chef `id` still in progress: its runner is alive (same `ps`
 * check as the tick, result.json or not: an ok wake executes after it), or
 * it was claimed moments ago and its runner has not started yet.
 */
function liveWake(id: string): number | undefined {
  for (const w of listWakes(id).reverse()) {
    if (w.runner) {
      const pid = w.runner.pid;
      if (
        Number.isInteger(pid) &&
        pid > 1 &&
        isPidAlive(pid) &&
        isWakeCommand(psCommand(pid), id, w.n)
      ) {
        return w.n;
      }
    } else if (!w.result && !isOlderThan(w.claim.createdAt, SPAWN_GRACE_MS)) {
      return w.n;
    }
  }
  return undefined;
}

export interface ChefResumeResult {
  chefId: string;
  seq: number;
  knownHead: string;
  afterWake: number;
  changedPaths: number;
}

function resumeChef(id: string): ChefResumeResult {
  const chef = readChef(id);
  const state = chefStatus(id).state;
  if (state === "stopped") {
    throw new CliError("ALREADY_FINISHED", `Chef ${id} is stopped`);
  }
  // A tick skips a paused chef: no wake can start on the old baseline
  // while the new one is computed.
  if (state !== "paused") {
    throw new CliError("USAGE", `Chef ${id} is not paused: nothing to resume`);
  }
  const wake = liveWake(id);
  if (wake !== undefined) {
    throw new CliError(
      "LEASE_HELD",
      `Wake ${wake} of chef ${id} is still running: resume after it ends`,
    );
  }
  const ctx = chefGitCtx(chef);
  const baseline = refuseGit("Cannot resume the chef", () => {
    const ref = readSymbolicHead(ctx);
    if (ref !== `refs/heads/${chef.branch}`) {
      throw new CliError(
        "USAGE",
        `HEAD is ${ref ? `on ${ref.replace(/^refs\/heads\//, "")}` : "detached"}, not on the chef's branch ${chef.branch}: check out ${chef.branch} before resuming`,
      );
    }
    const head = resolveBranchHead(ctx, chef.branch);
    const fingerprint: ChefFingerprint = computeFingerprint(ctx, head);
    const snapshot = {
      repo: snapshotRepoGuard(ctx),
      steering: snapshotSteering(ctx, chef.planDir),
    };
    return { head, fingerprint, snapshot };
  });
  const resume = recordResume(id, {
    knownHead: baseline.head,
    fingerprint: baseline.fingerprint,
    snapshot: baseline.snapshot,
  });
  tryUpdateSummary();
  return {
    chefId: id,
    seq: resume.seq,
    knownHead: resume.knownHead,
    afterWake: resume.afterWake,
    changedPaths: Object.keys(baseline.fingerprint.changed ?? {}).length,
  };
}

export async function chefResumeCommand(
  id: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => resumeChef(id),
    (r) => {
      log.success(
        `Resumed chef ${r.chefId} at ${r.knownHead.slice(0, 12)}${r.changedPaths ? ` (${r.changedPaths} uncommitted paths in the new baseline)` : ""}`,
      );
    },
  );
}

// ─── _wake ──────────────────────────────────────────────────────────────

/**
 * Hidden `cf chef _wake <id> <n>`: the detached wake runner. Without
 * CF_CHEF_CLAIMED, runWake claims wake n first (a lost claim exits).
 */
export async function chefWakeCommand(id: string, n: string): Promise<void> {
  if (!/^[1-9]\d{0,8}$/.test(String(n))) {
    console.error(`Invalid wake number: ${JSON.stringify(String(n))}`);
    process.exitCode = 1;
    return;
  }
  try {
    const r = await runWake(id, Number(n));
    console.log(
      `wake ${n}: ${r.outcome}${r.reason ? ` (${oneLine(r.reason, 300)})` : ""}`,
    );
  } catch (err) {
    console.error(`wake ${n}: ${oneLine((err as Error).message, 300)}`);
    process.exitCode = 1;
  }
}
