import { readGlobalChefEnabled } from "../config.js";
import { notifyUser, type NotifyResult } from "../notify.js";
import { CliError } from "../output.js";
import type {
  ChefAction,
  RejectedAction,
  ValidationResult,
} from "./chef-actions.js";
import {
  ChefGitError,
  commitPaths,
  computeFingerprint,
  fingerprintEquals,
  type ChefFingerprint,
  type GitCtx,
  type SteeringSpec,
} from "./chef-git.js";
import {
  chefStatus,
  listDecisions,
  nextSeq,
  readKnownHead,
  recordAsk,
  recordCommit,
  recordDecision,
  recordEvent,
  recordFingerprint,
  recordPause,
  recordTaskRole,
  recordWakePause,
  type ChefRecord,
} from "./chef-store.js";
import { dispatchTask, type DispatchInput } from "./dispatch.js";
import { acquireLease, releaseLease } from "./lease.js";
import { MAX_TEXT, reply } from "./store.js";

/**
 * Executors of the chef's accepted actions (C2b task 3.6). The wake (3.7)
 * validates first; this runs each accepted action in order and records one
 * decision per action (accepted or rejected) in `decisions/<seq>.json`,
 * which is also where per-action execution state lives (never result.json).
 *
 * Before every dispatch and commit the global switch (`chef.enabled` from
 * the global config only), `stop.json` and the pause state are re-read: a
 * chef switched off, stopped or paused mid-wake skips the action.
 *
 * Every external effect goes through `ChefExecDeps` (real defaults).
 */

/**
 * Fixed CF line before every prompt a chef dispatches: workers never commit
 * (CF does, behind the commit gate) and never edit the plan folder.
 */
export function chefTaskPreamble(planDir: string): string {
  return `[Coding Friend] This task was dispatched by a chef. Do not run git commit, git add or any other git command that changes the repository (Coding Friend commits reviewed changes itself), and do not edit the plan folder ${JSON.stringify(planDir)}.`;
}

/** Chars of a string kept in a decision's `action` copy (a note's full text). */
const DECISION_STRING_CAP = MAX_TEXT;
/** Items of an array kept in a decision's `action` copy. */
const DECISION_ARRAY_CAP = 50;
/** Keys of an object kept in a decision's `action` copy. */
const DECISION_KEYS_CAP = 20;

export interface ChefExecDeps {
  /** `chef.enabled` from the global config (never the local one). */
  readEnabled: () => boolean;
  dispatchTask: (input: DispatchInput) => { taskId: string; pid: number };
  commitPaths: typeof commitPaths;
  computeFingerprint: (ctx: GitCtx, head: string) => ChefFingerprint;
  acquireLease: typeof acquireLease;
  releaseLease: typeof releaseLease;
  /** Answer a worker question the way `cf reply` does (create-once). */
  reply: (qid: string, text: string, taskId: string) => void;
  /** macOS notification (honours chef.notify); never throws. */
  notify: (title: string, message: string) => Promise<void>;
  /** One line into wakes/<n>/wake.log. */
  log: (line: string) => void;
}

/** Real defaults for every dep except notify/log (bound per wake). */
export function defaultExecDeps(
  chef: Pick<ChefRecord, "limits">,
  log: (line: string) => void,
  notify: typeof notifyUser = notifyUser,
): ChefExecDeps {
  return {
    readEnabled: readGlobalChefEnabled,
    dispatchTask,
    commitPaths,
    computeFingerprint: (ctx, head) => computeFingerprint(ctx, head),
    acquireLease,
    releaseLease,
    reply: (qid, text, taskId) => {
      reply(qid, text, taskId);
    },
    notify: boundNotify(chef, log, notify),
    log,
  };
}

/** notifyUser bound to chef.notify; errors go to the wake log. */
export function boundNotify(
  chef: Pick<ChefRecord, "limits">,
  log: (line: string) => void,
  notify: (opts: {
    title: string;
    message: string;
    enabled: boolean;
  }) => Promise<NotifyResult> = notifyUser,
): (title: string, message: string) => Promise<void> {
  return async (title, message) => {
    try {
      const r = await notify({
        title,
        message,
        enabled: chef.limits?.notify === true,
      });
      if (r.error) log(`notify failed: ${r.error}`);
    } catch (err) {
      log(`notify failed: ${errMsg(err)}`);
    }
  };
}

