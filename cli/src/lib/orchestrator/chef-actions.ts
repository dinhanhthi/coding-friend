import { isAbsolute, relative, sep } from "path";
import { z } from "zod";
import {
  type ChefFingerprint,
  fingerprintEquals,
  type SteeringSpec,
  validateCommitMessage,
  validateCommitPath,
} from "./chef-git.js";
import type { ChefTaskRole } from "./chef-store.js";
import { MAX_TEXT, type Provider, type TaskState } from "./store.js";

/**
 * The chef's output contract and its validator.
 *
 * Two layers. The provider enforces CHEF_OUTPUT_SCHEMA (Claude
 * `--json-schema`, Codex `--output-schema`); `parseChefOutput` re-checks the
 * exact same shape with zod, and any violation rejects the whole output
 * (`schemaError`). Everything the flat schema cannot express (fields a type
 * needs, fields it must leave null, enums of nullable fields, caps) is a
 * per-action rejection in `validateActions`, so it reaches the next digest
 * and the rejected-wake streak.
 *
 * `validateActions` reads only its arguments and simulates the actions in
 * order (dispatch slots, one commit, a pause stopping later dispatch/commit).
 * The one exception is the default commit path check, `validateCommitPath`,
 * which realpaths/lstats parent dirs inside the checkout (read-only, no git);
 * tests inject `checkPath`.
 */

// ─── schema ─────────────────────────────────────────────────────────────

export const CHEF_ACTION_TYPES = [
  "dispatch",
  "answer",
  "ask_user",
  "commit",
  "pause",
  "note",
] as const;
export type ChefActionType = (typeof CHEF_ACTION_TYPES)[number];

const ACTION_FIELDS = [
  "type",
  "provider",
  "role",
  "prompt",
  "qid",
  "text",
  "paths",
  "message",
] as const;

/**
 * Strict JSON Schema of the chef's output: every property required, nullable
 * fields typed `["string","null"]`, `additionalProperties: false`, so both
 * Claude `--json-schema` and Codex `--output-schema` accept it. Only `type`
 * carries an `enum`; allowed provider/role values are in descriptions and
 * enforced by `validateActions`.
 */
export const CHEF_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "actions"],
  properties: {
    summary: {
      type: "string",
      description: "Short summary of what you decided this wake and why.",
    },
    actions: {
      type: "array",
      description: "Actions to take, in order. May be empty.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...ACTION_FIELDS],
        properties: {
          type: {
            type: "string",
            enum: [...CHEF_ACTION_TYPES],
            description:
              "dispatch: start a worker task. answer: answer a pending worker question. ask_user: ask the user. commit: commit paths. pause: pause the chef. note: record progress.",
          },
          provider: {
            type: ["string", "null"],
            description: 'dispatch only: "claude" or "codex". Otherwise null.',
          },
          role: {
            type: ["string", "null"],
            description:
              'dispatch only: "writer" (changes files), "check" (runs tests/build, must not change tracked files) or "other" (read-only). Otherwise null.',
          },
          prompt: {
            type: ["string", "null"],
            description: "dispatch only: the worker's task. Otherwise null.",
          },
          qid: {
            type: ["string", "null"],
            description:
              "answer only: id of the pending worker question. Otherwise null.",
          },
          text: {
            type: ["string", "null"],
            description:
              "answer: the answer. ask_user: the question. pause: the reason. note: the note. Otherwise null.",
          },
          paths: {
            type: ["array", "null"],
            items: { type: "string" },
            description:
              "commit only: checkout-relative paths to commit. Otherwise null.",
          },
          message: {
            type: ["string", "null"],
            description:
              "commit only: one-line commit message, at most 100 characters. Otherwise null.",
          },
        },
      },
    },
  },
} as const;

const nullableString = z.string().nullable();

/** zod mirror of CHEF_OUTPUT_SCHEMA (keep the two identical). */
const RawActionSchema = z.strictObject({
  type: z.enum(CHEF_ACTION_TYPES),
  provider: nullableString,
  role: nullableString,
  prompt: nullableString,
  qid: nullableString,
  text: nullableString,
  paths: z.array(z.string()).nullable(),
  message: nullableString,
});
export type RawChefAction = z.infer<typeof RawActionSchema>;

