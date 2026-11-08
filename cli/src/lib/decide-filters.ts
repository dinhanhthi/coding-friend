import type { DecisionConfig } from "./config.js";
import { decide, type Answer, type DecisionRequest } from "./decide.js";
import { runPool } from "./decide-util.js";
import type { ExtraFilter, SegmentKind } from "./redact.js";
import { TOOL_OUTPUT_MAX_CHARS } from "./transcript.js";

/**
 * Model filters for `cf session export` (plugged into the ExtraFilter seam).
 *
 * - The model only removes: a segment is kept as-is or emptied, so runFilter's
 *   subsequence check always holds.
 * - Any failure throws (message = a reason token, never text), so runFilter
 *   falls back to the regex-only segments.
 * - Segment text is untrusted state: it is only sent for scoring.
 * - redactModelFilter's `cfg` (its threshold) must come from
 *   resolveDecisionConfig() (global only); decide() reads its own config.
 */

export const WINDOW_CHARS = 2000;
/** Redact windows overlap, so PII across a window edge is seen whole once. */
const WINDOW_OVERLAP_CHARS = 200;
export const CONCURRENCY = 4;
export const SUMMARY_BUDGET_CHARS = 12_000;

export interface FilterStats {
  filter: string;
  /** Requests sent (windows for redact-model, segments for summary). */
  asked: number;
  /** Segments emptied by this filter. */
  dropped: number;
  latencyMs: number;
  /** A reason token when the filter failed. */
  fallbackReason?: string;
}

export interface FilterOptions {
  onStats?: (stats: FilterStats) => void;
}

const REDACT_KINDS = new Set<SegmentKind>([
  "title",
  "user",
  "assistant",
  "toolOutput",
]);
const SUMMARY_KINDS = new Set<SegmentKind>(["user", "assistant", "toolOutput"]);

export const REDACT_INSTRUCTIONS =
  "The text contains a secret, credential, API key, password, or personal " +
  "data (name with contact details, email, phone, address, ID number) that " +
  "is not already masked as [REDACTED:...]";

const SUMMARY_LEVELS = [
  "Irrelevant to understanding the session",
  "Minor detail",
  "Useful context",
  "Essential to understanding the session",
];

function kindsOf(
  segments: string[],
  meta: { kinds: SegmentKind[] } | undefined,
): SegmentKind[] {
  if (!meta?.kinds || meta.kinds.length !== segments.length) {
    throw new Error("invalid");
  }
  return meta.kinds;
}

/**
 * The part of a segment the export can show: a tool output renders only its
 * first TOOL_OUTPUT_MAX_CHARS, so the model never sees (or counts) the rest.
 * The filter still keeps or empties the whole segment.
 */
function rendered(seg: string, kind: SegmentKind): string {
  return kind === "toolOutput" ? seg.slice(0, TOOL_OUTPUT_MAX_CHARS) : seg;
}

/** One request; throws an Error whose message is the fail reason only. */
async function ask(
  request: DecisionRequest,
  signal: AbortSignal,
): Promise<Record<string, Answer>> {
  const result = await decide(request, { point: "export", signal });
  if (!result.ok) throw new Error(result.reason);
  return result.answers;
}

/** Run `body`, then report stats on success and failure alike. */
async function withStats(
  name: string,
  opts: FilterOptions,
  body: (stats: FilterStats) => Promise<string[]>,
): Promise<string[]> {
  const started = performance.now();
  const stats: FilterStats = {
    filter: name,
    asked: 0,
    dropped: 0,
    latencyMs: 0,
  };
  try {
    return await body(stats);
  } catch (err) {
    stats.fallbackReason = err instanceof Error ? err.message : "error";
    throw err;
  } finally {
    stats.latencyMs = Math.round(performance.now() - started);
    opts.onStats?.(stats);
  }
}

