# Evaluating cf-optimize

## What We Test

Whether the cf-optimize skill enforces structured optimization with before/after measurement. The skill's core value proposition is measurement discipline: measure baseline, identify bottleneck, optimize, measure again, compare.

## Prompt(s)

**bench-webapp** (`prompts/cf-optimize/bench-webapp.md`):

> The cache module (src/lib/cache.ts) has a performance issue -- expired entries are never cleaned up, causing memory to grow indefinitely. Optimize it.

## Benchmark Repos Used

- **bench-webapp** -- Has a real performance issue: the cache module never evicts expired entries, so memory grows without bound. The `size` property also counts expired entries.

## Rubric Criteria

| Criterion               | Weight | Description                                                            |
| ----------------------- | ------ | ---------------------------------------------------------------------- |
| baseline_measured       | 0.25   | Performance baseline is measured and recorded before any changes       |
| bottleneck_identified   | 0.25   | The actual performance bottleneck is identified with evidence          |
| improvement_measured    | 0.25   | Performance after optimization is measured using the same methodology  |
| before_after_comparison | 0.25   | Clear comparison showing the magnitude and significance of improvement |

### Scoring Levels

**baseline_measured** (automated regex check: `\d+(\.\d+)?\s*(ms|s|sec|MB|KB|GB|%|ops/s|req/s)`):

- 0: No baseline measurement taken -- optimization is blind
- 1: Baseline mentioned qualitatively (e.g., 'it was slow') but no numbers
- 2: Baseline measured but methodology is unclear or not reproducible
- 3: Clear baseline with specific numbers, methodology, and environment documented

**bottleneck_identified**:

- 0: No bottleneck analysis -- changes made based on guesswork
- 1: Bottleneck suspected but not verified with profiling or measurement
- 2: Bottleneck identified with some evidence but analysis could be deeper
- 3: Bottleneck precisely identified with profiling data or targeted measurements

**improvement_measured**:

- 0: No after-measurement -- improvement is assumed but not verified
- 1: After-measurement exists but uses different methodology than baseline
- 2: After-measurement uses same methodology but lacks statistical rigor
- 3: After-measurement uses identical methodology with multiple runs showing consistent improvement

**before_after_comparison**:

- 0: No comparison between before and after states
- 1: Comparison exists but only shows absolute numbers without percentage or context
- 2: Comparison shows both absolute and relative improvement but lacks context on significance
- 3: Comparison clearly shows absolute change, percentage improvement, and whether the gain is meaningful

Notes: An optimization that makes things worse should score 0 on improvement_measured regardless of methodology quality.

## What We Expect

### With CF

- Measure cache performance before changes (memory usage, lookup times, entry counts)
- Identify the bottleneck (expired entries never cleaned up)
- Apply fix (lazy eviction, periodic cleanup, or similar)
- Measure again with same methodology
- Show before/after comparison with numbers

### Without CF

- Identify the issue from code inspection
- Apply a reasonable fix
- Likely skip measurement entirely

## What We Compare

- Whether baseline performance is measured before changes
- Whether improvement is verified with measurement after changes
- Quality of before/after comparison
- Fix approach (both should be reasonable)

## Actual Results (March 2026)

### Scores

| Condition          | baseline_measured | bottleneck_identified | improvement_measured | before_after_comparison | Weighted Total |
| ------------------ | ----------------- | --------------------- | -------------------- | ----------------------- | -------------- |
| With CF (1 run)    | 0                 | 2                     | 0                    | 0                       | **0.50**       |
| Without CF (1 run) | 0                 | 2                     | 0                    | 0                       | **0.50**       |

**Delta: 0.00**

### Cost

| Condition  | Cost   | Time |
| ---------- | ------ | ---- |
| With CF    | $0.119 | 29s  |
| Without CF | $0.079 | 30s  |
| Cost ratio | 1.5x   |      |

### Key Observations

1. **Both conditions failed the rubric badly.** Neither measured baseline performance, neither measured improvement, neither provided before/after comparison with numbers.
2. Both correctly identified the bottleneck (expired entries not cleaned up) and applied reasonable fixes:
   - With CF: lazy eviction in `get()`, `size` cleanup
   - Without CF: lazy eviction in `get()`, periodic sweep in `set()` at 100+ entries
3. **The cf-optimize skill's core requirement -- structured measurement -- was not followed.** This is the most concerning finding for this skill. The skill is supposed to enforce "measure first" behavior, but it did not activate that discipline.
4. The without-CF approach (periodic sweep at 100+ entries) was arguably slightly more sophisticated, but both scored the same overall.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Low for comparing conditions (n=1). High for the finding that the skill failed to enforce measurement.
- **Known issues**: The skill may not have auto-invoked properly, or the prompt may not trigger the measurement workflow. This needs investigation at the skill level, not just more eval runs.
- **Recommendation**: Do not trust these results as a comparison of cf-optimize quality. The skill needs investigation -- its core value (measurement discipline) was never activated. Before running more evals, determine whether the skill's measurement enforcement mechanism is working at all.
