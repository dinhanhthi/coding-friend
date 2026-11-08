import { createHash } from "crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "fs";
import { join, resolve } from "path";
import type { DecisionConfig } from "./config.js";
import { percentile } from "./decide-util.js";
import { globalConfigDir } from "./paths.js";

/**
 * JSONL log of decision calls: one line per export (aggregated), one per D3
 * finding asked (has findingHash) and one per D3 run (counts, no findingHash).
 * Only whitelisted enum/id/number fields are written — never state text,
 * finding text, file paths, or auth headers.
 */

export type DecisionPoint = "export" | "review_fp" | "test" | "eval";

export interface DecisionLogEntry {
  v: 1;
  ts: string;
  point: DecisionPoint;
  provider: DecisionConfig["provider"];
  model: string;
  ok: boolean;
  /** A short token, e.g. a DecideFailReason ("timeout", "http", …). */
  fallbackReason?: string;
  latencyMs?: number;
  /** Question id → numeric answer. */
  answers?: Record<string, number>;
  stateHash?: string;
  runId?: string;
  severity?: "critical" | "important" | "suggestion";
  layer?: string;
  findingHash?: string;
}

const POINTS = new Set(["export", "review_fp", "test", "eval"]);
const PROVIDERS = new Set(["off", "local", "typesafe", "cloudflare"]);
const SEVERITIES = new Set(["critical", "important", "suggestion"]);
const ID_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const MODEL_RE = /^[A-Za-z0-9_.:/@-]{1,100}$/;
const TOKEN_RE = /^[a-z][a-z-]{0,39}$/;
const HEX_RE = /^[0-9a-f]{1,64}$/;
const LAYER_RE = /^L[0-4]$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Decision log dir (CF_DECISIONS_DIR overrides ~/.coding-friend/decisions). */
export function decisionsDir(): string {
  const override = process.env.CF_DECISIONS_DIR;
  return override ? resolve(override) : join(globalConfigDir(), "decisions");
}

function logFile(): string {
  return join(decisionsDir(), "log.jsonl");
}

/**
 * First 16 hex chars of sha256 over the serialized state: a string state is
 * hashed as-is, anything else as JSON.stringify(state).
 */
export function hashState(state: string | object): string {
  const text = typeof state === "string" ? state : JSON.stringify(state);
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function str(v: unknown, re: RegExp): string | undefined {
  return typeof v === "string" && re.test(v) ? v : undefined;
}

/** Copy only whitelisted fields; anything free-form is dropped or replaced. */
function sanitize(entry: DecisionLogEntry): DecisionLogEntry | null {
  const e = entry as unknown as Record<string, unknown>;
  if (typeof e.point !== "string" || !POINTS.has(e.point)) return null;
  if (typeof e.provider !== "string" || !PROVIDERS.has(e.provider)) return null;
  const out: DecisionLogEntry = {
    v: 1,
    ts: str(e.ts, TS_RE) ?? new Date().toISOString(),
    point: e.point as DecisionPoint,
    provider: e.provider as DecisionConfig["provider"],
    model: str(e.model, MODEL_RE) ?? "unknown",
    ok: e.ok === true,
  };
  const fallbackReason = str(e.fallbackReason, TOKEN_RE);
  if (fallbackReason) out.fallbackReason = fallbackReason;
  if (typeof e.latencyMs === "number" && Number.isFinite(e.latencyMs)) {
    out.latencyMs = Math.max(0, Math.round(e.latencyMs));
  }
  if (typeof e.answers === "object" && e.answers !== null) {
    const answers: Record<string, number> = {};
    for (const [id, n] of Object.entries(e.answers)) {
      if (ID_RE.test(id) && typeof n === "number" && Number.isFinite(n)) {
        answers[id] = n;
      }
    }
    out.answers = answers;
  }
  const stateHash = str(e.stateHash, HEX_RE);
  if (stateHash) out.stateHash = stateHash;
  const runId = str(e.runId, ID_RE);
  if (runId) out.runId = runId;
  if (typeof e.severity === "string" && SEVERITIES.has(e.severity)) {
    out.severity = e.severity as DecisionLogEntry["severity"];
  }
  const layer = str(e.layer, LAYER_RE);
  if (layer) out.layer = layer;
  const findingHash = str(e.findingHash, HEX_RE);
  if (findingHash) out.findingHash = findingHash;
  return out;
}

/**
 * Append one line. Never throws: a log failure must not break the command.
 * The dir is 0700 and the file 0600 even when they already existed; a
 * symlinked dir or file is never written through.
 */
export function appendDecisionLog(entry: DecisionLogEntry): void {
  try {
    const line = sanitize(entry);
    if (!line) return;
    const dir = decisionsDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (lstatSync(dir).isSymbolicLink()) return;
    chmodSync(dir, 0o700);
    const fd = openSync(
      logFile(),
      constants.O_WRONLY |
        constants.O_APPEND |
        constants.O_CREAT |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      fchmodSync(fd, 0o600);
      writeSync(fd, `${JSON.stringify(line)}\n`);
    } finally {
      closeSync(fd);
    }
  } catch {
    // swallowed on purpose
  }
}

/** Read every parseable entry; a missing file or bad lines are skipped. */
export function readDecisionLog(): DecisionLogEntry[] {
  try {
    const file = logFile();
    if (!existsSync(file)) return [];
    const entries: DecisionLogEntry[] = [];
    for (const raw of readFileSync(file, "utf-8").split("\n")) {
      if (!raw.trim()) continue;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          (parsed as Record<string, unknown>).v === 1 &&
          typeof (parsed as Record<string, unknown>).point === "string"
        ) {
          entries.push(parsed as DecisionLogEntry);
        }
      } catch {
        // tolerate a bad line
      }
    }
    return entries;
  } catch {
    return [];
  }
}