const RawOutputSchema = z.strictObject({
  summary: z.string(),
  actions: z.array(RawActionSchema),
});
export type RawChefOutput = z.infer<typeof RawOutputSchema>;

/** Parse provider output against the schema; any violation fails it all. */
export function parseChefOutput(
  raw: unknown,
): { ok: true; output: RawChefOutput } | { ok: false; error: string } {
  const r = RawOutputSchema.safeParse(raw);
  if (r.success) return { ok: true, output: r.data };
  const issue = r.error.issues[0];
  const where = issue?.path.length ? issue.path.join(".") : "output";
  return {
    ok: false,
    error: `output does not match the chef schema: ${where}: ${issue?.message ?? "invalid"}`,
  };
}

// ─── actions ────────────────────────────────────────────────────────────

export type ChefAction =
  | {
      type: "dispatch";
      provider: Provider;
      role: ChefTaskRole;
      prompt: string;
    }
  | { type: "answer"; qid: string; text: string }
  | { type: "ask_user"; text: string }
  | { type: "commit"; paths: string[]; message: string }
  | { type: "pause"; text: string }
  | { type: "note"; text: string };

/** Fields each type uses; every other field must be null. */
const USED_FIELDS: Record<ChefActionType, readonly string[]> = {
  dispatch: ["provider", "role", "prompt"],
  answer: ["qid", "text"],
  ask_user: ["text"],
  commit: ["paths", "message"],
  pause: ["text"],
  note: ["text"],
};

/** Caps (per action; over a cap rejects the action, never truncates). */
export const MAX_ACTIONS_PER_WAKE = 20;
export const MAX_PROMPT_CHARS = 32_000;
export const MAX_COMMIT_PATHS = 500;
export const MAX_SUMMARY_CHARS = 8_000;

const PROVIDER_VALUES: readonly Provider[] = ["claude", "codex"];
const ROLE_VALUES: readonly ChefTaskRole[] = ["writer", "check", "other"];

function nonEmpty(s: string | null): s is string {
  return typeof s === "string" && s.trim() !== "";
}

/** Shape a raw action into a ChefAction, or say why it cannot be one. */
function normalize(raw: RawChefAction): ChefAction | string {
  const used = USED_FIELDS[raw.type];
  for (const f of ACTION_FIELDS) {
    if (f === "type" || used.includes(f)) continue;
    if (raw[f] !== null) return `${raw.type}: ${f} must be null`;
  }
  switch (raw.type) {
    case "dispatch": {
      const provider = PROVIDER_VALUES.find((p) => p === raw.provider);
      if (!provider) return 'dispatch: provider must be "claude" or "codex"';
      const role = ROLE_VALUES.find((r) => r === raw.role);
      if (!role) return 'dispatch: role must be "writer", "check" or "other"';
      if (!nonEmpty(raw.prompt)) return "dispatch: empty prompt";
      if (raw.prompt.length > MAX_PROMPT_CHARS) {
        return `dispatch: prompt longer than ${MAX_PROMPT_CHARS} characters`;
      }
      return { type: "dispatch", provider, role, prompt: raw.prompt };
    }
    case "answer":
    case "ask_user":
    case "pause":
    case "note": {
      if (!nonEmpty(raw.text)) return `${raw.type}: empty text`;
      if (raw.text.length > MAX_TEXT) {
        return `${raw.type}: text longer than ${MAX_TEXT} characters`;
      }
      if (raw.type !== "answer") return { type: raw.type, text: raw.text };
      if (!nonEmpty(raw.qid)) return "answer: empty qid";
      return { type: "answer", qid: raw.qid, text: raw.text };
    }
    case "commit": {
      if (!raw.paths || raw.paths.length === 0) return "commit: no paths";
      if (raw.paths.length > MAX_COMMIT_PATHS) {
        return `commit: more than ${MAX_COMMIT_PATHS} paths`;
      }
      if (raw.message === null) return "commit: missing message";
      return { type: "commit", paths: raw.paths, message: raw.message };
    }
  }
}

