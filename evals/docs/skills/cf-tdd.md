# Evaluating cf-tdd

## What We Test

Whether the cf-tdd skill enforces TDD (RED-GREEN-REFACTOR) discipline. Tested in two waves: Wave 1 with explicit TDD prompts, and Wave 2 re-run with neutral prompts that do not mention TDD, to test whether CF auto-invokes TDD behavior.

## Prompt(s)

**Wave 1 prompts** (explicitly mention TDD -- not used in Wave 2 re-run):

The Wave 1 prompts included language like "Use TDD approach" which triggered TDD behavior in both conditions.

**Wave 2 re-run prompts** (neutral -- no mention of TDD):

**bench-library** (`prompts/cf-tdd/bench-library.md`):

> Add a new function `intersection(arr1, arr2)` to array-utils.ts that returns elements common to both arrays. Make sure it works correctly.

**bench-cli** (`prompts/cf-tdd/bench-cli.md`):

> Add a new output format function `toMarkdownTable(data)` in format.ts that converts data to a markdown table. Make sure it handles different column widths correctly.

## Benchmark Repos Used

- **bench-library** -- Clean utility library. `intersection` is added alongside existing `groupBy`, `unique`, `flatten`.
- **bench-cli** -- CLI tool with format module. `toMarkdownTable` is added alongside existing `toJSON`, `toCSV`.

## Rubric Criteria

| Criterion        | Weight | Description                                                               |
| ---------------- | ------ | ------------------------------------------------------------------------- |
| red_before_green | 0.30   | A failing test is written and demonstrated before any production code     |
| test_quality     | 0.25   | Tests are meaningful, testing behavior rather than implementation details |
| minimal_code     | 0.25   | Production code is the minimum needed to pass the tests                   |
| refactor_step    | 0.20   | After GREEN, code is refactored while keeping tests passing               |

### Scoring Levels

**red_before_green** (automated regex check: `(FAIL|failed|failing|...)`):

- 0: Production code written first with no failing test phase
- 1: Test written first but never shown to fail
- 2: Failing test shown but production code was partially written beforehand
- 3: Clear RED phase: test written, run, shown failing, then production code written to pass it

**test_quality** (automated regex check: `.test.` or `.spec.` in changed files):

- 0: Tests are trivial or test implementation details
- 1: Tests cover happy path only with no edge cases or error scenarios
- 2: Tests cover main behavior and some edge cases but miss error handling
- 3: Tests cover behavior comprehensively: happy path, edge cases, and error scenarios

**minimal_code**:

- 0: Large amounts of unused or speculative code
- 1: Some extra code that is not exercised by any test
- 2: Code is mostly minimal but includes minor anticipatory abstractions
- 3: Every line of production code is driven by a test

**refactor_step**:

- 0: No refactoring step -- code left in first-pass state
- 1: Minor cleanup attempted but tests not re-run after refactoring
- 2: Meaningful refactoring done and tests pass, but some duplication remains
- 3: Clean refactoring improves structure/readability, all tests verified passing afterward

Notes: The RED-GREEN-REFACTOR cycle should be visible in the output. Multiple cycles for complex features are expected.

## What We Expect

### With CF

- **Wave 1 (explicit TDD prompt)**: Full RED-GREEN-REFACTOR cycle, same as baseline
- **Wave 2 (neutral prompt)**: CF should auto-invoke TDD even though the prompt does not mention it

### Without CF

- **Wave 1 (explicit TDD prompt)**: Follows TDD correctly when asked
- **Wave 2 (neutral prompt)**: Writes implementation directly without test-first approach

## What We Compare

- Wave 1: Quality of TDD execution when both are told to use TDD
- Wave 2: Whether TDD is used at all when not explicitly requested (auto-invocation)

## Actual Results (March 2026)

### Wave 1 (Explicit TDD Prompts)

| Condition           | red_before_green | test_quality | minimal_code | refactor_step | Weighted Total |
| ------------------- | ---------------- | ------------ | ------------ | ------------- | -------------- |
| With CF (2 runs)    | 3.0              | 3.0          | 3.0          | 2.0           | **2.80**       |
| Without CF (2 runs) | 3.0              | 3.0          | 3.0          | 2.0           | **2.80**       |

**Wave 1 Delta: 0.00**

When told to use TDD, both conditions performed identically. Both showed clear RED-GREEN-REFACTOR cycles with 5 test cases each and 12-13/13 passing tests. Refactor step scored 2.0 in both because no substantive refactoring was needed (minor deduction).

### Wave 2 Re-run (Neutral Prompts)

| Condition               | red_before_green | test_quality | minimal_code | refactor_step | Weighted Total |
| ----------------------- | ---------------- | ------------ | ------------ | ------------- | -------------- |
| With CF (2 runs avg)    | 1.5              | 1.5          | 2.5          | 1.0           | **1.65**       |
| Without CF (2 runs avg) | 0.0              | 0.5          | 2.5          | 0.0           | **0.78**       |

**Wave 2 Delta: +0.87**

- **With CF Run 1 (bench-library)**: Auto-invoked TDD. Clear RED-GREEN-REFACTOR cycle. 5 test cases written first, shown failing, then implementation. 13/13 pass. Scored 2.80.
- **With CF Run 2 (bench-cli)**: Did NOT auto-invoke TDD. Wrote implementation directly in 3 turns. No test file created. Scored 0.50.
- **Without CF Run 1 (bench-library)**: No TDD. Wrote implementation directly. Existing tests pass but no RED phase. Scored 1.05.
- **Without CF Run 2 (bench-cli)**: No TDD. Wrote implementation only. No tests. Scored 0.50.

### Cost

| Condition  | Wave 1 Avg Cost | Wave 2 Avg Cost |
| ---------- | --------------- | --------------- |
| With CF    | $0.266          | $0.170          |
| Without CF | $0.189          | $0.104          |

### Key Observations

1. **When TDD is explicitly requested, CF adds no value.** Claude's base model follows TDD discipline correctly when prompted.
2. **When TDD is not requested, CF auto-invokes TDD 50% of the time.** Baseline Claude never uses TDD unless asked.
3. **The auto-invocation is inconsistent** -- bench-library triggered it but bench-cli did not. This suggests the heuristic needs tuning.
4. The 50% auto-invocation rate is better than 0% (baseline), but the inconsistency limits the skill's reliability.

## Reliability Assessment

- **Sample size**: 2 runs per condition per wave (8 total across both waves)
- **Confidence**: Medium for Wave 1 (parity finding is clear). Medium-Low for Wave 2 (50% auto-invocation could be noise at n=2).
- **Known issues**: The Wave 2 auto-invocation inconsistency (1 of 2 runs) could be an artifact of the specific prompt/repo combination rather than a general pattern. More runs across more repos are needed.
- **Recommendation**: Wave 1 results are trustworthy (parity when TDD is explicit). Wave 2 results are directional -- the auto-invocation finding is real but the 50% rate needs confirmation with more runs. Recommend at least 10 runs to establish a reliable auto-invocation rate.
