# Evaluating cf-code-reviewer

## What We Test

Whether the cf-code-reviewer agent produces more thorough, structured, and actionable code reviews than baseline Claude's direct analysis. We measure issue detection, precision (low false positives), severity accuracy, and actionability of fix suggestions.

## How Agents Are Tested

The cf-code-reviewer agent is dispatched by cf-review and cf-auto-review skills. It performs multi-layer code review covering correctness, security, performance, and maintainability.

## Rubric Criteria

| Criterion         | Weight | Description                                                          |
| ----------------- | ------ | -------------------------------------------------------------------- |
| issue_detection   | 0.30   | Detects real bugs, security issues, and logic errors                 |
| precision         | 0.25   | Low false positive rate -- reported issues are genuine               |
| severity_accuracy | 0.20   | Issue severity ratings accurately reflect real-world impact          |
| actionability     | 0.25   | Each issue includes specific fix suggestion with file:line reference |

### Scoring Levels

**issue_detection**:

- 0: Misses all known issues seeded in the test code
- 1: Finds only obvious surface issues but misses logic bugs
- 2: Finds most significant issues but misses subtle bugs or security concerns
- 3: Finds all significant issues including subtle logic errors and security vulnerabilities

**precision**:

- 0: More than half of reported issues are false positives
- 1: Several false positives that waste triage time
- 2: One or two borderline false positives
- 3: Every reported issue is genuine -- zero false positives

**severity_accuracy**:

- 0: Severity ratings are random or all the same level
- 1: Some effort but critical issues marked as minor or vice versa
- 2: Mostly accurate with one issue mis-rated
- 3: Severity ratings precisely match actual risk and impact

**actionability** (automated regex check: `[a-zA-Z0-9_/.-]+:\d+`):

- 0: Vague observations with no file references
- 1: Issues reference files but lack line numbers or fix suggestions
- 2: Most issues have file:line refs and suggestions but some are vague
- 3: Every issue has precise file:line reference with concrete fix suggestion

Notes: Multi-layer review should cover correctness, security, performance, and maintainability. For clean code, "no significant issues" is better than fabricated findings.

## Evaluation Method

### Indirect (via skills)

The cf-code-reviewer agent was dispatched in these eval runs:

**cf-review (Wave 1)**:

- With-CF Run 1 (bench-webapp): Agent found 10 issues across 3 severity levels. 2 critical, 4 important, 4 suggestions. Structured output with review banner. Scored 3.0 across all criteria.
- With-CF Run 2 (bench-cli): Agent found 2 critical issues with structured output. Scored 3.0.

**cf-auto-review (Wave 2)**:

- With-CF Run 1 (bench-webapp): Agent used. 7 categories, 14+ issues. Scored 3.0 across all criteria.

In all three runs where the agent was dispatched, it achieved perfect 3.0 scores on every criterion.

**Without CF (no agent)**:

- cf-review without-CF: Scored 2.53 average. Found most bugs but less structured output.
- cf-auto-review without-CF: Scored 3.00. Achieved same quality without the agent.

### Direct (if applicable)

No direct agent-only evaluation was performed. To test directly, provide code with known issues and measure detection rate, false positive rate, and output structure.

## What We Compare

- **With CF (agent dispatched)**: Consistently structured reviews with severity categorization (Critical/Important/Suggestion), file:line references for every finding, code fix suggestions, and summary tables. Always achieves 3.0 on the rubric.
- **Without CF (no agent)**: Quality varies. cf-review without-CF scored 2.25 and 2.80 (avg 2.53). cf-auto-review without-CF scored 3.00. The inconsistency is the key difference -- the agent provides consistent structure.

The agent's primary value is **consistency**, not capability. Claude's base model can achieve the same quality (cf-auto-review: 3.0 vs 3.0), but the code-reviewer agent ensures it always happens, while baseline Claude is variable.

## Reliability Assessment

- **Sample size**: 3 indirect evaluations (all with-CF). 3 without-CF comparisons.
- **Confidence**: Medium
- **Known issues**: The agent always scored 3.0, which may indicate a ceiling effect in the rubric or insufficient challenge in the benchmark repos. The planted bugs are obvious enough that Claude's base model catches most of them too. The cf-auto-review without-CF also scoring 3.0 weakens the case for agent superiority.
- **Recommendation**: Results suggest the agent adds consistency (always 3.0) but not capability (baseline can also reach 3.0). To better evaluate, test with repos containing more subtle issues that require systematic multi-layer analysis to detect. Also create direct agent evaluations independent of skill dispatch.