// ─── facts ──────────────────────────────────────────────────────────────

/** A task this chef dispatched, as the wake sees it. */
export interface ChefFactsTask {
  taskId: string;
  role: ChefTaskRole;
  state: TaskState;
  /** seq allocated before dispatchTask (claim order, never clocks). */
  dispatchSeq: number;
  /** fingerprints/before-<tid> (null when missing). */
  before: ChefFingerprint | null;
  /** fingerprints/after-<tid> (null while the task runs or when missing). */
  after: ChefFingerprint | null;
}

/** Plain data snapshot the wake builds before validating (no fs, no git). */
export interface ChefFacts {
  chef: {
    /** realpath of the checkout. */
    checkout: string;
    /** chef.commit: commits allowed at all. */
    commit: boolean;
    /** Plan dir and recorded hooks dir (steering, see chef-git). */
    steering: SteeringSpec;
  };
  /** Every task of this chef (any order). */
  tasks: ChefFactsTask[];
  /** seq of the latest baseline (start = 0, or the latest resumes/<seq>.json). */
  baselineSeq: number;
  /**
   * Fingerprint of the working tree now, against the known HEAD; null when
   * the wake did not compute it (e.g. a writer/check task was still running).
   */
  currentFingerprint: ChefFingerprint | null;
  /** Unanswered `cf ask` questions of this chef's tasks. */
  pendingAsks: { qid: string; taskId: string }[];
  /**
   * Non-terminal tasks (queued, running, waiting, paused) holding a slot:
   * `tasks` counts all of them, `writers` those in writer mode (writer and
   * check), plus any other writer lease holder on the checkout the wake knows.
   */
  running: { tasks: number; writers: number };
  /** Wakes counted against maxWakesPerDay so far today (digest only). */
  wakesToday?: number;
}

export interface ValidateLimits {
  maxTasksPerWake: number;
  maxConcurrentTasks: number;
}

export interface AcceptedAction {
  /** Index in the output's actions array (ChefDecision.index). */
  index: number;
  action: ChefAction;
}

export interface RejectedAction {
  index: number;
  /** The normalized action, or the raw item when it could not be shaped. */
  action: unknown;
  reason: string;
}

export interface ValidationResult {
  /** Chef summary (capped), null when the output failed the schema. */
  summary: string | null;
  accepted: AcceptedAction[];
  rejected: RejectedAction[];
  /** Set when the output failed the schema: nothing was accepted. */
  schemaError?: string;
}

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);

export function isTerminalState(state: TaskState): boolean {
  return TERMINAL_STATES.has(state);
}

function isWriterMode(role: ChefTaskRole): boolean {
  return role === "writer" || role === "check";
}

/**
 * Decision 12: a check passes only when it succeeded and its fingerprint
 * after equals its fingerprint before (only ignored files changed).
 */
export function isPassingCheck(task: ChefFactsTask): boolean {
  return (
    task.role === "check" &&
    task.state === "succeeded" &&
    task.before !== null &&
    task.after !== null &&
    fingerprintEquals(task.before, task.after)
  );
}

/** The writer with the highest dispatchSeq, if any. */
function latestWriter(tasks: ChefFactsTask[]): ChefFactsTask | undefined {
  let best: ChefFactsTask | undefined;
  for (const t of tasks) {
    if (t.role === "writer" && (!best || t.dispatchSeq > best.dispatchSeq)) {
      best = t;
    }
  }
  return best;
}

/**
 * Path-independent part of the commit gate (decision 14), null when it
 * holds: chef.commit on; no writer/check task still running; the latest
 * writer succeeded and was dispatched after the latest baseline (by seq);
 * a passing check dispatched after that writer (by seq); the current
 * fingerprint equals the writer's after-fingerprint. The digest shows this
 * as "what is missing".
 */
