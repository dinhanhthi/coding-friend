# Evaluating cf-review

## What We Test

Whether the cf-review skill produces more structured, comprehensive, and actionable code reviews than baseline Claude. We measure issue detection, actionability (file:line references), false positive rate, and coverage breadth across logic, security, performance, and style.

## Prompt(s)

**bench-webapp** (`prompts/cf-review/bench-webapp.md`):

> Review the code in this project. Focus on the API client (src/lib/api.ts), cache (src/lib/cache.ts), and validator (src/lib/validator.ts). Report any bugs, code quality issues, or potential improvements.

**bench-cli** (`prompts/cf-review/bench-cli.md`):

> Review the code in this project. Focus on the transform module (src/transform.ts) and format module (src/format.ts). Report any bugs, code quality issues, or improvements.

## Benchmark Repos Used

- **bench-webapp** -- Contains planted bugs: duplicate `validatePhone` function, `fetchUser` missing error handling, cache memory leak (expired entries never cleaned up), `size` counting expired entries
- **bench-cli** -- Contains planted bugs: `sortByField` null crash, missing CSV quote escaping, dead types

These repos were specifically designed with known issues so we can measure detection rates.

## Rubric Criteria

| Criterion           | Weight | Description                                                                    |
| ------------------- | ------ | ------------------------------------------------------------------------------ |
| issue_detection     | 0.30   | Identifies real bugs, logic errors, and security issues                        |
| actionability       | 0.25   | Findings include specific, implementable suggestions with file:line references |
| false_positive_rate | 0.20   | Avoids flagging correct code as problematic                                    |
| coverage            | 0.25   | Review covers logic, security, performance, and style                          |

### Scoring Levels

**issue_detection**:

- 0: Misses all significant issues present in the code
- 1: Catches only surface-level issues (formatting, naming) but misses real bugs
- 2: Catches most important issues but misses subtle logic or edge-case bugs
- 3: Identifies all significant bugs, logic errors, and security concerns

**actionability** (automated regex check: `[a-zA-Z0-9_/.-]+:\d+`):

- 0: Findings are vague complaints with no location or fix suggestion
- 1: Some findings have locations but suggestions are unclear or impractical
- 2: Most findings include file:line refs and reasonable fix suggestions
- 3: Every finding has precise file:line references with clear, implementable fix suggestions

**false_positive_rate**:

- 0: More than half of reported issues are false positives
- 1: Several false positives that waste developer time
- 2: At most one or two borderline false positives
- 3: Zero false positives -- every reported issue is a genuine concern

**coverage** (automated regex check: `(Summary|Findings|Issues|Recommendations)`):

- 0: Only covers one dimension (e.g., only style or only logic)
- 1: Covers two dimensions but ignores others with clear issues
- 2: Covers most dimensions but missing one area with notable concerns
- 3: Comprehensive coverage across logic, security, performance, and style

Notes: Review output should be structured with clear sections. Severity levels (critical/warning/info) should be accurate. Small PRs naturally have fewer findings.

## What We Expect

### With CF

- Structured review with severity categorization (Critical/Important/Suggestion)
- File:line references for every finding
- Code fix suggestions alongside each issue
- Summary table or overview section
- Coverage across all four dimensions
- Zero false positives

### Without CF

- Claude finds many of the same bugs (base model is strong at code analysis)
- Output structure is less consistent -- sometimes structured, sometimes prose
- May miss subtle issues or have less systematic coverage
- File references may be less precise

## What We Compare

- Number of real issues detected (recall)
- Precision of file:line references
- Output structure consistency (severity labels, summary tables)
- False positive rate
- Coverage breadth across logic/security/performance/style

## Actual Results (March 2026)

### Scores

| Condition           | issue_detection | actionability | false_positive_rate | coverage | Weighted Total |
| ------------------- | --------------- | ------------- | ------------------- | -------- | -------------- |
| With CF (2 runs)    | 3.0             | 3.0           | 3.0                 | 3.0      | **3.00**       |
| Without CF (2 runs) | 2.5             | 2.5           | 2.5                 | 2.5      | **2.53**       |

**Delta: +0.47**

### Cost

| Condition  | Avg Cost | Avg Time |
| ---------- | -------- | -------- |
| With CF    | $0.275   | 67s      |
| Without CF | $0.104   | 33s      |
| Cost ratio | 2.64x    |          |

### Key Observations

1. **With CF Run 1 (bench-webapp)**: Found 10 issues -- 2 critical (duplicate validatePhone, fetchUser error handling), 4 important (cache memory leak, size counting expired, null guards, HTTP/2 statusText), 4 suggestions (missing delete(), test gaps). Structured with severity labels and review banner.
2. **With CF Run 2 (bench-cli)**: Found 2 critical (sortByField null crash, CSV quote escaping). Structured output with review banner.
3. **Without CF Run 1 (bench-webapp)**: Found 5 issues but missed HTTP/2 statusText issue and test coverage gaps. Less structured -- no severity labels, no summary table.
4. **Without CF Run 2 (bench-cli)**: Strong performance -- found 8 issues including numeric sort edge case. Had one borderline false positive (table separator alignment).
5. CF's biggest advantage is **consistent structured output**, not just issue detection.

## Reliability Assessment

- **Sample size**: 2 runs per condition (4 total)
- **Confidence**: Medium
- **Known issues**: Small sample size means the perfect 3.0 score for with-CF could regress on additional runs. The without-CF Run 2 was quite strong (2.80), suggesting baseline variance is high.
- **Recommendation**: Results are directionally trustworthy. The structural improvement (severity labels, file:line refs, summary tables) is objectively verifiable and consistent. The issue detection advantage may narrow with more runs. Recommend 5+ runs to confirm.