/** Empty every segment the model flags as holding a secret or PII. */
export function redactModelFilter(
  cfg: DecisionConfig,
  opts: FilterOptions = {},
): ExtraFilter {
  const name = "redact-model";
  return {
    name,
    apply: (segments, signal, meta) =>
      withStats(name, opts, async (stats) => {
        const kinds = kindsOf(segments, meta);
        const jobs: Array<(s: AbortSignal) => Promise<number>> = [];
        const owner: number[] = [];
        segments.forEach((full, i) => {
          if (!REDACT_KINDS.has(kinds[i]) || full === "") return;
          const seg = rendered(full, kinds[i]);
          const stride = WINDOW_CHARS - WINDOW_OVERLAP_CHARS;
          // A window starts only where the previous one leaves new text.
          for (
            let w = 0;
            w === 0 || w * stride + WINDOW_OVERLAP_CHARS < seg.length;
            w++
          ) {
            const id = `w${i}_${w}`;
            const state = seg.slice(w * stride, w * stride + WINDOW_CHARS);
            owner.push(i);
            jobs.push(async (s) => {
              const answers = await ask(
                {
                  state,
                  questions: {
                    [id]: { type: "noul", instructions: REDACT_INSTRUCTIONS },
                  },
                },
                s,
              );
              const noul = answers[id];
              if (typeof noul !== "number") throw new Error("bad-response");
              return noul;
            });
          }
        });
        stats.asked = jobs.length;
        const scores = await runPool(jobs, {
          concurrency: CONCURRENCY,
          signal,
        });
        const flagged = new Set<number>();
        scores.forEach((p, j) => {
          if (p >= cfg.redactThreshold) flagged.add(owner[j]);
        });
        stats.dropped = flagged.size;
        return segments.map((seg, i) => (flagged.has(i) ? "" : seg));
      }),
  };
}

/** Keep the most important content segments within SUMMARY_BUDGET_CHARS. */
export function summaryFilter(opts: FilterOptions = {}): ExtraFilter {
  const name = "summary";
  return {
    name,
    apply: (segments, signal, meta) =>
      withStats(name, opts, async (stats) => {
        const kinds = kindsOf(segments, meta);
        const parts = segments
          .map((_, i) => i)
          .filter((i) => SUMMARY_KINDS.has(kinds[i]) && segments[i] !== "");
        // A part over the whole budget can never be kept: never ask about it.
        const candidates = parts.filter(
          (i) => rendered(segments[i], kinds[i]).length <= SUMMARY_BUDGET_CHARS,
        );
        const jobs = candidates.map((i) => async (s: AbortSignal) => {
          const id = `s${i}`;
          const answers = await ask(
            {
              state: rendered(segments[i], kinds[i]).slice(0, WINDOW_CHARS),
              questions: {
                [id]: {
                  type: "score",
                  instructions:
                    "How important this part is to understanding the session",
                  criteria: SUMMARY_LEVELS,
                },
              },
            },
            s,
          );
          const a = answers[id];
          if (typeof a !== "object" || !("score" in a)) {
            throw new Error("bad-response");
          }
          return a.score;
        });
        stats.asked = jobs.length;
        const scores = await runPool(jobs, {
          concurrency: CONCURRENCY,
          signal,
        });

        // Highest score first, earlier segment first on ties.
        const ranked = candidates
          .map((i, j) => ({ i, score: scores[j] }))
          .sort((a, b) => b.score - a.score || a.i - b.i);
        const keep = new Set<number>();
        let used = 0;
        for (const { i } of ranked) {
          const size = rendered(segments[i], kinds[i]).length;
          if (used + size > SUMMARY_BUDGET_CHARS) continue;
          used += size;
          keep.add(i);
        }
        stats.dropped = parts.length - keep.size;
        return segments.map((seg, i) =>
          SUMMARY_KINDS.has(kinds[i]) && !keep.has(i) ? "" : seg,
        );
      }),
  };
}

/** Run `a`, then `b` on a's output. */
export function composeFilters(a: ExtraFilter, b: ExtraFilter): ExtraFilter {
  return {
    name: `${a.name}+${b.name}`,
    apply: async (segments, signal, meta) =>
      b.apply(await a.apply(segments, signal, meta), signal, meta),
  };
}
