---
name: cf-ask
description: Quick Q&A about codebase — explores code to answer, saves to docs/memory
disable-model-invocation: true
---

# /cf-ask

Answer the question: **$ARGUMENTS**

## Purpose

Quick, focused Q&A about the codebase. Proactively explores code to find the answer, then saves the Q&A to project memory so it can be referenced later.

- Unlike `/cf-research`: single focused answer, no multi-doc output, no subagents
- Unlike `/cf-remember`: proactively explores the codebase to answer vs extracting knowledge already in conversation

## Folder

Output goes to `{docsDir}/memory/` (default: `docs/memory/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

## Workflow

### Step 1: Parse the Question
1. Read `$ARGUMENTS` as the question
2. If no question provided, ask the user what they want to know
3. Identify keywords and likely relevant areas (modules, features, patterns)

### Step 2: Explore the Codebase
1. Use Glob to find files related to the keywords
2. Use Grep to search for relevant functions, classes, patterns
3. Read the most relevant files (limit to what's needed — stay lightweight)
4. Do NOT use subagents or Task tool — this is a single-agent exploration

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
- Stay lightweight — no subagents, no multi-doc output
- Explore codebase proactively (Glob, Grep, Read)
- Always save to `{docsDir}/memory/` — saving is mandatory, not optional
- Search existing memory files before creating new ones
- NEVER overwrite existing content — only append
- Respect `.coding-friend/ignore` patterns
- Use `language` config for answer language
- Create directories as needed
