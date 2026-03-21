# Evaluating cf-verification

## What We Test

Whether the cf-verification skill produces more thorough and accurate verification reports than baseline Claude. We measure gate coverage (tests, build, lint, format), false pass avoidance, report clarity, and actionability of failure remediation.

## Prompt(s)

**bench-webapp** (`prompts/cf-verification/bench-webapp.md`):

> Verify that the project is in a good state -- all tests pass, no lint errors, build succeeds.

## Benchmark Repos Used

- **bench-webapp** -- Has a staged duplicate `validatePhone` function that causes a compilation or test issue. Both conditions should detect and address this.

## Rubric Criteria

| Criterion           | Weight | Description                                                                |
| ------------------- | ------ | -------------------------------------------------------------------------- |
| all_checks_run      | 0.30   | All relevant verification checks are executed (tests, build, lint, format) |
| no_false_passes     | 0.35   | Does not report passing when there are actual failures                     |
| clear_report        | 0.20   | Verification results are presented in a clear, scannable format            |
| actionable_failures | 0.15   | When checks fail, the report provides actionable next steps                |

### Scoring Levels

**all_checks_run** (automated check: `npm test && npm run build && npm run lint`):

- 0: No verification checks run -- just claimed 'done'
- 1: Only one check run
- 2: Most checks run but one relevant check was skipped
- 3: All applicable checks run: tests, build, lint, and format

**no_false_passes**:

- 0: Reports all-clear when there are obvious failures
- 1: Reports passing but ignores warnings that indicate real problems
- 2: Correctly reports failures but mischaracterizes severity
- 3: Accurately reports all results -- failures, warnings, and passes -- with correct severity

**clear_report**:

- 0: Raw command output dumped with no summary
- 1: Some summary but hard to determine pass/fail status
- 2: Clear pass/fail for each check but missing failure details
- 3: Clear pass/fail status with concise failure details and suggested fixes

**actionable_failures**:

- 0: Failures reported with no guidance
- 1: Generic advice (e.g., 'fix the tests') without specifics
- 2: Specific failures identified but fix suggestions could be more actionable
- 3: Each failure includes specific error, affected file/line, and concrete fix suggestion

Notes: Verification is the final gate before claiming a task is done. The most critical criterion is no_false_passes.

## What We Expect

### With CF

- Run tests, build, lint, and format checks
- Detect the duplicate validatePhone function
- Fix the issue
- Report results clearly with pass/fail per check
- Provide actionable fix suggestions for any failures

### Without CF

- Same verification checks
- Same detection and fix of the duplicate
- Clear reporting

## What We Compare

- Number of verification checks run
- Accuracy of pass/fail reporting
- Whether the duplicate is detected and fixed
- Report structure and actionability

## Actual Results (March 2026)

### Scores

| Condition          | all_checks_run | no_false_passes | clear_report | actionable_failures | Weighted Total |
| ------------------ | -------------- | --------------- | ------------ | ------------------- | -------------- |
| With CF (1 run)    | 2              | 3               | 3            | 3                   | **2.70**       |
| Without CF (1 run) | 2              | 3               | 3            | 3                   | **2.70**       |

**Delta: 0.00**

### Cost

| Condition  | Cost   | Time |
| ---------- | ------ | ---- |
| With CF    | $0.166 | 32s  |
| Without CF | $0.118 | 36s  |
| Cost ratio | 1.4x   |      |

### Key Observations

1. Identical behavior. Both detected the duplicate `validatePhone` function, fixed it, ran tests (19/19 pass) and TypeScript check, and produced clear reports.
2. Both scored 2 on all_checks_run because neither ran lint or format checks -- only tests + TypeScript compilation. The rubric expects all four gates.
3. Both scored 3 on no_false_passes, clear_report, and actionable_failures -- accurately reporting the failure, providing a clear fix, and verifying the resolution.
4. The cf-verification skill did not add any additional verification steps beyond what baseline Claude performed.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Medium (parity finding is clear, but n=1)
- **Known issues**: Neither condition ran lint or format checks, suggesting both the skill and baseline could be improved. The parity result may indicate that cf-verification's value is in ensuring verification happens at all (rather than improving the quality when it does happen).
- **Recommendation**: Results suggest parity for this scenario. To better test cf-verification's value, use a scenario where baseline Claude might skip verification entirely (e.g., after a complex refactor where the user says "I think we're done"). The skill's value is in making verification automatic, not in making it better when it happens.