export interface ChefExecContext {
  chef: ChefRecord;
  /** Wake number. */
  wake: number;
  ctx: GitCtx;
  /** Fingerprint the validator's commit gate approved (null: not computed). */
  gateFingerprint: ChefFingerprint | null;
  /** Pending worker questions of this chef's tasks (qid → task). */
  pendingAsks: { qid: string; taskId: string }[];
  /** Aborted when the wake is terminated: remaining actions are skipped. */
  signal?: AbortSignal;
  deps: ChefExecDeps;
}

export interface ExecOutcome {
  index: number;
  type: string;
  status: string;
  reason?: string;
  taskId?: string;
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function steeringOf(chef: ChefRecord): SteeringSpec {
  return { planDir: chef.planDir, hooksPath: chef.hooks?.hooksPath ?? null };
}

/**
 * Pause chef `chef.id` from wake `wake`: pauses/<seq>.json, the wake's
 * informational pause.json (first reason only) and a notification.
 */
export async function pauseChef(
  chef: ChefRecord,
  wake: number,
  reason: string,
  deps: Pick<ChefExecDeps, "notify" | "log">,
): Promise<void> {
  recordPause(chef.id, { reason, wake });
  try {
    recordWakePause(chef.id, wake, { reason });
  } catch (err) {
    deps.log(`could not record wake pause: ${errMsg(err)}`);
  }
  deps.log(`paused: ${reason}`);
  await deps.notify(`Coding Friend chef ${chef.id} paused`, reason);
}

/** Bounded copy of an action for a decision record (never the full payload). */
export function capForDecision(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > DECISION_STRING_CAP
      ? `${value.slice(0, DECISION_STRING_CAP)}...`
      : value;
  }
  if (value === null || typeof value !== "object") {
    return typeof value === "number" || typeof value === "boolean"
      ? value
      : value === null
        ? null
        : undefined;
  }
  if (depth >= 3) return "[...]";
  if (Array.isArray(value)) {
    const items = value
      .slice(0, DECISION_ARRAY_CAP)
      .map((v) => capForDecision(v, depth + 1));
    if (value.length > DECISION_ARRAY_CAP) {
      items.push(`[${value.length - DECISION_ARRAY_CAP} more]`);
    }
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value).slice(0, DECISION_KEYS_CAP)) {
    out[k.slice(0, 64)] = capForDecision(
      (value as Record<string, unknown>)[k],
      depth + 1,
    );
  }
  return out;
}

/** Why dispatch/commit must be skipped now (switched off, stopped, paused). */
function skipReason(ec: ChefExecContext): string | null {
  if (ec.signal?.aborted) return "skipped: wake terminated";
  if (!ec.deps.readEnabled()) return "skipped: disabled";
  const state = chefStatus(ec.chef.id).state;
  if (state === "stopped") return "skipped: stopped";
  if (state === "paused") return "skipped: paused";
  return null;
}

// ─── executors ──────────────────────────────────────────────────────────

type Exec = Omit<ExecOutcome, "index" | "type">;

async function execDispatch(
  ec: ChefExecContext,
  action: Extract<ChefAction, { type: "dispatch" }>,
): Promise<Exec> {
  const { chef, deps } = ec;
  if (!action.prompt.trim())
    return { status: "failed", reason: "empty prompt" };
  if (action.provider !== "claude" && action.provider !== "codex") {
    return { status: "failed", reason: "invalid provider" };
  }
  // The worker starts changing files at once: fingerprint first.
  let before: ChefFingerprint;
  try {
    before = deps.computeFingerprint(ec.ctx, readKnownHead(chef.id));
  } catch (err) {
    const reason = `fingerprint before dispatch failed: ${errMsg(err)}`;
    await pauseChef(chef, ec.wake, reason, deps);
    return { status: "failed", reason };
  }
  const dispatchSeq = nextSeq(chef.id);
  let taskId: string;
  try {
    ({ taskId } = deps.dispatchTask({
      prompt: `${chefTaskPreamble(chef.planDir)}\n\n${action.prompt}`,
      provider: action.provider,
      readOnly: action.role === "other",
      checkout: chef.checkout,
      isGitRepo: chef.isGitRepo,
      policy: chef.taskPolicy,
    }));
  } catch (err) {
    return { status: "failed", reason: `dispatch failed: ${errMsg(err)}` };
  }
  recordTaskRole(chef.id, taskId, {
    role: action.role,
    wake: ec.wake,
    dispatchSeq,
  });
  recordFingerprint(chef.id, `before-${taskId}`, before);
  deps.log(`dispatched ${action.role} task ${taskId} (${action.provider})`);
  return { status: "executed", taskId };
}

