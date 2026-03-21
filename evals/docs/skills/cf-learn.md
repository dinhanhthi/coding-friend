# Evaluating cf-learn

## What We Test

Whether the cf-learn skill extracts and persists learnings more effectively than baseline Claude. The key differentiator is not the quality of insight extraction (both do this well) but whether the learning is saved to a structured, retrievable file.

## Prompt(s)

**bench-webapp** (`prompts/cf-learn/bench-webapp.md`):

> We just fixed a bug where the API client wasn't handling 404 responses properly. Extract the learning about proper error handling in API clients.

## Benchmark Repos Used

- **bench-webapp** -- Has the fetchUser bug (missing 404 handling) that was the subject of the learning extraction. The bug context provides grounding for the learning.

## Rubric Criteria

| Criterion            | Weight | Description                                                                  |
| -------------------- | ------ | ---------------------------------------------------------------------------- |
| knowledge_extraction | 0.30   | Captures the key insight or learning from the task                           |
| clarity              | 0.25   | Learning is written clearly enough to be understood without original context |
| structure            | 0.20   | Note follows proper structure with title, category, and content              |
| practical_value      | 0.25   | Learning is actionable and will save time when encountered again             |

### Scoring Levels

**knowledge_extraction**:

- 0: No meaningful knowledge extracted
- 1: Captures surface-level facts but misses the deeper insight
- 2: Captures the main insight but misses important nuances
- 3: Precisely extracts the non-obvious insight with proper context

**clarity**:

- 0: Incomprehensible without the original conversation
- 1: Makes sense but uses jargon or references needing explanation
- 2: Clear but could be more self-contained
- 3: Fully self-contained, clear, and understandable by someone new

**structure** (automated regex check: `^#\s+.+` for heading):

- 0: No structure -- just a blob of text
- 1: Has a title but no category or proper formatting
- 2: Has title and category but content organization could be improved
- 3: Well-structured with clear title, correct category, and organized content

**practical_value**:

- 0: Learning has no practical value -- just restates documentation
- 1: Interesting but not actionable
- 2: Actionable but the triggering scenario is unclear
- 3: Clearly states when it applies, what to do, and why

Notes: Auto-invoked learnings should only fire on substantial new knowledge. Category should match configured categories. Learning should not duplicate existing notes.

## What We Expect

### With CF

- Learning saved to `docs/learn/` as a structured markdown file
- Clear title, category, and organized content
- Practical principles that can be applied in future similar situations
- Non-obvious insights beyond "check error codes"

### Without CF

- Excellent inline learning extraction in the conversation
- Key principles identified and explained
- May ask about saving to memory but likely does not create a file
- Knowledge stays in the conversation and is lost when the session ends

## What We Compare

- Whether the learning is persisted to a file (binary: yes/no)
- Quality of the extracted insight
- Structure and organization of the output
- Practical value for future encounters with similar bugs

## Actual Results (March 2026)

### Scores

| Condition          | knowledge_extraction | clarity | structure | practical_value | Weighted Total |
| ------------------ | -------------------- | ------- | --------- | --------------- | -------------- |
| With CF (1 run)    | 3                    | 3       | 3         | 3               | **3.00**       |
| Without CF (1 run) | 3                    | 3       | 2         | 2               | **2.55**       |

**Delta: +0.45**

### Cost

| Condition  | Cost   | Time |
| ---------- | ------ | ---- |
| With CF    | $0.203 | 60s  |
| Without CF | $0.184 | 81s  |
| Cost ratio | 1.1x   |      |

### Key Observations

1. Both extracted the same key insights: always check `response.ok`, distinguish 404 from other errors, test error paths explicitly.
2. **The difference is persistence.** CF saved the learning to `docs/learn/api-error-handling.md` with proper title, categories, and structured content. Without CF, the learning was excellent but remained inline in the conversation.
3. The without-CF run asked about saving to memory but did not create a file.
4. Structure scored 2 for without-CF because the inline output was less formally structured than a dedicated file.
5. Practical value scored 2 for without-CF because without file persistence, the learning cannot be retrieved in future sessions.
6. The cost difference is negligible (1.1x) -- CF's persistence mechanism adds minimal overhead.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Medium
- **Known issues**: Only 1 run per condition means the scores could shift with more data. However, the key finding (file persistence vs inline) is binary and structural, making it more robust than a numerical score would suggest.
- **Recommendation**: Results are directionally trustworthy. The persistence finding is the cf-learn skill's core value proposition and was clearly demonstrated. More runs would confirm the scores but are unlikely to change the binary finding: CF saves learnings to files, baseline does not.
