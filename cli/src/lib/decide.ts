import { resolveDecisionConfig, type DecisionConfig } from "./config.js";

/**
 * Decision-model client ("System One" request: state + typed questions).
 *
 * - Config comes from resolveDecisionConfig() (global only), never loadConfig().
 * - API keys come from process.env only and never appear in results or logs.
 * - `decide` never throws and does not retry. It does not log either: callers
 *   write the log line (decide-log.ts), since only they know the point's ids.
 * - The state is untrusted data: it is only sent for scoring, never interpreted.
 */

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string } | null;
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  /** option → description (null = no description). */
  criteria: Record<string, string | null>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  /** Ordered levels, lowest first. */
  criteria: string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface DecisionRequest {
  state: string | object;
  questions: Record<string, Question>;
}

export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  score: number;
  confidence: number;
}

/** noul → probability in [0, 1]; choice and score → their object. */
export type Answer = number | ChoiceAnswer | ScoreAnswer;

export type DecideFailReason =
  | "off"
  | "gate"
  | "no-key"
  | "invalid"
  | "timeout"
  | "http"
  | "network"
  | "bad-response"
  | "aborted";

export type DecideResult =
  | {
      ok: true;
      answers: Record<string, Answer>;
      model: string;
      latencyMs: number;
    }
  | { ok: false; reason: DecideFailReason; status?: number };

export type GateResult =
  | { ok: true }
  | { ok: false; reason: "off" | "gate" | "no-key" };

