import { createHash } from "crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { DecisionConfig } from "./config.js";
import { globalConfigDir } from "./paths.js";

/**
 * JSONL log of decision calls: one line per export (aggregated) and one per
 * D3 finding. Only whitelisted enum/id/number fields are written — never state
 * text, finding text, file paths, or auth headers.
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

/** Append one line. Never throws: a log failure must not break the command. */
export function appendDecisionLog(entry: DecisionLogEntry): void {
  try {
    const line = sanitize(entry);
    if (!line) return;
    mkdirSync(decisionsDir(), { recursive: true, mode: 0o700 });
    appendFileSync(logFile(), `${JSON.stringify(line)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
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
