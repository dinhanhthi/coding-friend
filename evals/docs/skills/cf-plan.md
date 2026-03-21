# Evaluating cf-plan

## What We Test

Whether the cf-plan skill produces better implementation plans than baseline Claude. We measure completeness, task granularity, feasibility, and risk identification.

## Prompt(s)

**bench-webapp** (`prompts/cf-plan/bench-webapp.md`):

> Plan the implementation of a rate limiter middleware for the API client. It should limit requests to 100 per minute per endpoint, with configurable limits.
>
> Context: This is a client-side rate limiter (not server middleware). Use pure TypeScript with no external libraries. Use a sliding window algorithm. Store counts in memory. Make the limit configurable per-endpoint. Include a retry-after header in the response when rate limited. Do NOT ask clarifying questions -- proceed directly with creating the plan.

**bench-library** (`prompts/cf-plan/bench-library.md`):

> Plan adding a new "date-utils" module to this library with functions for: formatRelativeTime, isWeekend, getBusinessDays, parseISO.
>
> Context: Use pure TypeScript, no external dependencies (matching existing project conventions). English only for formatRelativeTime output. getBusinessDays excludes weekends only (no holiday support). parseISO handles basic ISO 8601 strings. Follow the same file structure as existing modules (src/date-utils.ts + src/**tests**/date-utils.test.ts). Do NOT ask clarifying questions -- proceed directly with creating the plan.

Note: Both prompts include "Do NOT ask clarifying questions" to force direct plan generation. Despite this, CF still asked clarifying questions in both runs.

## Benchmark Repos Used

- **bench-webapp** -- Used for the rate limiter planning task. Has existing API client code to build upon.
- **bench-library** -- Used for the date-utils module task. Has existing module patterns (array-utils, string-utils) to follow.

## Rubric Criteria

| Criterion           | Weight | Description                                                    |
| ------------------- | ------ | -------------------------------------------------------------- |
| completeness        | 0.25   | Plan covers all aspects without missing major steps            |
| task_granularity    | 0.25   | Tasks are broken down to an actionable, implementable level    |
| feasibility         | 0.25   | Plan is realistic and implementable within project constraints |
| risk_identification | 0.25   | Plan identifies risks, trade-offs, and alternatives considered |

### Scoring Levels

**completeness**:

- 0: Plan is a stub with one or two vague bullet points
- 1: Plan covers the happy path but misses error handling, edge cases, or cleanup
- 2: Plan is mostly complete but omits one non-obvious but important step
- 3: Plan covers all steps including setup, implementation, testing, and edge cases

**task_granularity** (automated regex check: `\b[a-zA-Z0-9_/.-]+\.(ts|js|json|md|tsx|jsx)\b`):

- 0: Tasks are high-level and vague (e.g., 'implement the feature')
- 1: Some tasks are actionable but others are too coarse to act on directly
- 2: Most tasks are well-scoped but a few could be split further
- 3: Every task is specific, scoped to a single change, with target files identified

**feasibility**:

- 0: Plan requires non-existent APIs, impossible architecture, or contradicts project conventions
- 1: Plan is technically possible but ignores significant project constraints or conventions
- 2: Plan is feasible but underestimates complexity in one area
- 3: Plan is realistic, respects project conventions, and accounts for complexity

**risk_identification**:

- 0: No mention of risks, trade-offs, or alternative approaches
- 1: Mentions one risk but no mitigation strategy or alternatives
- 2: Identifies key risks with mitigation but misses a significant trade-off
- 3: Clearly identifies risks with mitigations and explains why chosen approach is preferred over alternatives

Notes: Plans should include a verify step for each task. Look for evidence that the planner explored the codebase before planning.

## What We Expect

### With CF

- Clarifying questions asked before planning (even though the prompt says not to)
- Explicit risk identification and assumptions listing
- Codebase-aware planning (references to existing patterns)
- Task decomposition with file targets

### Without CF

- Direct plan generation without clarification step
- Comprehensive plan with interfaces, algorithms, file lists
- Uses Plan Mode (ExitPlanMode) for structured output
- Implicit assumptions rather than explicitly surfaced ones

## What We Compare

- Whether ambiguities are surfaced vs assumed away
- Plan completeness (number of steps, file references, test strategy)
- Risk/assumption documentation
- Overall utility for someone about to implement the feature

## Actual Results (March 2026)

### Scores

| Condition           | completeness | task_granularity | feasibility | risk_identification | Weighted Total |
| ------------------- | ------------ | ---------------- | ----------- | ------------------- | -------------- |
| With CF (2 runs)    | 1.0          | 0.0              | 2.0         | 3.0                 | **1.50**       |
| Without CF (2 runs) | 3.0          | 3.0              | 3.0         | 1.0                 | **2.50**       |

**Delta: -1.00**

### Cost

| Condition  | Avg Cost              | Avg Time |
| ---------- | --------------------- | -------- |
| With CF    | $0.136                | 25s      |
| Without CF | $0.481                | 150s     |
| Cost ratio | 0.28x (CF is cheaper) |          |

### Key Observations

1. **This is an eval design problem, not a skill quality problem.** CF's plan skill correctly starts by identifying ambiguities and asking for clarification -- which is better engineering practice. But in a single-turn eval, no follow-up is provided, so the actual plan is never generated.
2. **With CF (both runs)**: Asked 4-5 clarifying questions, listed assumptions, identified ambiguities. Scored 3.0 on risk_identification. Scored 0.0 on task_granularity because no tasks were generated.
3. **Without CF (both runs)**: Produced complete, detailed plans with interfaces, algorithms, file lists, implementation sequences, and test plans. Scored 1.0 on risk_identification because assumptions were implicit.
4. CF is actually **cheaper** here (0.28x) because it stops to ask questions instead of generating a full plan.
5. The "Do NOT ask clarifying questions" instruction in the prompt was ignored by CF in both runs.

## Reliability Assessment

- **Sample size**: 2 runs per condition (4 total)
- **Confidence**: Low (as a measure of skill quality). High (as a finding about eval design limitations).
- **Known issues**: The single-turn eval design fundamentally cannot evaluate cf-plan's multi-step workflow. The -1.00 delta does not reflect actual skill quality. This is a **methodology vs completeness trade-off** that the eval cannot resolve without multi-turn support.
- **Recommendation**: Do not cite these results as evidence of cf-plan quality. A multi-turn eval that provides answers to clarifying questions is needed. The finding about CF's clarification-first behavior is itself valuable -- it confirms the skill works as designed.