const SEVERITY_LIST = ["critical", "important", "suggestion"] as const;
/** Skip counts of a review_fp run line (under `answers`). */
const SKIP_LIST = [
  "skippedSecurity",
  "skippedSecretPath",
  "skippedSecretContent",
  "skippedNoContext",
  "skippedOverLimit",
  "skippedBudget",
] as const;

export interface SeveritySummary {
  /** review_fp lines with a numeric `noul` answer. */
  answered: number;
  /** Answered findings with noul < threshold (model thinks likely false positive). */
  belowThreshold: number;
  /** belowThreshold / answered, or null when nothing was answered. */
  share: number | null;
}

export interface DecisionLogSummary {
  since: string | null;
  threshold: number;
  lines: Record<DecisionPoint, number>;
  reviewFp: {
    /** review_fp run lines (counts, no findingHash), one per executed run. */
    runs: number;
    /** review_fp finding lines (one per finding asked). */
    findings: number;
    answered: number;
    fallback: number;
    fallbackRate: number;
    p50Ms: number;
    p95Ms: number;
    bySeverity: Record<(typeof SEVERITY_LIST)[number], SeveritySummary>;
  } & Record<(typeof SKIP_LIST)[number], number>;
}

/**
 * Numbers-only summary of log entries for `cf decide log`. Entries come from
 * readDecisionLog, which checks only `v` and `point`, so every field is
 * re-checked here. `sinceMs` drops entries before it (and any with a bad ts).
 */
export function summarizeDecisionLog(
  entries: DecisionLogEntry[],
  opts: { sinceMs?: number; threshold: number },
): DecisionLogSummary {
  const lines: Record<DecisionPoint, number> = {
    export: 0,
    review_fp: 0,
    test: 0,
    eval: 0,
  };
  let runs = 0;
  const skipped = Object.fromEntries(SKIP_LIST.map((k) => [k, 0])) as Record<
    (typeof SKIP_LIST)[number],
    number
  >;
  const latencies: number[] = [];
  const bySeverity = Object.fromEntries(
    SEVERITY_LIST.map((s) => [
      s,
      { answered: 0, belowThreshold: 0, share: null },
    ]),
  ) as DecisionLogSummary["reviewFp"]["bySeverity"];
  let findings = 0;
  let answered = 0;

  for (const e of entries) {
    if (!POINTS.has(e.point)) continue;
    if (opts.sinceMs !== undefined) {
      const ts = typeof e.ts === "string" ? Date.parse(e.ts) : NaN;
      if (!(ts >= opts.sinceMs)) continue;
    }
    lines[e.point]++;
    if (e.point !== "review_fp") continue;
    if (typeof e.findingHash !== "string") {
      // run line: counts only
      runs++;
      for (const k of SKIP_LIST) {
        const n = e.answers?.[k];
        if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
          skipped[k] += n;
        }
      }
      continue;
    }
    findings++;
    const noul = e.answers?.noul;
    if (e.ok !== true || typeof noul !== "number" || !Number.isFinite(noul)) {
      continue;
    }
    answered++;
    // Latency of answered lines only, as in runEval.
    if (typeof e.latencyMs === "number" && Number.isFinite(e.latencyMs)) {
      latencies.push(e.latencyMs);
    }
    if (typeof e.severity === "string" && SEVERITIES.has(e.severity)) {
      const s = bySeverity[e.severity];
      s.answered++;
      if (noul < opts.threshold) s.belowThreshold++;
    }
  }
  for (const s of Object.values(bySeverity)) {
    s.share = s.answered ? s.belowThreshold / s.answered : null;
  }

  return {
    since:
      opts.sinceMs === undefined ? null : new Date(opts.sinceMs).toISOString(),
    threshold: opts.threshold,
    lines,
    reviewFp: {
      runs,
      findings,
      answered,
      fallback: findings - answered,
      fallbackRate: findings ? (findings - answered) / findings : 0,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      bySeverity,
      ...skipped,
    },
  };
}
