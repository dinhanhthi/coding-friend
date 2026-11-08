import { log } from "../lib/log.js";
import { resolveDecisionConfig } from "../lib/config.js";
import {
  checkGate,
  decisionConfigProblem,
  gateMessage,
} from "../lib/decide.js";
import { runEval, runTest, type EvalPoint } from "../lib/decide-eval.js";
import { readDecisionLog, summarizeDecisionLog } from "../lib/decide-log.js";
import { reviewFalsePositives } from "../lib/decide-review.js";
import { CliError, runHuman, runJson } from "../lib/output.js";

const EVAL_POINTS: EvalPoint[] = ["redact", "review-fp"];
const CONFIG_REASONS = new Set(["off", "gate", "no-key", "invalid"]);
const DEFAULT_THRESHOLD = 0.2;

async function runHumanLogged(fn: () => void | Promise<void>): Promise<void> {
  await runHuman(async () => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

async function run(
  json: boolean | undefined,
  data: () => unknown,
  human: () => void | Promise<void>,
): Promise<void> {
  if (json) await runJson(data);
  else await runHumanLogged(human);
}

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

/** A config failure (off/gate/no-key/invalid) is INVALID_ARGS; the rest is the provider's. */
function failure(reason: string): CliError {
  return new CliError(
    CONFIG_REASONS.has(reason) ? "INVALID_ARGS" : "PROVIDER_UNAVAILABLE",
    `decision model failed: ${reason}`,
  );
}

/**
 * Config check for test/eval: the same gate as real data (a remote provider
 * needs allowRemote). A bad model or baseUrl is reported before the gate, which
 * it also closes. Throws before any request so eval never prints a table of
 * fallbacks.
 */
function assertSyntheticUsable(): void {
  const cfg = resolveDecisionConfig();
  const problem = decisionConfigProblem(cfg);
  if (problem) throw new CliError("INVALID_ARGS", problem);
  const gate = checkGate(cfg);
  if (!gate.ok) {
    throw new CliError("INVALID_ARGS", gateMessage(cfg, gate.reason));
  }
}

// ─── cf decide test ──────────────────────────────────────────────────────────

async function testData() {
  assertSyntheticUsable();
  const r = await runTest();
  if (!r.ok) throw failure(r.reason);
  return r;
}

export async function decideTestCommand(
  opts: { json?: boolean } = {},
): Promise<void> {
  await run(opts.json, testData, async () => {
    const r = await testData();
    log.success(
      `${r.provider} ${r.model}: answer ${r.answer.toFixed(2)} in ${r.latencyMs} ms`,
    );
  });
}

// ─── cf decide eval ──────────────────────────────────────────────────────────

async function evalData(point: string | undefined) {
  if (point !== undefined && !EVAL_POINTS.includes(point as EvalPoint)) {
    throw new CliError("INVALID_ARGS", "--point must be redact or review-fp");
  }
  assertSyntheticUsable();
  const points = point ? [point as EvalPoint] : EVAL_POINTS;
  const results = [];
  for (const p of points) results.push(await runEval(p));
  return { results };
}

export async function decideEvalCommand(
  opts: { point?: string; json?: boolean } = {},
): Promise<void> {
  await run(
    opts.json,
    () => evalData(opts.point),
    async () => {
      const { results } = await evalData(opts.point);
      log.info("point      samples  answered  fallback  accuracy  p50/p95 ms");
      for (const r of results) {
        log.info(
          `${r.point.padEnd(10)} ${String(r.samples).padStart(7)}  ${String(r.answered).padStart(8)}  ${pct(r.fallbackRate).padStart(8)}  ${pct(r.accuracy).padStart(8)}  ${r.p50Ms}/${r.p95Ms}`,
        );
      }
      log.dim(`  ${results[0].provider} ${results[0].model}`);
    },
  );
}

// ─── cf decide log ───────────────────────────────────────────────────────────

/**
 * `--since` in ms: a bare YYYY-MM-DD is local midnight (Date.parse would read
 * it as UTC), anything else goes to Date.parse. NaN when invalid.
 */
function parseSince(since: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since);
  if (!m) return Date.parse(since);
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d);
  // Reject a day that rolls over (2026-02-31 → March 3).
  return date.getFullYear() === y &&
    date.getMonth() === mo &&
    date.getDate() === d
    ? date.getTime()
    : NaN;
}