export function commitGateProblem(facts: ChefFacts): string | null {
  if (!facts.chef.commit) return "commits are off for this chef (chef.commit)";
  const busy = facts.tasks.some(
    (t) => isWriterMode(t.role) && !isTerminalState(t.state),
  );
  if (busy || facts.running.writers > 0) {
    return "a writer or check task is still running";
  }
  const writer = latestWriter(facts.tasks);
  if (!writer) return "no writer task yet";
  if (writer.state !== "succeeded") {
    return `latest writer ${writer.taskId} did not succeed (${writer.state})`;
  }
  if (writer.dispatchSeq <= facts.baselineSeq) {
    return `latest writer ${writer.taskId} was dispatched before the latest baseline; dispatch a new writer and a check`;
  }
  const checked = facts.tasks.some(
    (t) => t.dispatchSeq > writer.dispatchSeq && isPassingCheck(t),
  );
  if (!checked) {
    return `no passing check after latest writer ${writer.taskId}`;
  }
  if (writer.after === null) {
    return `no after-fingerprint for writer ${writer.taskId}`;
  }
  if (facts.currentFingerprint === null) {
    return "current fingerprint unknown";
  }
  if (!fingerprintEquals(facts.currentFingerprint, writer.after)) {
    return `working tree changed since writer ${writer.taskId} finished`;
  }
  return null;
}

// ─── steering heuristic ─────────────────────────────────────────────────

/**
 * HEURISTIC, defense in depth only: the real enforcement is the steering
 * guard (snapshot diff → pause) and validateCommitPath (never committed).
 *
 * A writer/check prompt is rejected when an edit verb is followed, within
 * a few words and in the same sentence, by a steering path: the plan dir
 * (absolute or checkout-relative), root CLAUDE.md / CLAUDE.local.md /
 * AGENTS.md / .gitmodules (bare or `./`/checkout-prefixed, so a nested
 * `sub/AGENTS.md` is fine), `.githooks`, the recorded hooks dir, any
 * `.gitattributes`, `.git/info/attributes`. Telling a worker to read the
 * plan ("implement task 3.1 from docs/plans/x/phase-3.md") passes: a read
 * cue (from, per, see, described in, ...) between verb and path clears it,
 * except after a removal verb ("remove the rule from CLAUDE.md").
 */
const EDIT_VERB =
  /(?:^|[^\p{L}\p{N}_])(edit|modify|update|change|rewrite|overwrite|write|append|delete|remove|rename|move|create|add|fix|patch|tick|mark|replace|truncate|sửa|cập nhật|ghi|xoá|xóa|thêm|đổi)(?![\p{L}\p{N}_])/giu;
const READ_CUE =
  /(?:^|[^\p{L}\p{N}_])(read|see|from|per|described|according|following|listed|defined|specified|outlined|documented|in the plan|đọc|theo|xem)(?![\p{L}\p{N}_])/iu;
/** Verbs where "from <path>" means editing the path, not reading it. */
const REMOVAL_VERB = /^(delete|remove|move|xoá|xóa)$/iu;
/** Chars of text between an edit verb and a steering path. */
const VERB_WINDOW = 60;
const PATH_CHAR = /[\p{L}\p{N}_.\-/\\]/u;
const ROOT_STEERING_NAMES = [
  "claude.md",
  "claude.local.md",
  "agents.md",
  ".gitmodules",
];

function relInside(checkout: string, abs: string): string | null {
  const rel = relative(checkout, abs);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  return rel.split(sep).join("/");
}

interface Token {
  text: string;
  /** Only when not preceded by a path segment (root files). */
  rootOnly: boolean;
}

function steeringTokens(checkout: string, steering: SteeringSpec): Token[] {
  const tokens: Token[] = [
    { text: ".githooks", rootOnly: false },
    { text: ".gitattributes", rootOnly: false },
    { text: ".git/info/attributes", rootOnly: false },
    ...ROOT_STEERING_NAMES.map((text) => ({ text, rootOnly: true })),
  ];
  for (const abs of [steering.planDir, steering.hooksPath]) {
    if (typeof abs !== "string" || !isAbsolute(abs)) continue;
    tokens.push({ text: abs.replace(/\/+$/, ""), rootOnly: false });
    const rel = relInside(checkout, abs);
    if (rel) tokens.push({ text: rel, rootOnly: true });
  }
  return tokens.map((t) => ({ ...t, text: t.text.toLowerCase() }));
}

