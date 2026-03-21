# Evaluating cf-explorer

## What We Test

Whether the cf-explorer agent (read-only, haiku model) efficiently explores codebases to find relevant files and produce well-structured exploration results. We measure recall (files found), precision (relevance of files found), token efficiency, and response structure.

## How Agents Are Tested

Agents are tested indirectly through skills that dispatch them, plus direct evaluation criteria from the agent rubric. The cf-explorer agent is dispatched by several skills when they need to understand the codebase before acting.

## Rubric Criteria

| Criterion          | Weight | Description                                                             |
| ------------------ | ------ | ----------------------------------------------------------------------- |
| recall             | 0.30   | Percentage of relevant files found during exploration                   |
| precision          | 0.30   | Percentage of found files that are actually relevant (avoids noise)     |
| token_efficiency   | 0.20   | Achieves results without excessive token usage (uses haiku efficiently) |
| response_structure | 0.20   | Exploration results are organized and easy to navigate                  |

### Scoring Levels

**recall** (automated check: count file references):

- 0: Finds less than 25% of relevant files
- 1: Finds 25-50% -- misses major areas
- 2: Finds 50-80% -- covers main areas but misses some
- 3: Finds 80%+ -- thorough exploration of all related areas

**precision** (automated check: verify file existence):

- 0: Less than 25% of referenced files are relevant
- 1: 25-50% relevant -- too much noise
- 2: 50-80% relevant -- mostly on-target
- 3: 80%+ relevant -- focused exploration

**token_efficiency**:

- 0: Reads entire files when only sections are needed, or re-reads same files
- 1: Some unnecessary file reads but mostly focused
- 2: Efficient reads but could have used targeted searches instead
- 3: Optimal token usage -- targeted searches, partial file reads, no redundancy

**response_structure**:

- 0: Disorganized stream of file contents
- 1: Some organization but key findings are buried
- 2: Well-organized but could better highlight important findings
- 3: Clearly structured with key findings upfront, supporting details organized by area

Notes: Explorer is read-only and uses haiku for cost efficiency. Should prioritize breadth over depth. File references should point to real, existing files.

## Evaluation Method

### Indirect (via skills)

The cf-explorer agent is dispatched by these skills:

- **cf-ask** -- Used to explore the codebase when answering questions. Observed in Wave 2 cf-ask eval.
- **cf-help** -- Used to find skill documentation. Observed in Wave 2 cf-help eval.
- **cf-scan** -- May use explorer for initial codebase mapping.

In the Wave 2 results:

- cf-ask with-CF Run 1: Used cf-explorer agent. Produced detailed answer with file refs, line numbers, and identified the memory leak bug.
- cf-help with-CF Run 1: Used cf-explorer agent. Listed all 13 slash commands, 5 auto-invoked, 6 agents.

### Direct (if applicable)

The agent can be tested directly by asking exploration questions and measuring the rubric criteria against its output. No direct agent-only eval runs were performed in Wave 1 or Wave 2.

## What We Compare

- **With CF (agent dispatched)**: Explorer agent provides structured exploration results to the calling skill. Measured by whether the skill's answer is more file-specific and accurate.
- **Without CF (no agent)**: The base model does its own exploration. Often achieves similar results but may be less token-efficient or less structured.

In practice, both conditions produced equivalent quality answers when the explorer was used (cf-ask: 2.88 vs 2.88, cf-help: 2.70 vs 2.70). The without-CF condition in cf-ask Run 1 also appeared to use the explorer agent (possibly from cached plugin state), which complicates the comparison.

## Reliability Assessment

- **Sample size**: No direct agent-only evaluations. Indirect signal from 4 skill runs.
- **Confidence**: Low
- **Known issues**: The agent was never tested in isolation. Its contribution is entangled with the calling skill's behavior. The without-CF condition may have leaked access to the agent (cached plugin state), making A/B comparison unreliable.
- **Recommendation**: Create direct agent evaluation prompts that ask specific codebase exploration questions and measure recall/precision against a known set of relevant files. Test with haiku model explicitly to measure token efficiency.
