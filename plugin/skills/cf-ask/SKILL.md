---
name: cf-ask
description: Quick Q&A about codebase — explores code to answer, saves to docs/memory
disable-model-invocation: true
---

# /cf-ask

Answer the question: **$ARGUMENTS**

## Purpose

Quick, focused Q&A about the codebase. Proactively explores code to find the answer, then saves the Q&A to project memory so it can be referenced later.

- Unlike `/cf-research`: single focused answer, no multi-doc output
- Unlike `/cf-remember`: proactively explores the codebase to answer vs extracting knowledge already in conversation

## Folder

Output goes to `{docsDir}/memory/` (default: `docs/memory/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

## Workflow

### Step 0: Load Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-ask`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before Step 1
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Parse the Question

1. Read `$ARGUMENTS` as the question
2. If no question provided, ask the user what they want to know
3. Identify keywords and likely relevant areas (modules, features, patterns)

### Step 2: Explore the Codebase (via cf-explorer agent)

Launch the **cf-explorer agent** to gather codebase context for the question.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass:

> Explore the codebase to answer the following question: [question from Step 1]
>
> Questions to answer:
>
> 1. [rephrase the user's question as specific search targets]
> 2. What files, functions, or patterns are relevant?
> 3. What are the key code snippets that answer the question?
>
> Scope: [keywords and likely relevant areas from Step 1]

Wait for the cf-explorer to return its findings.

### Step 3: Form the Answer

1. Synthesize findings into a clear, structured answer
2. Reference specific files and line ranges where relevant
3. Use code snippets only when they clarify the answer
4. Keep it concise — this is a focused answer, not a research paper

### Step 4: Present to User

1. Show the answer directly in the conversation
2. List the key files that were consulted

### Step 5: Save to Memory

1. Check `language` config — write in configured language (default: `en`)
2. **Search existing memory files** in `{docsDir}/memory/` (features/, conventions/, decisions/)
3. If an existing file covers the same topic, **append** the new Q&A to that file
4. If no existing file matches, create a new file in the appropriate category:
   - `features/<name>.md` — for feature-specific logic, flows, APIs
   - `conventions/<name>.md` — for project-wide patterns and rules
   - `decisions/<name>.md` — for architecture/design decisions
5. Use kebab-case for file names

When **appending** to an existing file, add a new section:

```markdown
## Q&A: <short question summary> (YYYY-MM-DD)

**Q:** <question>

**A:** <concise answer>

**Related files:** `path/to/file1`, `path/to/file2`
```

When **creating** a new file, use the standard memory template:

```markdown
# <Title>

## Overview

<1-2 sentences>

## Q&A: <short question summary> (YYYY-MM-DD)

**Q:** <question>

**A:** <concise answer>

**Related files:** `path/to/file1`, `path/to/file2`
```

### Step 6: Confirm

Show the user where the Q&A was saved (new file or appended to existing).

## Rules

- Delegate exploration to the cf-explorer agent — keep the main context lean
- Stay lightweight — no multi-doc output
- Always save to `{docsDir}/memory/` — saving is mandatory, not optional
- Search existing memory files before creating new ones
- NEVER overwrite existing content — only append
- Respect `.coding-friend/ignore` patterns
- Use `language` config for answer language
- Create directories as needed
