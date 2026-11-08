/**
 * Run jobs with at most `concurrency` in flight; results keep job order. The
 * first failure aborts the rest (jobs see the abort through their signal) and
 * is rethrown. With `signal`, an outside abort stops new jobs from starting.
 */
export async function runPool<T>(
  jobs: Array<(signal: AbortSignal) => Promise<T>>,
  opts: { concurrency: number; signal?: AbortSignal },
): Promise<T[]> {
  const ac = new AbortController();
  const onAbort = (): void => ac.abort();
  if (opts.signal?.aborted) ac.abort();
  else opts.signal?.addEventListener("abort", onAbort, { once: true });
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      if (ac.signal.aborted) throw new Error("aborted");
      const i = next++;
      results[i] = await jobs[i](ac.signal);
    }
  };
  try {
    const n = Math.min(opts.concurrency, jobs.length);
    await Promise.all(
      Array.from({ length: n }, () =>
        worker().catch((err: unknown) => {
          ac.abort();
          throw err;
        }),
      ),
    );
    return results;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/** Nearest-rank percentile of `values` (0 when empty). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