/** Pause + inbox + notify after a commit that did not land as asked. */
async function commitProblem(
  ec: ChefExecContext,
  reason: string,
): Promise<void> {
  const { chef } = ec;
  recordAsk(chef.id, {
    wake: ec.wake,
    question: `Commit not made: ${reason}. Check the checkout, then run cf chef resume ${chef.id}.`,
  });
  await pauseChef(chef, ec.wake, `commit failed: ${reason}`, ec.deps);
}

async function execCommit(
  ec: ChefExecContext,
  action: Extract<ChefAction, { type: "commit" }>,
): Promise<Exec> {
  const { chef, deps, ctx } = ec;
  if (!ec.gateFingerprint) {
    return { status: "failed", reason: "no gate fingerprint" };
  }
  try {
    deps.acquireLease(chef.checkout, chef.id, "chef-commit");
  } catch (err) {
    // Someone writes the checkout: nothing to undo, the gate re-runs next wake.
    return { status: "failed", reason: `writer lease: ${errMsg(err)}` };
  }
  try {
    const expectedHead = readKnownHead(chef.id);
    const now = deps.computeFingerprint(ctx, expectedHead);
    if (!fingerprintEquals(now, ec.gateFingerprint)) {
      const reason =
        "working tree changed between the commit gate and the commit";
      recordCommit(chef.id, {
        wake: ec.wake,
        outcome: "failed",
        paths: action.paths,
        message: action.message,
        parent: expectedHead,
        reason,
      });
      await commitProblem(ec, reason);
      return { status: "failed", reason };
    }
    const r = deps.commitPaths({
      ctx,
      id: chef.id,
      n: ec.wake,
      paths: action.paths,
      message: action.message,
      expectedHead,
      branch: chef.branch,
      gateFingerprint: now,
      steering: steeringOf(chef),
    });
    if (r.kind === "committed" || r.kind === "committed-index-sync-failed") {
      // The commit landed either way: the known HEAD moves to it.
      const rec = recordCommit(chef.id, {
        wake: ec.wake,
        outcome: "committed",
        paths: r.paths,
        message: action.message,
        parent: r.parent,
        head: r.commit,
        ...(r.kind === "committed-index-sync-failed" && { reason: r.error }),
      });
      try {
        recordFingerprint(
          chef.id,
          `after-commit-${rec.seq}`,
          deps.computeFingerprint(ctx, r.commit),
        );
      } catch (err) {
        // Without this mark the next wake sees a change and pauses.
        deps.log(`after-commit fingerprint failed: ${errMsg(err)}`);
      }
      deps.log(`committed ${r.commit} (${r.paths.length} paths)`);
      if (r.kind === "committed-index-sync-failed") {
        const reason = `commit ${r.commit} created, index sync failed: ${r.error}`;
        await pauseChef(chef, ec.wake, reason, deps);
        return { status: "executed", reason };
      }
      // Nothing else wakes the chef after its last commit: this event lets
      // it plan the next step or report that the plan is done. The commit
      // landed: a failure here must not turn it into "Commit not made".
      try {
        recordEvent(
          chef.id,
          `committed-${rec.seq}`,
          `CF committed ${r.commit} (${r.paths.length} paths)`,
        );
      } catch (err) {
        deps.log(`committed event failed: ${errMsg(err)}`);
      }
      return { status: "executed" };
    }
    const reason =
      r.kind === "mismatch"
        ? `mismatch: ${r.reason}`
        : `refused: ${r.reasons.join("; ")}`;
    recordCommit(chef.id, {
      wake: ec.wake,
      outcome: r.kind === "refused" ? "refused" : "failed",
      paths: action.paths,
      message: action.message,
      parent: expectedHead,
      reason,
    });
    await commitProblem(ec, reason);
    return { status: "failed", reason };
  } catch (err) {
    // ChefGitError (INVALID planDir, OBJECT_MISMATCH, GIT_FAILED...) or store errors.
    const kind = err instanceof ChefGitError ? `${err.kind}: ` : "";
    const reason = `${kind}${errMsg(err)}`;
    try {
      recordCommit(chef.id, {
        wake: ec.wake,
        outcome: "failed",
        paths: action.paths,
        message: action.message,
        reason,
      });
    } catch (e) {
      deps.log(`could not record commit failure: ${errMsg(e)}`);
    }
    await commitProblem(ec, reason);
    return { status: "failed", reason };
  } finally {
    deps.releaseLease(chef.checkout, chef.id, "chef-commit");
  }
}

