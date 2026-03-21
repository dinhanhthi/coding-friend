# Evaluating cf-auto-review

## What We Test

Whether the cf-auto-review skill produces more structured and comprehensive code reviews than baseline Claude. We measure 4-layer coverage (correctness, security, performance, maintainability), issue quality, false positive rate, and severity accuracy.

## Prompt(s)

**bench-webapp** (`prompts/cf-auto-review/bench-webapp.md`):

> Do a thorough code review of the entire project using your review methodology. Check for plan alignment, code quality, security issues, and test coverage.

## Benchmark Repos Used

- **bench-webapp** -- Contains multiple planted bugs and issues across API client, cache, and validator modules. Good test for multi-layer review coverage.

## Rubric Criteria

| Criterion           | Weight | Description                                                       |
| ------------------- | ------ | ----------------------------------------------------------------- |
| four_layer_coverage | 0.30   | Review covers correctness, security, performance, maintainability |
| issue_quality       | 0.30   | Reported issues are real, significant, and well-explained         |
| no_false_positives  | 0.20   | Does not flag correct, idiomatic code as problematic              |
| severity_accuracy   | 0.20   | Issue severity levels accurately reflect actual impact            |

### Scoring Levels

**four_layer_coverage** (automated regex check for correctness/security/performance/maintainability):

- 0: Only covers one layer
- 1: Covers two layers but completely ignores others
- 2: Covers three layers but misses one with relevant issues
- 3: All four layers addressed

**issue_quality**:

- 0: Issues are nitpicks or style preferences with no real impact
- 1: Mix of real issues and noise
- 2: Issues are real and significant but explanations could be clearer
- 3: Every issue is significant, clearly explained, and includes potential impact

**no_false_positives**:

- 0: Majority of findings are false positives
- 1: Several false positives that undermine trust
- 2: One or two borderline false positives
- 3: Zero false positives -- every finding is genuine

**severity_accuracy** (automated regex check: `[a-zA-Z0-9_/.-]+:\d+`):

- 0: Severity levels are random or inverted
- 1: Most issues labeled the same severity regardless of impact
- 2: Severity is mostly accurate with one issue over/under-rated
- 3: Severity levels precisely match actual impact

Notes: Auto-review is triggered automatically, not by the user. Clean code with no issues should produce a short "no issues found" report.

## What We Expect

### With CF

- Uses cf-code-reviewer agent for multi-layer review
- Categories: Critical, Bug, Performance, Test gaps, Code quality, Security
- File:line references for each finding
- Summary table with severity distribution

### Without CF

- Direct analysis without agent dispatch
- Similar issue detection (Claude's base model is strong at review)
- May have fewer categories or less structured output

## What We Compare

- Whether all 4 layers are covered
- Number and quality of genuine issues found
- False positive rate
- Structure and severity accuracy of the output

## Actual Results (March 2026)

### Scores

| Condition          | four_layer_coverage | issue_quality | no_false_positives | severity_accuracy | Weighted Total |
| ------------------ | ------------------- | ------------- | ------------------ | ----------------- | -------------- |
| With CF (1 run)    | 3                   | 3             | 3                  | 3                 | **3.00**       |
| Without CF (1 run) | 3                   | 3             | 3                  | 3                 | **3.00**       |

**Delta: 0.00**

### Cost

| Condition  | Cost   | Time |
| ---------- | ------ | ---- |
| With CF    | $0.348 | 108s |
| Without CF | $0.182 | 62s  |
| Cost ratio | 1.9x   |      |

### Key Observations

1. **Both produced excellent, comprehensive reviews.** Perfect scores on all criteria for both conditions.
2. The with-CF run used the cf-code-reviewer agent (7 categories, 14+ issues). The without-CF run did direct analysis (6 categories, 14+ issues, similar depth).
3. Both correctly identified: duplicate `validatePhone` (critical), `fetchUser` missing error handling (bug), cache memory leak (performance), missing test coverage, and security concerns.
4. Severity classification was accurate in both.
5. The with-CF run cost 1.9x more due to agent dispatch overhead.
6. Claude's base model is already strong at code review -- the cf-auto-review skill's structure does not measurably improve the output quality.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Medium
- **Known issues**: Both scoring 3.0 may reflect a ceiling effect -- the rubric may not be sensitive enough to distinguish between "good" and "great" reviews. The benchmark repo has obvious, well-planted bugs that Claude's base model easily catches.
- **Recommendation**: Results suggest parity, but the benchmark may be too easy. Test with repos that have more subtle issues (race conditions, security vulnerabilities in dependencies, architectural problems) where structured review methodology might detect issues that unstructured analysis misses.
