# Evaluating cf-research

## What We Test

Whether the cf-research skill produces higher-quality research reports than baseline Claude. We measure source diversity, depth of analysis, synthesis quality, actionability of recommendations, and citation accuracy.

## Prompt(s)

**bench-research** (`prompts/cf-research/bench-research.md`):

> Research best practices for building CLI tools with TypeScript in 2026. Cover: argument parsing libraries, testing strategies, distribution methods, and error handling patterns.

## Benchmark Repos Used

- **bench-research** -- Minimal repo used as a working directory. No source code -- this is purely a web research task.

## Rubric Criteria

| Criterion         | Weight | Description                                            |
| ----------------- | ------ | ------------------------------------------------------ |
| source_diversity  | 0.20   | Research draws from multiple independent sources       |
| depth             | 0.25   | Research goes beyond surface-level summaries           |
| synthesis_quality | 0.25   | Information is synthesized into coherent insights      |
| actionability     | 0.15   | Research concludes with actionable recommendations     |
| citation_accuracy | 0.15   | Sources are properly cited and claims are attributable |

### Scoring Levels

**source_diversity**:

- 0: Only one source consulted or all information is from model knowledge
- 1: Two sources but from the same origin
- 2: Three or more sources but heavily weighted toward one
- 3: Multiple diverse sources (docs, articles, GitHub issues, benchmarks) with balanced coverage

**depth**:

- 0: Only restates what could be found in a single Google snippet
- 1: Covers basic facts but lacks nuance, trade-offs, or implementation details
- 2: Good depth on main topic but glosses over important subtopics
- 3: Thorough analysis covering nuances, trade-offs, edge cases, and practical implications

**synthesis_quality**:

- 0: Raw dump of copied text with no synthesis
- 1: Organized into sections but each section is just a source summary
- 2: Some synthesis across sources but conclusions are not well-supported
- 3: Sources are cross-referenced, contradictions noted, and coherent conclusions drawn

**actionability**:

- 0: No recommendations or next steps provided
- 1: Generic recommendations not tailored to the project context
- 2: Recommendations are relevant but lack specificity on implementation
- 3: Concrete recommendations with specific implementation steps for this project

**citation_accuracy** (automated regex check: `https?://[^\s)]+`):

- 0: No sources cited
- 1: Some sources cited but key claims are unattributed
- 2: Most claims have sources but some URLs are broken or citations are vague
- 3: All major claims have specific, verifiable citations with working URLs

Notes: Research output should be saved to docs/research/. Topics with limited online information should be scored on effort and honesty about gaps.

## What We Expect

### With CF

- Extensive web search across multiple source types
- Saved report to docs/research/ in well-structured markdown
- Cross-referencing of sources with synthesis
- Project-specific recommendations

### Without CF

- Fewer web searches but potentially more focused
- May or may not save to file
- Good depth from model knowledge supplemented by searches
- Actionable recommendations

## What We Compare

- Number and diversity of sources consulted
- Depth of analysis on each sub-topic
- Whether sources are cross-referenced or just listed
- Specificity of recommendations
- Cost efficiency (quality per dollar spent)

## Actual Results (March 2026)

### Scores

| Condition          | source_diversity | depth | synthesis_quality | actionability | citation_accuracy | Weighted Total |
| ------------------ | ---------------- | ----- | ----------------- | ------------- | ----------------- | -------------- |
| With CF (1 run)    | 3                | 3     | 3                 | 2             | 2                 | **2.70**       |
| Without CF (1 run) | 3                | 3     | 2                 | 3             | 3                 | **2.75**       |

**Delta: -0.05**

### Cost

| Condition  | Cost     | Time | Web searches |
| ---------- | -------- | ---- | ------------ |
| With CF    | $5.147   | 121s | 61           |
| Without CF | $0.768   | 192s | 7            |
| Cost ratio | **6.7x** |      | 8.7x         |

### Key Observations

1. **CF used 61 web searches costing $5.15.** Without CF used 7 searches costing $0.77. This is a 6.7x cost ratio for essentially the same quality.
2. Both produced high-quality research reports covering all four requested topics.
3. CF's synthesis was slightly better (3 vs 2) -- more cross-referencing across sources. But without CF scored higher on actionability (3 vs 2) and citation accuracy (3 vs 2) -- more specific citations with working URLs and more project-tailored recommendations.
4. Both saved reports to `docs/typescript-cli-best-practices-2026.md`.
5. **This is a cost hazard.** The cf-research skill appears to over-search without proportional quality improvement.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Low for quality comparison (n=1, delta is within noise). High for the cost finding (6.7x ratio is too large to be noise).
- **Known issues**: A single run cannot establish whether the over-searching is consistent or an outlier. The quality delta (-0.05) is not meaningful at n=1.
- **Recommendation**: The quality comparison needs more runs. The cost finding is actionable immediately -- the skill should have search budget guardrails or diminishing-returns detection. Consider adding a `--max-searches` parameter or similar cost control.
