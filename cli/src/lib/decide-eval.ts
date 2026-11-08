import { resolveDecisionConfig, type DecisionConfig } from "./config.js";
import {
  decide,
  type DecideFailReason,
  type DecisionRequest,
} from "./decide.js";
import { REDACT_INSTRUCTIONS } from "./decide-filters.js";
import { appendDecisionLog } from "./decide-log.js";
import { percentile, runPool } from "./decide-util.js";
import {
  INSTRUCTIONS as REVIEW_FP_INSTRUCTIONS,
  QUESTION_ID as REVIEW_FP_QUESTION_ID,
} from "./decide-review.js";
import redactGolden from "./decide-golden/redact.json";
import reviewFpGolden from "./decide-golden/review-fp.json";

/**
 * `cf decide test|eval`: measure the decision model on built-in synthetic
 * golden sets. Only data bundled with the CLI is sent, never a session or
 * user code, but the remote gate still applies. Requests use the exact
 * production instructions.
 */

export type EvalPoint = "redact" | "review-fp";

export interface EvalResult {
  point: EvalPoint;
  samples: number;
  answered: number;
  fallback: number;
  fallbackRate: number;
  /** Over answered samples only; 0 when none answered. */
  accuracy: number;
  p50Ms: number;
  p95Ms: number;
  provider: DecisionConfig["provider"];
  model: string;
}

export type TestResult =
  | {
      ok: true;
      provider: DecisionConfig["provider"];
      model: string;
      answer: number;
      latencyMs: number;
    }
  | {
      ok: false;
      provider: DecisionConfig["provider"];
      model: string;
      reason: DecideFailReason;
    };

const CONCURRENCY = 4;
const REVIEW_FP_THRESHOLD = 0.5;
// Same id shape as the first window of the export filter.
const REDACT_QUESTION_ID = "w0_0";

interface Sample {
  request: DecisionRequest;
  questionId: string;
  label: boolean;
}

function samplesFor(point: EvalPoint): Sample[] {
  if (point === "redact") {
    return redactGolden.map((s) => ({
      request: {
        state: s.text,
        questions: {
          [REDACT_QUESTION_ID]: {
            type: "noul",
            instructions: REDACT_INSTRUCTIONS,
          },
        },
      },
      questionId: REDACT_QUESTION_ID,
      label: s.label,
    }));
  }
  return reviewFpGolden.map((s) => ({
    request: {
      state: { finding: s.finding, code: s.code },
      questions: {
        [REVIEW_FP_QUESTION_ID]: {
          type: "noul",
          instructions: REVIEW_FP_INSTRUCTIONS,
        },
      },
    },
    questionId: REVIEW_FP_QUESTION_ID,
    label: s.label,
  }));
}

/**
 * Ask the model about every golden sample of `point` (one request each) and
 * score the answers against the labels. A failed request counts as fallback;
 * this never throws on a provider failure. Logs one aggregated "eval" line.
 */
export async function runEval(
  point: EvalPoint,
  opts: { signal?: AbortSignal } = {},
): Promise<EvalResult> {
  const cfg = resolveDecisionConfig();
  const threshold =
    point === "redact" ? cfg.redactThreshold : REVIEW_FP_THRESHOLD;
  const samples = samplesFor(point);
  const latencies: number[] = [];
  let correct = 0;
  let model: string | undefined;
  let firstFailure: DecideFailReason | undefined;

  await runPool(
    samples.map((sample) => async () => {
      const res = await decide(sample.request, {
        point: "eval",
        signal: opts.signal,
      });
      const noul = res.ok ? res.answers[sample.questionId] : undefined;
      if (!res.ok || typeof noul !== "number") {
        firstFailure ??= res.ok ? "bad-response" : res.reason;
        return;
      }
      model ??= res.model;
      latencies.push(res.latencyMs);
      if (noul >= threshold === sample.label) correct++;
    }),
    { concurrency: CONCURRENCY },
  );

  const answered = latencies.length;
  const fallback = samples.length - answered;
  const result: EvalResult = {
    point,
    samples: samples.length,
    answered,
    fallback,
    fallbackRate: samples.length ? fallback / samples.length : 0,
    accuracy: answered ? correct / answered : 0,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    provider: cfg.provider,
    model: model ?? cfg.model,
  };
  // The log keeps only numeric answers, so the counts ride there.
  appendDecisionLog({
    v: 1,
    ts: new Date().toISOString(),
    point: "eval",
    provider: cfg.provider,
    model: result.model,
    ok: answered > 0,
    ...(answered === 0 && firstFailure && { fallbackReason: firstFailure }),
    latencyMs: result.p50Ms,
    answers: {
      samples: result.samples,
      answered,
      fallback,
      accuracy: result.accuracy,
    },
  });
  return result;
}

const TEST_QUESTION_ID = "test";
const TEST_REQUEST: DecisionRequest = {
  state: "The team shipped the release on Friday and the weather was sunny.",
  questions: {
    [TEST_QUESTION_ID]: {
      type: "noul",
      instructions: "The text says the release was shipped.",
    },
  },
};

/** One built-in synthetic request; logs one "test" line. */
export async function runTest(
  opts: { signal?: AbortSignal } = {},
): Promise<TestResult> {
  const cfg = resolveDecisionConfig();
  const res = await decide(TEST_REQUEST, {
    point: "test",
    signal: opts.signal,
  });
  const answer = res.ok ? res.answers[TEST_QUESTION_ID] : undefined;
  const result: TestResult =
    res.ok && typeof answer === "number"
      ? {
          ok: true,
          provider: cfg.provider,
          model: res.model,
          answer,
          latencyMs: res.latencyMs,
        }
      : {
          ok: false,
          provider: cfg.provider,
          model: cfg.model,
          reason: res.ok ? "bad-response" : res.reason,
        };
  appendDecisionLog({
    v: 1,
    ts: new Date().toISOString(),
    point: "test",
    provider: cfg.provider,
    model: result.model,
    ok: result.ok,
    ...(result.ok
      ? {
          latencyMs: result.latencyMs,
          answers: { [TEST_QUESTION_ID]: answer as number },
        }
      : { fallbackReason: result.reason }),
  });
  return result;
}