/** Most questions per request accepted by every provider. */
export const MAX_QUESTIONS = 64;
const QUESTION_ID_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const CLOUDFLARE_MODELS = new Set(["clef", "clef-flash"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function envValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function isLoopbackUrl(baseUrl: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * The data-egress gate. Remote = typesafe, cloudflare, or local with a
 * non-loopback baseUrl (an unparseable URL counts as remote). Remote needs
 * `allowRemote === true` from the global config; `allowSynthetic` is only for
 * `cf decide test|eval`, which send built-in synthetic data.
 */
export function checkGate(
  cfg: DecisionConfig,
  opts: { allowSynthetic?: boolean } = {},
): GateResult {
  if (cfg.provider === "off") return { ok: false, reason: "off" };
  const remote = cfg.provider !== "local" || !isLoopbackUrl(cfg.baseUrl);
  if (remote && cfg.allowRemote !== true && !opts.allowSynthetic) {
    return { ok: false, reason: "gate" };
  }
  if (cfg.provider === "typesafe" && !envValue("TYPESAFE_API_KEY")) {
    return { ok: false, reason: "no-key" };
  }
  if (
    cfg.provider === "cloudflare" &&
    (!envValue("CLOUDFLARE_API_TOKEN") || !envValue("CLOUDFLARE_ACCOUNT_ID"))
  ) {
    return { ok: false, reason: "no-key" };
  }
  return { ok: true };
}

function isValidQuestion(q: unknown): boolean {
  if (!isObject(q)) return false;
  if (q.type === "noul") {
    return typeof q.instructions === "string" && q.instructions.trim() !== "";
  }
  if (typeof q.instructions !== "string") return false;
  if (q.type === "choice") {
    if (!isObject(q.criteria)) return false;
    const values = Object.values(q.criteria);
    return (
      values.length >= 2 &&
      values.length <= 255 &&
      values.every((d) => d === null || typeof d === "string")
    );
  }
  if (q.type === "score") {
    return (
      Array.isArray(q.criteria) &&
      q.criteria.length >= 2 &&
      q.criteria.length <= 10 &&
      q.criteria.every((l) => typeof l === "string")
    );
  }
  return false;
}

/** Client-side limits shared by every provider (see provider-shapes.md). */
export function isValidRequest(request: DecisionRequest): boolean {
  const { state, questions } = request ?? {};
  if (typeof state !== "string" && (typeof state !== "object" || !state)) {
    return false;
  }
  if (!isObject(questions)) return false;
  const entries = Object.entries(questions);
  return (
    entries.length >= 1 &&
    entries.length <= MAX_QUESTIONS &&
    entries.every(([id, q]) => QUESTION_ID_RE.test(id) && isValidQuestion(q))
  );
}

/** Split a question map into chunks of at most `size` questions (order kept). */
export function chunkQuestions(
  questions: Record<string, Question>,
  size = MAX_QUESTIONS,
): Record<string, Question>[] {
  const entries = Object.entries(questions);
  const chunks: Record<string, Question>[] = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(Object.fromEntries(entries.slice(i, i + size)));
  }
  return chunks;
}

function endpoint(cfg: DecisionConfig): {
  url: string;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cfg.provider === "typesafe") {
    headers.authorization = `Bearer ${envValue("TYPESAFE_API_KEY")}`;
    return { url: "https://api.typesafe.ai/v1/systemone", headers };
  }
  if (cfg.provider === "cloudflare") {
    headers.authorization = `Bearer ${envValue("CLOUDFLARE_API_TOKEN")}`;
    const account = encodeURIComponent(envValue("CLOUDFLARE_ACCOUNT_ID")!);
    return {
      url: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/cloudflare/${cfg.model}`,
      headers,
    };
  }
  // local: no auth header (optional Kev/Laya keys are out of scope for v1).
  return { url: `${cfg.baseUrl.replace(/\/+$/, "")}/v1/systemone`, headers };
}

/** AbortSignal.any needs Node 20.3; engines allows >=20, so fall back. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

function parseAnswer(q: Question, a: unknown): Answer | null {
  if (!isObject(a) || a.type !== q.type) return null;
  if (q.type === "noul") return isFiniteNumber(a.noul) ? a.noul : null;
  if (!isFiniteNumber(a.confidence)) return null;
  if (q.type === "score") {
    return isFiniteNumber(a.score)
      ? { score: a.score, confidence: a.confidence }
      : null;
  }
  if (typeof a.choice !== "string" || !Object.hasOwn(q.criteria, a.choice)) {
    return null;
  }
  const probabilities: Record<string, number> = {};
  if (isObject(a.probabilities)) {
    for (const [k, p] of Object.entries(a.probabilities)) {
      if (isFiniteNumber(p)) probabilities[k] = p;
    }
  }
  return { choice: a.choice, confidence: a.confidence, probabilities };
}

/** Every asked question needs an answer of the same type; extra fields are ignored. */
function parseAnswers(
  questions: Record<string, Question>,
  raw: unknown,
): Record<string, Answer> | null {
  if (!isObject(raw)) return null;
  const answers: Record<string, Answer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const parsed = parseAnswer(q, raw[id]);
    if (parsed === null) return null;
    answers[id] = parsed;
  }
  return answers;
}

/**
 * Ask the configured decision model. Never throws; the caller picks fail-open
 * or fail-safe from `reason`. `point` names the decision point for the caller's
 * log line (decide itself does not log).
 */
export async function decide(
  request: DecisionRequest,
  opts: {
    point: string;
    signal?: AbortSignal;
    allowSynthetic?: boolean;
    cfg?: DecisionConfig;
  },
): Promise<DecideResult> {
  try {
    const cfg = opts.cfg ?? resolveDecisionConfig();
    const gate = checkGate(cfg, { allowSynthetic: opts.allowSynthetic });
    if (!gate.ok) return gate;
    if (!isValidRequest(request)) return { ok: false, reason: "invalid" };
    if (cfg.provider === "cloudflare" && !CLOUDFLARE_MODELS.has(cfg.model)) {
      return { ok: false, reason: "invalid" };
    }
    if (opts.signal?.aborted) return { ok: false, reason: "aborted" };

    const { url, headers } = endpoint(cfg);
    const timeout = AbortSignal.timeout(cfg.timeoutMs);
    const signal = opts.signal ? anySignal([timeout, opts.signal]) : timeout;
    const abortReason = (): DecideFailReason | null =>
      opts.signal?.aborted ? "aborted" : timeout.aborted ? "timeout" : null;

    const body = JSON.stringify({
      model: cfg.model,
      state: request.state,
      questions: request.questions,
    });
    const started = performance.now();
    let res: Response;
    try {
      // Never follow a redirect: 307/308 would resend `state` to an unchecked host.
      res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal,
        redirect: "error",
      });
    } catch {
      return { ok: false, reason: abortReason() ?? "network" };
    }
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return { ok: false, reason: "http", status: res.status };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, reason: abortReason() ?? "bad-response" };
    }
    const latencyMs = Math.round(performance.now() - started);

    // Cloudflare REST envelope (unverified): unwrap only when it is there.
    if (cfg.provider === "cloudflare" && isObject(data) && "success" in data) {
      if (data.success === false) {
        return { ok: false, reason: "http", status: res.status };
      }
      if (isObject(data.result)) data = data.result;
    }
    if (!isObject(data)) return { ok: false, reason: "bad-response" };
    const answers = parseAnswers(request.questions, data.answers);
    if (!answers) return { ok: false, reason: "bad-response" };
    const model =
      typeof data.model === "string" && data.model ? data.model : cfg.model;
    return { ok: true, answers, model, latencyMs };
  } catch {
    // Defensive: nothing above should throw, but decide never does.
    return { ok: false, reason: "bad-response" };
  }
}