/** Start offsets of `token` in `low` with path boundaries on both sides. */
function mentions(low: string, token: Token, checkoutLow: string): number[] {
  const out: number[] = [];
  for (let i = low.indexOf(token.text); i >= 0; ) {
    const end = i + token.text.length;
    const after = low[end] ?? "";
    const okAfter =
      after === "" ||
      after === "/" ||
      !PATH_CHAR.test(after) ||
      (after === "." && !PATH_CHAR.test(low[end + 1] ?? " "));
    const before = low[i - 1] ?? "";
    let okBefore = before === "" || !PATH_CHAR.test(before);
    if (!okBefore && token.rootOnly) {
      const head = low.slice(0, i);
      okBefore =
        head.endsWith(`${checkoutLow}/`) ||
        (head.endsWith("./") && !PATH_CHAR.test(low[i - 3] ?? " "));
    } else if (!okBefore) {
      okBefore = before === "/";
    }
    if (okAfter && okBefore) out.push(i);
    i = low.indexOf(token.text, i + 1);
  }
  return out;
}

/** Steering path a writer/check prompt asks to edit, or null. */
export function promptEditsSteering(
  prompt: string,
  checkout: string,
  steering: SteeringSpec,
): string | null {
  const low = prompt.toLowerCase();
  const checkoutLow = checkout.replace(/\/+$/, "").toLowerCase();
  for (const token of steeringTokens(checkout, steering)) {
    for (const at of mentions(low, token, checkoutLow)) {
      const window = low.slice(Math.max(0, at - VERB_WINDOW), at);
      // Same sentence only: cut at the last newline or sentence end.
      const cut = Math.max(
        window.lastIndexOf("\n"),
        ...[...window.matchAll(/[.!?;](?=\s)/g)].map((m) => m.index ?? -1),
      );
      const clause = window.slice(cut + 1);
      for (const m of clause.matchAll(EDIT_VERB)) {
        const between = clause.slice((m.index ?? 0) + m[0].length);
        if (between.trim().split(/\s+/).filter(Boolean).length > 6) continue;
        if (!REMOVAL_VERB.test(m[1] ?? "") && READ_CUE.test(between)) {
          continue;
        }
        return token.text;
      }
    }
  }
  return null;
}

// ─── validator ──────────────────────────────────────────────────────────

export interface ValidateInput {
  /** Provider output, unparsed (structured_output or the -o file JSON). */
  output: unknown;
  facts: ChefFacts;
  limits: ValidateLimits;
  /**
   * Commit path check (null = fine). Default: validateCommitPath against
   * facts.chef (reads parent dirs; throws INVALID when planDir is not inside
   * the checkout, which becomes a rejection reason).
   */
  checkPath?: (path: string) => string | null;
}

function defaultCheckPath(facts: ChefFacts) {
  return (path: string) =>
    validateCommitPath(facts.chef.checkout, path, facts.chef.steering);
}

