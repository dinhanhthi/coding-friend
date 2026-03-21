# Evaluating cf-implementer

## What We Test

Whether the cf-implementer agent produces higher-quality TDD implementations than baseline Claude. We measure TDD compliance (RED-GREEN-REFACTOR), code quality, test quality, and scope discipline.

## How Agents Are Tested

The cf-implementer agent is dispatched by skills that need implementation work done with TDD discipline. It was observed being dispatched in the cf-sys-debug evaluation and is also used by cf-fix and cf-tdd.

## Rubric Criteria

| Criterion       | Weight | Description                                                        |
| --------------- | ------ | ------------------------------------------------------------------ |
| tdd_compliance  | 0.30   | Implementation follows RED-GREEN-REFACTOR cycle                    |
| code_quality    | 0.25   | Production code is clean, follows conventions, and is maintainable |
| test_quality    | 0.25   | Tests are comprehensive, testing behavior over implementation      |
| minimal_changes | 0.20   | Changes are scoped to the task -- no unrelated modifications       |

### Scoring Levels

**tdd_compliance** (automated regex check: FAIL...PASS sequence):

- 0: No TDD -- production code written without tests or tests after the fact
- 1: Tests exist but clearly written after production code
- 2: RED-GREEN visible but REFACTOR step skipped
- 3: Full RED-GREEN-REFACTOR cycle with failing test shown, minimal code to pass, clean refactor

**code_quality**:

- 0: Obvious bugs, poor naming, or violates conventions
- 1: Works but has readability issues or does not follow existing patterns
- 2: Clean and follows conventions but could be more idiomatic
- 3: Exemplary -- follows project patterns, clean naming, proper error handling

**test_quality** (automated check: `npm test` exit code):

- 0: Tests are trivial or test implementation details
- 1: Tests cover happy path but miss error cases
- 2: Good coverage but some edge cases untested
- 3: Comprehensive: happy path, edge cases, error handling, boundary conditions

**minimal_changes**:

- 0: Significant unrelated changes mixed in
- 1: Some tangential changes not strictly required
- 2: Well-scoped but includes minor cleanup in touched files
- 3: Precisely scoped to the task with no unrelated modifications

Notes: Should follow a plan if one exists. Multiple RED-GREEN-REFACTOR cycles expected for complex features. Test files should be co-located per project convention.

## Evaluation Method

### Indirect (via skills)

The cf-implementer agent was observed in these eval runs:

- **cf-sys-debug with-CF**: The agent was dispatched to implement the fix for the `sortByField` null crash. Found root cause, applied fix with null guard, added 2 tests, 9/9 pass.
- **cf-fix with-CF**: The skill's fix workflow likely uses the implementer agent internally for test writing and fix application.
- **cf-tdd with-CF**: The TDD workflow relies on the implementer agent for the RED-GREEN-REFACTOR cycle.

From the cf-tdd Wave 2 re-run:

- Run 1 (bench-library): Full RED-GREEN-REFACTOR cycle. 5 test cases, Set-based implementation, clean refactor. 13/13 pass. Agent successfully enforced TDD.
- Run 2 (bench-cli): Agent was NOT dispatched (or TDD was not auto-invoked). Implementation written directly. No tests.

### Direct (if applicable)

No direct implementer agent evaluation was performed. The agent's quality signal comes from the downstream skill evaluations.

## What We Compare

- **With CF (agent dispatched)**: TDD-compliant implementation with failing tests shown before production code. Tests cover edge cases. Code follows project conventions.
- **Without CF (no agent)**: Direct implementation without TDD discipline. Code quality is often equivalent, but test coverage is lower and TDD process is not followed.

The strongest signal comes from cf-fix:

- With CF (implementer agent): test_coverage = 3.0, no_regressions = 3.0
- Without CF (no agent): test_coverage = 0.0, no_regressions = 2.0

This +3.0 gap in test_coverage is the implementer agent's most visible contribution.

## Reliability Assessment

- **Sample size**: 0 direct evaluations. Indirect signal from ~6 skill runs across cf-fix, cf-tdd, cf-sys-debug.
- **Confidence**: Medium (based on indirect evidence)
- **Known issues**: The agent's contribution is entangled with the calling skill's workflow. It is unclear whether the test-writing behavior comes from the agent itself or from the skill's instructions to the agent. The inconsistent TDD auto-invocation in cf-tdd Wave 2 (1 of 2 runs) suggests the agent dispatch is not reliable.
- **Recommendation**: Create direct implementer agent evaluations with explicit implementation tasks. Measure TDD compliance, code quality, and test coverage independently of the calling skill. Also investigate the inconsistent dispatch in cf-tdd to determine whether it is a skill-level or agent-level issue.
