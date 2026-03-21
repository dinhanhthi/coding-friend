# Evaluating cf-remember

## What We Test

Whether the cf-remember skill makes better decisions about what project knowledge to persist to memory than baseline Claude. We measure relevance, accuracy, retrievability, and deduplication.

## Prompt(s)

**bench-webapp** (`prompts/cf-remember/bench-webapp.md`):

> Remember that this project uses a TTL-based in-memory cache with lazy expiration. The cache module is at src/lib/cache.ts and supports get/set/clear operations.

This prompt is intentionally a "trap" -- the information provided is directly derivable from reading `src/lib/cache.ts`. The correct behavior is to recognize that this does not need to be saved to memory.

## Benchmark Repos Used

- **bench-webapp** -- Has the cache module at `src/lib/cache.ts`. The information in the prompt can be determined by reading the source code.

## Rubric Criteria

| Criterion      | Weight | Description                                               |
| -------------- | ------ | --------------------------------------------------------- |
| relevance      | 0.30   | Captured knowledge is relevant and worth remembering      |
| accuracy       | 0.30   | Stored information is factually correct                   |
| retrievability | 0.20   | Memory file is named and organized for future findability |
| no_duplicates  | 0.20   | Does not duplicate existing memory files                  |

### Scoring Levels

**relevance**:

- 0: Stored information is irrelevant or already obvious from code
- 1: Tangentially relevant but not worth persisting long-term
- 2: Relevant but could be discovered easily from code/docs
- 3: Captures non-obvious project knowledge that would be lost between sessions

**accuracy**:

- 0: Contains significant factual errors
- 1: Mostly correct but one important detail is wrong
- 2: Accurate but some claims are imprecise
- 3: Every statement is accurate, precise, and verifiable

**retrievability** (automated regex check: `docs/memory/[a-z0-9-]+\.md$`):

- 0: Cryptic name and no clear topic
- 1: Somewhat descriptive name but content lacks structure
- 2: Good name and structure but could benefit from better headings
- 3: Clear, descriptive file name with well-structured content

**no_duplicates** (automated check: check for duplicate titles in `docs/memory/`):

- 0: Essentially a copy of an existing memory file
- 1: Significant overlap (>50% duplicate content)
- 2: Minor overlap but adds meaningful new information
- 3: Entirely new information or meaningfully updates/replaces existing file

Notes: Memory files should be concise, not full documentation. If updating existing memory, the update should be additive or a clear improvement.

## What We Expect

### With CF

- Correctly recognize that this information is derivable from source code
- Refuse to create a memory file (or explain why it is unnecessary)
- Potentially note the memory leak performance issue as a bonus observation

### Without CF

- Same judgment -- recognizing the information is derivable from code
- Same refusal to create unnecessary memory

## What We Compare

- Whether both conditions exercise correct judgment about what to save
- Whether either creates an unnecessary memory file
- Quality of the explanation for why saving is unnecessary

## Actual Results (March 2026)

### Scores

| Condition          | relevance | accuracy | retrievability | no_duplicates | Weighted Total |
| ------------------ | --------- | -------- | -------------- | ------------- | -------------- |
| With CF (1 run)    | 3\*       | 3        | 3\*            | 3\*           | **3.00**       |
| Without CF (1 run) | 3\*       | 3        | 3\*            | 3\*           | **3.00**       |

\*Scored 3 because both correctly identified that this information does NOT need to be saved to memory. The ideal behavior is inaction. Both correctly refused to create a memory file.

**Delta: 0.00**

### Cost

| Condition  | Cost   | Time |
| ---------- | ------ | ---- |
| With CF    | $0.077 | 18s  |
| Without CF | $0.052 | 22s  |
| Cost ratio | 1.5x   |      |

### Key Observations

1. Both conditions showed identical good judgment -- correctly refusing to create a memory file for information derivable from source code.
2. Both also noted the memory leak performance issue in the cache module as a bonus observation.
3. This is a case where the "right answer" is inaction, and both conditions got it right.
4. The eval design may not fully test cf-remember's value -- it would need a prompt with genuinely non-obvious information to test file creation quality.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Medium for this specific scenario. Low for the skill overall.
- **Known issues**: This eval only tests one scenario (refuse to save), not the creation path. A comprehensive eval would include prompts where saving IS appropriate, to test memory file quality, naming, and deduplication.
- **Recommendation**: The refusal-to-save judgment is validated. To properly evaluate cf-remember, add prompts with non-obvious project knowledge that should be saved (e.g., "Remember that deployments to staging require the VPN connected" or "Remember that the cache module has a known memory leak that is tracked in issue #42").
