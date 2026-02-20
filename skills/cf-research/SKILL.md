---
name: cf-research
description: In-depth research on a topic with web search and structured output
disable-model-invocation: true
---

# /cf-research

Research in depth: **$ARGUMENTS**

## Purpose

Deep research on a topic — a git repo, a library, an architecture pattern, a technology, etc. Results are saved as structured markdown docs in `docs/research/` so they can be referenced later by other skills (e.g. `/cf-plan`).

Unlike `/cf-plan`, this skill does NOT plan implementation. It only **researches and documents findings**.

## Folder

Output goes to `{docsDir}/research/` (default: `docs/research/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

## Workflow

### Step 1: Scope the Research

1. Parse `$ARGUMENTS` to understand what to research
2. Determine the research type:
   - **Web topic**: a technology, library, pattern, concept
   - **Codebase**: a git repo (local or remote), a folder, a project
   - **Comparison**: comparing multiple options/approaches
3. Define 3-5 key questions the research should answer
4. Present the scope to the user and confirm before proceeding

### Step 2: Plan the Research Structure

1. Break the topic into **logical parts** that can be researched independently
2. Each part should be small enough to fit in a single focused document
3. Create a research plan:
   - List of parts to research
   - For each part: what questions it answers, what sources to check
   - Name the output files in advance

**Examples of splitting:**
- A git repo → split by: architecture overview, key modules, data flow, API surface, dependencies
- A technology → split by: core concepts, API/usage, ecosystem, trade-offs, best practices
- A comparison → split by: each option as a separate doc, then a comparison summary

### Step 3: Execute Research (Parallel)

For each part identified in Step 2:

1. **Launch a subagent** (using the Task tool) to research that specific part
2. Each subagent should:
   - Use **WebSearch** to find up-to-date information
   - Use **WebFetch** to read relevant pages, docs, READMEs
   - Read local files if researching a codebase (use Read, Glob, Grep)
   - Write findings to its designated markdown file
3. Run subagents **in parallel** when parts are independent
4. Each subagent writes its output file directly to the research subfolder

**Subagent prompt template:**
> Research the following topic in depth: [PART DESCRIPTION]
> Key questions to answer: [QUESTIONS]
> Use WebSearch and WebFetch to find current information.
> Write your findings to: [FILE PATH]
> Format: use the Research Part Template below.
> Be thorough — include code examples, links to sources, and specific details.

### Step 4: Synthesize

After all parts are complete:

1. Read all the part documents
2. Write a **summary document** (`_summary.md`) that:
   - Gives a high-level overview of the entire research
   - Links to each part document
   - Highlights the most important findings
   - Lists open questions or areas needing further research

### Step 5: Confirm

1. Present the research summary to the user
2. List all generated files with brief descriptions
3. Suggest next steps (e.g. "run `/cf-plan` to plan implementation based on this research")

## Output Structure

```
docs/research/<slug>/
├── _summary.md          # Overall summary with links to parts
├── 01-<part-name>.md    # Part 1 findings
├── 02-<part-name>.md    # Part 2 findings
├── 03-<part-name>.md    # Part 3 findings
└── ...
```

## Research Part Template

```markdown
# <Part Title>

## Key Questions
- <question this part answers>

## Findings

### <Subtopic 1>
<detailed findings with specifics>

### <Subtopic 2>
<detailed findings with specifics>

## Code Examples
```<language>
// relevant code snippets if applicable
```

## Sources
- [Source title](URL)
- [Source title](URL)

## Notes
- <additional observations>
- <caveats or limitations>
```

## Summary Template

```markdown
# Research: <Topic>

**Date:** YYYY-MM-DD
**Scope:** <1-2 sentences describing what was researched>

## Overview
<3-5 sentence summary of the entire research>

## Key Findings
1. <most important finding>
2. <second most important>
3. <third most important>

## Parts
| # | Document | Description |
|---|----------|-------------|
| 1 | [Part name](01-part-name.md) | Brief description |
| 2 | [Part name](02-part-name.md) | Brief description |

## Open Questions
- <things that need further investigation>

## Recommended Next Steps
- <actionable suggestions>
```

## Rules

- Do NOT implement anything. This skill is for RESEARCH only.
- Always use **WebSearch** for web topics — do not rely solely on training data.
- Split large topics into parts and use **parallel subagents** to avoid context overflow.
- Each part document should be **self-contained** and readable independently.
- Include **sources with URLs** for all web-sourced information.
- If `$ARGUMENTS` is vague, ask clarifying questions before starting.
- Create the research subfolder automatically — don't ask the user to create it.
- Use kebab-case for folder and file names (e.g. `react-server-components/`).
