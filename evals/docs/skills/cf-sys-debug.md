# Evaluating cf-sys-debug

## What We Test

Whether the cf-sys-debug skill produces more systematic debugging than baseline Claude. We measure root cause identification, adherence to the 4-phase methodology (observe, hypothesize, test, fix), fix correctness, and documentation.

## Prompt(s)

**bench-cli** (`prompts/cf-sys-debug/bench-cli.md`):

> The CLI tool crashes with "Cannot read properties of null" when processing certain JSON files. The error seems to come from the transform module but I can't figure out exactly where. Debug this systematically.

## Benchmark Repos Used

- **bench-cli** -- Has a real bug: `sortByField` in `transform.ts` crashes when items have null values in the sort field, causing "Cannot read properties of null" error.

## Rubric Criteria

| Criterion           | Weight | Description                                             |
| ------------------- | ------ | ------------------------------------------------------- |
| root_cause_found    | 0.35   | The actual root cause is identified, not just a symptom |
| systematic_approach | 0.25   | Debugging follows the 4-phase methodology               |
| fix_correctness     | 0.25   | The applied fix resolves the bug completely             |
| documented          | 0.15   | Bug investigation and resolution are documented         |

### Scoring Levels

**root_cause_found**:

- 0: Root cause not found -- debugging went in the wrong direction
- 1: A contributing factor is found but the actual root cause is missed
- 2: Root cause identified but explanation lacks precision or evidence
- 3: Root cause precisely identified with clear evidence (stack trace, reproduction, code reference)

**systematic_approach** (automated regex check: `(Phase|Step|Observe|Hypothes|Test|Fix|Diagnos)`):

- 0: Random trial-and-error with no systematic approach
- 1: Some structure but phases are mixed or skipped
- 2: Follows the 4-phase approach but one phase is superficial
- 3: Clear 4-phase progression: observation documented, hypothesis stated, tests run, fix applied

**fix_correctness**:

- 0: Fix does not resolve the bug
- 1: Fix partially resolves the bug but it can still be triggered
- 2: Fix resolves the bug but approach is fragile or has side effects
- 3: Fix cleanly resolves the bug with no side effects and handles edge cases

**documented** (automated regex check: `docs/(memory|learn)/.*\.md` in changed files):

- 0: No documentation of the debugging process
- 1: Brief mention of the fix but no documentation of the investigation
- 2: Investigation documented but missing reproduction steps or prevention advice
- 3: Full documentation: symptom, root cause, fix, reproduction steps, and prevention

Notes: Complex bugs may require multiple hypothesis-test cycles -- this is expected.

## What We Expect

### With CF

- Root-cause template enforced: "I believe the root cause is [X] because [evidence]" with file:line
- Rationalization Watch and Progress Signals guide the investigation
- Bisect Mode activated for "used to work, now broken" symptoms
- 4-phase debugging approach (observe, hypothesize, test, fix)
- After 3 failed hypotheses: structured Handoff Format (not prose escalation)
- Regression Guard: recurring bugs require regression test + explanatory commit message
- Root cause identified with file:line reference
- Fix applied with test cases
- Investigation documented to docs/memory/ or docs/learn/
- May dispatch cf-implementer agent for the fix

### Without CF

- Similar debugging effectiveness (Claude is good at finding bugs)
- Less structured approach but still finds the root cause
- Fix applied correctly
- Less likely to document the investigation

## What We Compare

- Whether the 4-phase methodology is visibly followed
- Speed and accuracy of root cause identification
- Fix quality and test coverage
- Whether the investigation is documented for future reference

## Actual Results (March 2026)

### Scores

| Condition          | root_cause_found | systematic_approach | fix_correctness | documented | Weighted Total |
| ------------------ | ---------------- | ------------------- | --------------- | ---------- | -------------- |
| With CF (1 run)    | 3                | 2                   | 3               | 2          | **2.60**       |
| Without CF (1 run) | 3                | 2                   | 3               | 2          | **2.60**       |

**Delta: 0.00**

### Cost

| Condition  | Cost   | Time |
| ---------- | ------ | ---- |
| With CF    | $0.286 | 435s |
| Without CF | $0.319 | 96s  |

### Key Observations

1. **Identical quality.** Both found the root cause (null values in `sortByField`), applied the same fix pattern (null guard + sort nulls to end), wrote 2 test cases, and verified 9/9 tests pass.
2. Both scored 2 on systematic_approach -- neither followed a visibly labeled 4-phase approach. The debugging was effective but not structured with explicit phase labels.
3. Both scored 2 on documented -- neither saved documentation to `docs/memory/` or `docs/learn/`.
4. The with-CF run used the cf-implementer agent for the fix. The without-CF run did direct debugging.
5. The with-CF run took significantly longer (435s vs 96s), likely due to agent dispatch overhead, but at similar cost.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Low
- **Known issues**: Only 1 run each, and both scored identically. The 4-phase methodology label check (regex for "Phase", "Observe", etc.) was not explicitly present in either output, suggesting the skill's methodology enforcement may not be strong enough. The large wall time difference (435s vs 96s) for the with-CF run is notable but could be an outlier.
- **Recommendation**: Results suggest parity, but n=1 is insufficient to confirm. The finding that neither condition visibly followed the 4-phase structure suggests the cf-sys-debug skill's methodology enforcement needs strengthening. Run more trials and investigate why the 4-phase labels are not appearing in output.