/** Why commit `paths` fail the per-path gate, or null. */
function commitPathsProblem(
  paths: string[],
  current: ChefFingerprint,
  checkPath: (path: string) => string | null,
): string | null {
  const seen = new Set<string>();
  for (const p of paths) {
    if (seen.has(p)) return `duplicate path ${JSON.stringify(p)}`;
    seen.add(p);
    let problem: string | null;
    try {
      problem = checkPath(p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `cannot check path ${JSON.stringify(p)}: ${msg}`;
    }
    if (problem) return `${JSON.stringify(p)}: ${problem}`;
    if (!Object.prototype.hasOwnProperty.call(current.changed, p)) {
      return `${JSON.stringify(p)} is not in the changed set`;
    }
  }
  return null;
}

/**
 * Validate the chef's output against the facts, simulating the actions in
 * order. A schema failure rejects everything (`schemaError`); otherwise each
 * action is accepted or rejected on its own.
 */
export function validateActions(input: ValidateInput): ValidationResult {
  const { facts, limits } = input;
  const parsed = parseChefOutput(input.output);
  if (!parsed.ok) {
    const items = (input.output as { actions?: unknown } | null)?.actions;
    const rejected: RejectedAction[] = Array.isArray(items)
      ? items.map((action, index) => ({
          index,
          action,
          reason: parsed.error,
        }))
      : [{ index: 0, action: input.output, reason: parsed.error }];
    return {
      summary: null,
      accepted: [],
      rejected,
      schemaError: parsed.error,
    };
  }

  const checkPath = input.checkPath ?? defaultCheckPath(facts);
  const pending = new Map<string, string>();
  const chefTasks = new Set(facts.tasks.map((t) => t.taskId));
  for (const a of facts.pendingAsks) {
    if (chefTasks.has(a.taskId)) pending.set(a.qid, a.taskId);
  }
  const answered = new Set<string>();
  let dispatched = 0;
  let dispatchedWriters = 0;
  let committed = false;
  let paused = false;

  const accepted: AcceptedAction[] = [];
  const rejected: RejectedAction[] = [];

  const judge = (action: ChefAction): string | null => {
    switch (action.type) {
      case "dispatch": {
        if (paused) return "chef paused earlier in this wake";
        if (dispatched >= limits.maxTasksPerWake) {
          return `over maxTasksPerWake (${limits.maxTasksPerWake})`;
        }
        if (facts.running.tasks + dispatched >= limits.maxConcurrentTasks) {
          return `over maxConcurrentTasks (${limits.maxConcurrentTasks})`;
        }
        const writer = isWriterMode(action.role);
        if (writer && facts.running.writers + dispatchedWriters >= 1) {
          return "a writer or check task is already running (one writer at a time)";
        }
        if (writer) {
          const hit = promptEditsSteering(
            action.prompt,
            facts.chef.checkout,
            facts.chef.steering,
          );
          if (hit) return `prompt asks to edit steering path ${hit}`;
        }
        dispatched++;
        if (writer) dispatchedWriters++;
        return null;
      }
      case "commit": {
        if (paused) return "chef paused earlier in this wake";
        if (committed) return "only one commit per wake";
        if (dispatchedWriters > 0) {
          return "a writer or check task was dispatched earlier in this wake";
        }
        const gate = commitGateProblem(facts);
        if (gate) return `commit gate: ${gate}`;
        const current = facts.currentFingerprint as ChefFingerprint;
        const pathProblem = commitPathsProblem(
          action.paths,
          current,
          checkPath,
        );
        if (pathProblem) return `commit gate: ${pathProblem}`;
        const msgProblem = validateCommitMessage(action.message);
        if (msgProblem) return `commit gate: ${msgProblem}`;
        committed = true;
        return null;
      }
      case "answer": {
        if (!pending.has(action.qid)) {
          return `no pending question ${JSON.stringify(action.qid)} of this chef's tasks`;
        }
        if (answered.has(action.qid)) {
          return `question ${action.qid} already answered in this wake`;
        }
        answered.add(action.qid);
        return null;
      }
      case "pause":
        paused = true;
        return null;
      case "ask_user":
      case "note":
        return null;
    }
  };

  parsed.output.actions.forEach((raw, index) => {
    if (index >= MAX_ACTIONS_PER_WAKE) {
      rejected.push({
        index,
        action: raw,
        reason: `over ${MAX_ACTIONS_PER_WAKE} actions in one wake`,
      });
      return;
    }
    const action = normalize(raw);
    if (typeof action === "string") {
      rejected.push({ index, action: raw, reason: action });
      return;
    }
    const reason = judge(action);
    if (reason) rejected.push({ index, action, reason });
    else accepted.push({ index, action });
  });

  return {
    summary: parsed.output.summary.slice(0, MAX_SUMMARY_CHARS),
    accepted,
    rejected,
  };
}

// ─── rejected-wake streak ───────────────────────────────────────────────

/** Ok wakes in a row with rejected actions before the chef pauses. */
export const MAX_REJECTED_WAKES = 3;

/** True when this wake rejected any action (recorded as result.rejected). */
export function wakeHadRejections(result: ValidationResult): boolean {
  return result.rejected.length > 0;
}

/** `streak` = consecutiveRejectedWakes(id) after this wake's result.json. */
export function shouldPauseForRejections(streak: number): boolean {
  return streak >= MAX_REJECTED_WAKES;
}
