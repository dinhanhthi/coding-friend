# Evaluating cf-planner

## What We Test

Whether the cf-planner agent produces better task decompositions and approach brainstorming than baseline Claude. We measure approach diversity, pros/cons depth, task actionability, and risk coverage.

## How Agents Are Tested

The cf-planner agent is dispatched by the cf-plan skill. It is tested indirectly through cf-plan eval runs. The agent is responsible for generating multiple approaches, analyzing trade-offs, and producing actionable task lists.

## Rubric Criteria

| Criterion          | Weight | Description                                                        |
| ------------------ | ------ | ------------------------------------------------------------------ |
| approach_diversity | 0.25   | Generates multiple distinct approaches rather than just one        |
| pros_cons_depth    | 0.25   | Each approach has substantive pros and cons analysis               |
| task_actionability | 0.25   | Tasks in the recommended approach are specific enough to implement |
| risk_coverage      | 0.25   | Identifies risks, dependencies, and potential blockers             |

### Scoring Levels

**approach_diversity** (automated regex check: `(Approach|Option|Alternative|Strategy)\s*(\d|[A-C]|One|Two|Three)`):

- 0: Only one approach presented
- 1: Two approaches but minor variations of the same idea
- 2: Two genuinely different approaches with some trade-off analysis
- 3: Three or more meaningfully different approaches with clear differentiation

**pros_cons_depth**:

- 0: No pros/cons analysis
- 1: Generic pros/cons without specifics
- 2: Good analysis for some approaches but superficial for others
- 3: Every approach has specific, project-relevant pros and cons

**task_actionability** (automated check: count tasks):

- 0: Vague tasks with no file or function targets
- 1: Some actionable tasks but others require further decomposition
- 2: Most tasks are actionable with target files but some lack specificity
- 3: Every task specifies target files, expected changes, and verification steps

**risk_coverage**:

- 0: No risks or dependencies mentioned
- 1: One obvious risk, no mitigation
- 2: Key risks with mitigations but missing dependency analysis
- 3: Comprehensive risk analysis with mitigations, dependencies mapped, fallback plan

Notes: Planner should explore the codebase before planning. Small tasks may only warrant 2 approaches.

## Evaluation Method

### Indirect (via skills)

The cf-planner agent is dispatched by **cf-plan**. In the Wave 1 evaluation:

- **With CF (2 runs)**: The cf-plan skill stopped at the clarification phase (asking 4-5 questions, listing assumptions). The planner agent's plan generation was never reached because no follow-up was provided. This means the planner agent was never actually evaluated.
- **Without CF (2 runs)**: Baseline Claude produced complete plans directly (using Plan Mode). No agent was dispatched.

Because the cf-plan eval was single-turn and CF stopped to ask clarifying questions, the cf-planner agent was never tested in either wave.

### Direct (if applicable)

No direct planner agent evaluation was performed. To test the agent directly, provide a planning prompt that bypasses the clarification step and goes directly to plan generation, or provide a multi-turn eval with answers to clarifying questions.

## What We Compare

In theory:

- **With CF (agent dispatched)**: Multiple approaches with trade-off analysis, actionable task lists, risk identification
- **Without CF (no agent)**: Direct plan generation, typically one approach, less trade-off analysis

In practice: The cf-planner agent was never exercised during the evaluation due to the single-turn limitation of cf-plan.

## Reliability Assessment

- **Sample size**: 0 (agent was never exercised)
- **Confidence**: None
- **Known issues**: The single-turn eval design for cf-plan prevented the planner agent from being reached. The skill's clarification-first workflow stops before dispatching the planner.
- **Recommendation**: The cf-planner agent has not been evaluated. To evaluate it:
  1. Create a multi-turn eval for cf-plan that provides answers to clarifying questions
  2. OR create a direct agent evaluation prompt that bypasses cf-plan's workflow
  3. OR modify the cf-plan prompt to include explicit "Do not ask questions, proceed directly" instructions that the skill actually respects (the current prompts include this but CF ignores it)
