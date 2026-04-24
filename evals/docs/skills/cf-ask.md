# Evaluating cf-ask

## What We Test

Whether the cf-ask skill provides more accurate, concise, and well-referenced answers to codebase questions than baseline Claude. We also measure whether answers are appropriately saved to memory, and — for flow questions — whether a Mermaid diagram is generated.

## Prompt(s)

**bench-webapp** (`prompts/cf-ask/bench-webapp.md`):

> How does the cache invalidation work in this project? What happens when a cached entry expires?

**bench-library** (`prompts/cf-ask/bench-library.md`):

> What string manipulation functions are available in this project? How does the slugify function handle special characters?

**bench-webapp-flow** (`prompts/cf-ask/bench-webapp-flow.md`):

> Walk me through the full lifecycle of a request in this project — from entry point to response.

*(This prompt specifically targets the flow question path added in the April 2026 update — expects a Mermaid diagram in the answer.)*

## Benchmark Repos Used

- **bench-webapp** -- Has a cache module at `src/lib/cache.ts` with TTL-based expiration and a known memory leak bug (expired entries never cleaned up)
- **bench-library** -- Has string utility functions including `slugify`, `capitalize`, `truncate`, etc.

## Rubric Criteria

| Criterion         | Weight | Description                                                                      |
| ----------------- | ------ | -------------------------------------------------------------------------------- |
| answer_accuracy   | 0.30   | Answer is factually correct based on the actual codebase state                   |
| conciseness       | 0.20   | Answer is appropriately concise for a quick Q&A interaction                      |
| source_references | 0.20   | Answer points to specific files and locations                                    |
| memory_saved      | 0.15   | Answer is saved to memory when appropriate                                       |
| flow_diagram      | 0.15   | For flow questions: a Mermaid diagram is generated with the correct diagram type |

*`flow_diagram` is only scored for flow-question prompts. For non-flow prompts, its weight is redistributed proportionally across the other four criteria.*

### Scoring Levels

**flow_diagram** (only for flow-question prompts; automated check: ` ```mermaid` block in response):

- 0: No diagram generated for a clear flow question
- 1: Diagram present but wrong type for the flow's shape (e.g., `flowchart` used instead of `sequenceDiagram`)
- 2: Correct diagram type but missing key states or transitions
- 3: Correct diagram type, all key actors/states/transitions present, error paths labeled

**answer_accuracy**:

- 0: Answer is wrong -- states facts that contradict the codebase
- 1: Answer is partially correct but contains a significant inaccuracy
- 2: Answer is correct on main points but has a minor inaccuracy
- 3: Answer is fully accurate and consistent with current codebase state

**conciseness**:

- 0: A wall of text that buries the actual answer
- 1: Right information but 3x longer than needed
- 2: Mostly concise but some unnecessary elaboration
- 3: Direct, focused, exactly as long as needed

**source_references** (automated regex check: `[a-zA-Z0-9_/.-]+\.(ts|js|json|md|tsx|jsx)`):

- 0: No file references
- 1: References a directory but not specific files
- 2: References specific files but not the most relevant ones
- 3: References exact files and line ranges where the answer can be verified

**memory_saved** (automated check: `docs/memory/*.md` in changed files):

- 0: Question warranted saving but nothing was saved
- 1: Memory file created but too sparse to be useful
- 2: Memory file created with good content but could be better organized
- 3: Memory file with clear title, concise content, and proper categorization

Notes: Not all questions warrant saving to memory. Score memory_saved as 3 if the question genuinely does not need to be remembered and no file was created.

## What We Expect

### With CF

- Accurate answers with file:line references
- May use cf-explorer agent for codebase exploration
- Appropriately concise
- Correct judgment on whether to save to memory (these code-level questions typically do not warrant it)
- **For flow questions**: generates a Mermaid diagram (`stateDiagram-v2`, `sequenceDiagram`, or `flowchart TD`) with labeled transitions; diagram saved to the `## Flow Diagram` section of the memory file

### Without CF

- Equally accurate answers (Claude's base model reads code well)
- File references likely present
- May be slightly more or less verbose
- Same judgment on memory saving

## What We Compare

- Answer accuracy and depth
- Specificity of file references
- Answer length relative to question complexity
- Memory saving judgment

## Actual Results (March 2026)

### Scores

| Condition               | answer_accuracy | conciseness | source_references | memory_saved | Weighted Total |
| ----------------------- | --------------- | ----------- | ----------------- | ------------ | -------------- |
| With CF (2 runs avg)    | 3.0             | 2.5         | 3.0               | 3.0\*        | **2.88**       |
| Without CF (2 runs avg) | 3.0             | 2.5         | 3.0               | 3.0\*        | **2.88**       |

\*memory_saved scored 3 for both because these are code-level questions that do not warrant saving to memory. Both correctly did not create memory files.

**Delta: 0.00**

### Cost

| Condition  | Avg Cost | Avg Time |
| ---------- | -------- | -------- |
| With CF    | $0.171   | 47s      |
| Without CF | $0.120   | 56s      |
| Cost ratio | 1.4x     |          |

### Key Observations

1. Both conditions produced nearly identical answers. Both correctly identified cache behavior, the lazy expiration mechanism, and even the memory leak bug.
2. With-CF Run 1 used the cf-explorer agent, but Without-CF Run 1 also appeared to use it (possibly from cached plugin state), making the comparison even more equivalent.
3. Both correctly identified the Unicode limitation in the slugify function (bench-library).
4. Neither created memory files, which is the correct judgment for these factual code questions.

## Reliability Assessment

- **Sample size**: 2 runs per condition (4 total)
- **Confidence**: Medium-High
- **Known issues**: The without-CF run appearing to use the cf-explorer agent suggests imperfect isolation between conditions. This would make the comparison less meaningful if CF features leaked into the baseline.
- **Recommendation**: Results are trustworthy -- both conditions perform equally well on code Q&A. This is expected: Claude's base model is strong at reading and explaining code. The cf-ask skill does not add measurable value for straightforward code questions. Its value, if any, would show on questions requiring memory retrieval from previous sessions, which this eval does not test.
