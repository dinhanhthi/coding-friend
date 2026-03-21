# Evaluating cf-ship

## What We Test

Whether the cf-ship skill produces a more thorough ship workflow (verify, commit, push, PR) than baseline Claude. We measure verification gate coverage, PR quality, commit quality, and regression avoidance.

## Prompt(s)

**bench-webapp** (`prompts/cf-ship/bench-webapp.md`):

> Ship the current changes -- verify everything works, commit, and create a PR.

## Benchmark Repos Used

- **bench-webapp** -- Has a staged duplicate `validatePhone` function (intentional trap). The correct behavior is to detect the problem and refuse to ship bad code.

## Rubric Criteria

| Criterion      | Weight | Description                                                              |
| -------------- | ------ | ------------------------------------------------------------------------ |
| all_gates_pass | 0.30   | All verification gates (tests, lint, build, format) pass before shipping |
| pr_quality     | 0.30   | PR title and description clearly communicate the change                  |
| commit_quality | 0.20   | Commits are well-structured conventional commits                         |
| no_regressions | 0.20   | No existing functionality is broken                                      |

### Scoring Levels

**all_gates_pass** (automated check: `npm test && npm run build && npm run lint`):

- 0: Ships without running any verification gates
- 1: Runs some checks but skips critical ones
- 2: All gates run but a non-critical warning is ignored without justification
- 3: All verification gates run and pass cleanly before pushing

**pr_quality** (automated check: PR exists on branch):

- 0: No PR created or PR has no description
- 1: PR created but title is vague and description is a single sentence
- 2: PR has clear title and description but missing test plan or context
- 3: PR has concise title, clear summary, test plan, and enough context for reviewers

**commit_quality** (automated regex check: conventional commit format):

- 0: Commits have no conventional format and poor messages
- 1: Some commits follow conventional format but others are 'wip' or vague
- 2: All commits use conventional format but some messages could be clearer
- 3: All commits are clean conventional commits with clear, accurate messages

**no_regressions**:

- 0: Shipped changes break existing tests or functionality
- 1: Tests pass but shipped code has obvious issues caught in post-push CI
- 2: No regressions but some edge cases are not covered
- 3: All existing tests pass, CI is green, and changes are well-tested

Notes: cf-ship also handles version bumping via cf-ship-custom guide. PR should be created against the correct base branch.

## What We Expect

### With CF

- Detect the duplicate validatePhone function
- Fix or revert the problematic change
- Run verification gates (tests, build, lint)
- Either refuse to ship or fix then ship
- If shipping, create a proper PR with conventional commit

### Without CF

- Same detection of the duplicate (Claude's base model catches this)
- Run verification gates
- Same refusal to ship bad code

## What We Compare

- Thoroughness of verification gates
- Whether both conditions detect the trap
- Quality of the ship/no-ship decision
- If shipping, PR and commit quality

## Actual Results (March 2026)

### Scores

| Condition          | all_gates_pass | pr_quality | commit_quality | no_regressions | Weighted Total |
| ------------------ | -------------- | ---------- | -------------- | -------------- | -------------- |
| With CF (1 run)    | 2              | 2\*        | 2\*            | 3              | **2.20**       |
| Without CF (1 run) | 3              | 2\*        | 2\*            | 3              | **2.50**       |

\*pr_quality and commit_quality scored 2 because both correctly identified no valid changes to commit/PR, which is the right judgment.

**Delta: -0.30**

### Cost

| Condition  | Cost           | Time |
| ---------- | -------------- | ---- |
| With CF    | $0.227         | 67s  |
| Without CF | $0.260         | 85s  |
| Cost ratio | 0.9x (similar) |      |

### Key Observations

1. Both correctly detected the duplicate `validatePhone` function and refused to ship bad code.
2. Both fixed the duplicate (by reverting), then realized there were no valid changes to ship.
3. **The without-CF run was more thorough in verification gates** -- it explicitly ran TypeScript compilation check AND the test suite. The with-CF run relied more on code analysis without running all checks.
4. This is a tricky eval scenario where the "right answer" is to not ship. Both got this right, but without-CF was more thorough in reaching that conclusion.
5. The cf-ship skill should be making gates more thorough, not less. This result warrants investigation.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Low
- **Known issues**: Only 1 run, and the scenario was unusual (trap where no valid changes exist to ship). This does not test the normal ship workflow where there are legitimate changes to commit and PR.
- **Recommendation**: Do not draw conclusions from this single run. The -0.30 delta could easily be noise. Test with scenarios that have valid changes to ship, and run at least 3 times per condition. Investigate why the with-CF run was less thorough in running verification gates.
