# Evaluating cf-fix

## What We Test

Whether the cf-fix skill produces higher-quality bug fixes than baseline Claude. The key differentiator is not whether the bug gets fixed (both conditions fix it), but whether the fix includes tests, verification, and proper documentation of the root cause.

## Prompt(s)

**bench-webapp** (`prompts/cf-fix/bench-webapp.md`):

> There's a bug in the API client: when fetching a user that doesn't exist (404 response), the function doesn't handle it properly. Fix this bug.

**bench-cli** (`prompts/cf-fix/bench-cli.md`):

> The sortByField function in transform.ts crashes when some items have null values in the sort field. Fix this bug.

## Benchmark Repos Used

- **bench-webapp** -- Has a real bug: `fetchUser` does not handle 404 responses, causing unhandled errors
- **bench-cli** -- Has a real bug: `sortByField` crashes with "Cannot read properties of null" when sort field values are null

Both bugs are genuine issues planted in the benchmark code that can be reproduced and verified.

## Rubric Criteria

| Criterion                 | Weight | Description                                                              |
| ------------------------- | ------ | ------------------------------------------------------------------------ |
| root_cause_identification | 0.30   | Correctly identifies the root cause rather than treating symptoms        |
| fix_correctness           | 0.30   | The applied fix actually resolves the bug without introducing new issues |
| test_coverage             | 0.20   | A test is added that reproduces the bug and verifies the fix             |
| no_regressions            | 0.20   | Existing tests still pass after the fix                                  |

### Scoring Levels

**root_cause_identification**:

- 0: Root cause not identified; fix addresses wrong issue entirely
- 1: Treats a symptom rather than the underlying cause
- 2: Identifies root cause but explanation is incomplete or partially wrong
- 3: Precisely identifies and explains the root cause with supporting evidence

**fix_correctness**:

- 0: Fix does not resolve the bug or makes it worse
- 1: Fix partially resolves the bug but leaves edge cases broken
- 2: Fix resolves the bug but the approach is fragile or suboptimal
- 3: Fix cleanly resolves the bug with a robust, maintainable approach

**test_coverage** (automated check: test files exist in changed files):

- 0: No test added for the bug fix
- 1: Test added but does not actually reproduce the original bug
- 2: Test reproduces the bug but misses important edge cases
- 3: Test clearly reproduces the bug, verifies the fix, and covers edge cases

**no_regressions** (automated check: `npm test` exit code):

- 0: Multiple existing tests now fail
- 1: One or two existing tests fail due to the change
- 2: All tests pass but fix changes behavior in untested areas
- 3: All existing tests pass and fix is scoped tightly to the bug

Notes: TDD approach expected: write failing test first, then fix.

## What We Expect

### With CF

- Precise root cause identification with file:line references
- Failing test written first (RED), then fix applied (GREEN)
- Regression check by running full test suite
- Automatic verification/review step after fixing
- Before/after comparison showing the bug and fix

### Without CF

- Bug gets fixed correctly (Claude is good at this)
- No test written -- fix applied directly without verification
- No regression check shown
- Brief summary without before/after comparison

## What We Compare

- Whether tests are written for the fix (binary: yes/no)
- Whether the test suite is run to check for regressions
- Depth of root cause explanation
- Whether verification happens after fixing

## Actual Results (March 2026)

### Scores

| Condition           | root_cause_identification | fix_correctness | test_coverage | no_regressions | Weighted Total |
| ------------------- | ------------------------- | --------------- | ------------- | -------------- | -------------- |
| With CF (2 runs)    | 3.0                       | 3.0             | 3.0           | 3.0            | **3.00**       |
| Without CF (2 runs) | 2.0                       | 3.0             | 0.0           | 2.0            | **1.90**       |

**Delta: +1.10 (largest delta across all skills)**

### Cost

| Condition  | Avg Cost | Avg Time |
| ---------- | -------- | -------- |
| With CF    | $0.423   | 77s      |
| Without CF | $0.096   | 39s      |
| Cost ratio | 4.41x    |          |

### Key Observations

1. **This is the most important finding in the entire eval suite.** The quality gap is large (+1.10), consistent across both repos, and driven by a binary difference: CF writes tests, baseline does not.
2. **With CF Run 1 (bench-webapp)**: Fixed fetchUser (404 returns `undefined`, other errors throw). Added 2 test cases. 7/7 pass. Ran cf-verification. Detailed before/after table.
3. **With CF Run 2 (bench-cli)**: Fixed sortByField (null guard before `String()`, null/undefined sorted to end). Added 2 tests. 9/9 pass. Ran cf-review automatically.
4. **Without CF (both runs)**: Fixed the actual bugs correctly. No evidence of writing test cases or running the test suite. Root cause identified but not with the same depth.
5. **Test coverage on fixes: 100% (with CF) vs 0% (without CF).** This is the single most compelling binary metric.
6. The 4.41x cost ratio is the highest, but the extra cost buys real verification (running tests, auto-review).

## Reliability Assessment

- **Sample size**: 2 runs per condition (4 total)
- **Confidence**: High
- **Known issues**: The finding is binary (tests written vs not written), which makes it robust even at small sample sizes. Both without-CF runs consistently skipped tests, and both with-CF runs consistently wrote them.
- **Recommendation**: Results are highly trustworthy. The test-writing gap is the most defensible finding in the eval suite. More runs would confirm but are unlikely to change the conclusion.
