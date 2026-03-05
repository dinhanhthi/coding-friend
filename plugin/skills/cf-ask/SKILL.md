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

### Step 2: Check Existing Memory (Frontmatter Recall)

Before exploring the codebase, search existing memory docs using a **3-tier grep** on frontmatter fields. Extract 2-3 keywords from the question. Check `{docsDir}` from `.coding-friend/config.json` (default: `docs`).

**Tier 1 — Grep descriptions** (cheapest):

Use the Grep tool to search for `^description:` lines across `{docsDir}/memory/**/*.md`. Match against question keywords.

Example: if question mentions "config", grep for files whose `description:` line contains "config".

**Tier 2 — Grep tags** (if Tier 1 has no matches):

Use the Grep tool to search for `^tags:` lines across `{docsDir}/memory/**/*.md`. Match against question keywords.

**Tier 3 — Full-text grep** (last resort, if Tier 1 and 2 have no matches):

Use the Grep tool to search file content for the keywords. Use `output_mode: "files_with_matches"` to get file paths only.

**After finding matches:**

1. Read the top 2-3 most relevant matched files
2. If a **direct match** is found (same or very similar question already answered):
   - Present the existing answer to the user (cite the memory file)
   - Ask if they want a fresh exploration or if the existing answer is sufficient
   - If sufficient → skip to Step 7 (no save needed)
3. If **related context** is found (useful background, not a direct answer):
   - Collect it as supplementary context to pass along to Step 3
4. If **no relevant memory** is found → proceed to Step 3

### Step 3: Explore the Codebase (via cf-explorer agent)

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

If related memory context was found in Step 2, include it:

> Existing memory context (use as supplementary info, verify against current code):
>
> [summary of related memory findings]

Wait for the cf-explorer to return its findings.

### Step 4: Form the Answer

1. Synthesize findings into a clear, structured answer
2. Incorporate any related memory context from Step 2
3. Reference specific files and line ranges where relevant
4. Use code snippets only when they clarify the answer
5. Keep it concise — this is a focused answer, not a research paper

### Step 5: Present to User

1. Show the answer directly in the conversation
2. List the key files that were consulted

### Step 6: Save to Memory (via cf-writer agent)

1. Read `language` config (local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`, default: `en`)
2. Search existing memory files in `{docsDir}/memory/` — if an existing file covers the same topic, use `task: update` (append). Otherwise, use `task: create`.
3. Choose the appropriate category:
   - `features/<name>.md` — for feature-specific logic, flows, APIs
   - `conventions/<name>.md` — for project-wide patterns and rules
   - `decisions/<name>.md` — for architecture/design decisions
4. Use kebab-case for file names

Construct a write spec and delegate to **cf-writer agent** via the **Agent tool** with `subagent_type: "coding-friend:cf-writer"`.

**When creating** a new file:

```
WRITE SPEC
----------
task: create
file_path: {docsDir}/memory/{category}/{name}.md
language: {language from config}
content: |
  ---
  title: "<Title>"
  description: "<One-line summary for grep-based recall, under 100 chars>"
  tags: [tag1, tag2, tag3]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  ---

  # <Title>

  ## Overview
  <1-2 sentences>

  ## Q&A: <short question summary> (YYYY-MM-DD)

  **Q:** <question>

  **A:** <concise answer>

  **Related files:** `path/to/file1`, `path/to/file2`
readme_update: false
auto_commit: false
existing_file_action: skip
```

**When appending** to an existing file:

```
WRITE SPEC
----------
task: update
file_path: {docsDir}/memory/{category}/{name}.md
language: {language from config}
content: |
  ## Q&A: <short question summary> (YYYY-MM-DD)

  **Q:** <question>

  **A:** <concise answer>

  **Related files:** `path/to/file1`, `path/to/file2`
readme_update: false
auto_commit: false
existing_file_action: append
```

When appending, also instruct cf-writer to update the `updated` date in the existing frontmatter.

**Frontmatter rules:**

- `description`: factual, searchable summary under 100 chars. Good: `"JWT auth flow with refresh tokens and OAuth2 integration"`. Bad: `"About auth"`.
- `tags`: 3-5 keywords as array

### Step 7: Confirm

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