function logData(opts: { since?: string; threshold?: string }) {
  let sinceMs: number | undefined;
  if (opts.since !== undefined) {
    sinceMs = parseSince(opts.since);
    if (Number.isNaN(sinceMs)) {
      throw new CliError(
        "INVALID_ARGS",
        "--since must be an ISO date (YYYY-MM-DD or a full timestamp)",
      );
    }
  }
  let threshold = DEFAULT_THRESHOLD;
  if (opts.threshold !== undefined) {
    threshold = Number(opts.threshold);
    if (
      opts.threshold.trim() === "" ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 1
    ) {
      throw new CliError("INVALID_ARGS", "--threshold must be from 0 to 1");
    }
  }
  return summarizeDecisionLog(readDecisionLog(), { sinceMs, threshold });
}

export async function decideLogCommand(
  opts: { since?: string; threshold?: string; json?: boolean } = {},
): Promise<void> {
  await run(
    opts.json,
    () => logData(opts),
    () => {
      const s = logData(opts);
      const r = s.reviewFp;
      const l = s.lines;
      log.info(
        `Lines${s.since ? ` since ${s.since}` : ""}: export ${l.export}, review_fp ${l.review_fp}, test ${l.test}, eval ${l.eval}`,
      );
      log.info(
        `Review shadow: ${r.runs} runs, ${r.findings} findings asked, fallback ${pct(r.fallbackRate)}, p50/p95 ${r.p50Ms}/${r.p95Ms} ms`,
      );
      log.dim(
        `  skipped: security ${r.skippedSecurity}, secret path ${r.skippedSecretPath}, secret content ${r.skippedSecretContent}, no context ${r.skippedNoContext}, over limit ${r.skippedOverLimit}, budget ${r.skippedBudget}`,
      );
      for (const [severity, v] of Object.entries(r.bySeverity)) {
        const share = v.share === null ? "-" : pct(v.share);
        log.dim(
          `  ${severity}: ${share} of ${v.answered} answered below ${s.threshold} (likely false positive)`,
        );
      }
    },
  );
}

// ─── cf decide review-fp ─────────────────────────────────────────────────────

function reviewFpData(opts: { snapshotDir?: string; report?: string }) {
  if (!opts.snapshotDir || !opts.report) {
    throw new CliError(
      "INVALID_ARGS",
      "review-fp needs --snapshot-dir <dir> and --report <file>",
    );
  }
  // Bad paths throw INVALID_ARGS (error envelope). A closed gate is not an
  // error: it comes back as data.ok=false + reason inside an ok:true envelope,
  // so the /cf-review shadow wrapper never sees an error for an expected "off".
  return reviewFalsePositives({
    snapshotDir: opts.snapshotDir,
    reportPath: opts.report,
  });
}

export async function decideReviewFpCommand(
  opts: { snapshotDir?: string; report?: string; json?: boolean } = {},
): Promise<void> {
  await run(
    opts.json,
    () => reviewFpData(opts),
    async () => {
      const r = await reviewFpData(opts);
      if (!r.ok) {
        log.warn(`Not run: ${r.reason}`);
        return;
      }
      log.info(
        `Asked ${r.asked}; skipped: security ${r.skippedSecurity}, secret path ${r.skippedSecretPath}, secret content ${r.skippedSecretContent}, no context ${r.skippedNoContext}, over limit ${r.skippedOverLimit}, budget ${r.skippedBudget}`,
      );
    },
  );
}
