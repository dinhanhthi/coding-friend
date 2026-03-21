# Evaluating cf-help

## What We Test

Whether the cf-help skill provides more accurate, complete, and concise answers about Coding Friend features than baseline Claude.

## Prompt(s)

**bench-webapp** (`prompts/cf-help/bench-webapp.md`):

> What skills are available in Coding Friend? How does the TDD workflow work?

## Benchmark Repos Used

- **bench-webapp** -- Used as the working directory. The project has Coding Friend installed, so skill documentation is available in the plugin files.

## Rubric Criteria

| Criterion       | Weight | Description                                                 |
| --------------- | ------ | ----------------------------------------------------------- |
| answer_accuracy | 0.40   | Answer correctly describes CF skills, commands, or features |
| completeness    | 0.30   | Answer covers all relevant aspects of the question          |
| conciseness     | 0.30   | Answer is appropriately concise for a help interaction      |

### Scoring Levels

**answer_accuracy** (automated regex check: `(cf-[a-z-]+|/cf-[a-z-]+)`):

- 0: Answer is wrong -- describes non-existent features or gives incorrect usage
- 1: Answer is partially correct but confuses skills or gives outdated information
- 2: Answer is correct but misses an important detail or caveat
- 3: Answer is fully accurate, matching current skill definitions and documentation

**completeness**:

- 0: Only addresses a fraction of the question
- 1: Covers the main point but misses related skills or features
- 2: Complete on the direct question but could mention useful related features
- 3: Fully addresses the question and proactively mentions related skills or tips

**conciseness**:

- 0: Massive dump of all documentation regardless of the question
- 1: Verbose with excessive detail beyond what was asked
- 2: Mostly concise but includes some unnecessary explanation
- 3: Focused and concise -- directly answers without filler

Notes: Help should reference the official website (cf.dinhanhthi.com) for detailed docs when appropriate.

## What We Expect

### With CF

- Accurate listing of all available skills (slash commands and auto-invoked)
- Detailed explanation of TDD workflow (RED-GREEN-REFACTOR cycle)
- References to skill documentation
- Appropriately concise

### Without CF

- Same accuracy (both read the same skill docs from the project)
- Same completeness (the information is in the plugin files)
- Similar conciseness

## What We Compare

- Accuracy of skill listings
- Depth of TDD workflow explanation
- Whether the response is appropriately scoped to the question
- Whether additional helpful context is provided

## Actual Results (March 2026)

### Scores

| Condition          | answer_accuracy | completeness | conciseness | Weighted Total |
| ------------------ | --------------- | ------------ | ----------- | -------------- |
| With CF (1 run)    | 3               | 3            | 2           | **2.70**       |
| Without CF (1 run) | 3               | 3            | 2           | **2.70**       |

**Delta: 0.00**

### Cost

| Condition  | Cost           | Time |
| ---------- | -------------- | ---- |
| With CF    | $0.107         | 42s  |
| Without CF | $0.116         | 38s  |
| Cost ratio | 0.9x (similar) |      |

### Key Observations

1. Both conditions accurately listed all Coding Friend skills (13 slash commands, 5 auto-invoked, 6 agents) and explained the TDD workflow correctly.
2. Both were slightly verbose (scored 2 on conciseness) -- included more detail than strictly necessary for a help interaction.
3. The with-CF run used the cf-explorer agent. The without-CF run also used agents for exploration.
4. Both outputs are nearly identical in quality, structure, and coverage.
5. This is expected: both conditions have access to the same skill documentation files in the project.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Medium
- **Known issues**: The parity result is expected because both conditions read the same documentation files. The cf-help skill's value would show more in scenarios where the user asks about features that require synthesizing information across multiple files, or when documentation is incomplete.
- **Recommendation**: Results are trustworthy for this type of question (listing skills, explaining workflows). The zero-delta finding is consistent with expectations -- cf-help does not add value when the answer is directly available in project files. Consider testing with more nuanced questions that require cross-referencing or disambiguation.