async function execOne(ec: ChefExecContext, action: ChefAction): Promise<Exec> {
  const { chef, deps } = ec;
  switch (action.type) {
    case "dispatch":
    case "commit": {
      const skip = skipReason(ec);
      if (skip) return { status: skip };
      return action.type === "dispatch"
        ? execDispatch(ec, action)
        : execCommit(ec, action);
    }
    case "answer": {
      const ask = ec.pendingAsks.find((a) => a.qid === action.qid);
      if (!ask) return { status: "failed", reason: "question not pending" };
      try {
        deps.reply(action.qid, action.text, ask.taskId);
      } catch (err) {
        return { status: "failed", reason: errMsg(err) };
      }
      return { status: "executed", taskId: ask.taskId };
    }
    case "ask_user": {
      recordAsk(chef.id, { wake: ec.wake, question: action.text });
      await deps.notify(`Coding Friend chef ${chef.id} asks`, action.text);
      return { status: "executed" };
    }
    case "pause": {
      await pauseChef(chef, ec.wake, `chef: ${action.text}`, deps);
      return { status: "executed" };
    }
    case "note":
      return { status: "executed" };
  }
}

/** Decision copy of an action: dispatch prompts live in the task, not here. */
function decisionAction(action: unknown): unknown {
  if (
    action &&
    typeof action === "object" &&
    (action as { type?: unknown }).type === "dispatch"
  ) {
    const { prompt, ...rest } = action as Record<string, unknown>;
    return capForDecision({
      ...rest,
      promptChars: typeof prompt === "string" ? prompt.length : null,
    });
  }
  return capForDecision(action);
}

function kindOf(action: unknown): string {
  const t = (action as { type?: unknown } | null)?.type;
  return typeof t === "string" ? t : "invalid";
}

/**
 * Record rejected actions, then run every accepted action in order, one
 * decision each. An action whose (wake, index) already has a decision is
 * never run again (defensive: a wake never re-runs, runner.json is
 * create-once). Never throws for one action: its failure is its decision.
 */
export async function executeActions(
  ec: ChefExecContext,
  validation: Pick<ValidationResult, "accepted" | "rejected">,
): Promise<ExecOutcome[]> {
  const { chef, wake, deps } = ec;
  const done = new Set(
    listDecisions(chef.id)
      .filter((d) => d.wake === wake)
      .map((d) => d.index),
  );
  const out: ExecOutcome[] = [];
  const decide = (index: number, action: unknown, r: Exec): void => {
    recordDecision(chef.id, {
      wake,
      index,
      kind: kindOf(action),
      status: r.status,
      ...(r.reason !== undefined && { reason: r.reason }),
      ...(r.taskId !== undefined && { taskId: r.taskId }),
      action: decisionAction(action),
    });
    done.add(index);
    out.push({ index, type: kindOf(action), ...r });
  };

  for (const rej of validation.rejected as RejectedAction[]) {
    if (done.has(rej.index)) continue;
    decide(rej.index, rej.action, { status: "rejected", reason: rej.reason });
  }
  const accepted = [...validation.accepted].sort((a, b) => a.index - b.index);
  for (const { index, action } of accepted) {
    if (done.has(index)) {
      deps.log(`action ${index} already has a decision: not run again`);
      continue;
    }
    let r: Exec;
    try {
      r = await execOne(ec, action);
    } catch (err) {
      r = {
        status: "failed",
        reason: err instanceof CliError ? err.message : errMsg(err),
      };
    }
    deps.log(
      `action ${index} ${action.type}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`,
    );
    decide(index, action, r);
  }
  return out;
}
