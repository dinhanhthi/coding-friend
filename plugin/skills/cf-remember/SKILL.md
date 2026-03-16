---
name: cf-remember
description: >
  Extract project knowledge from conversation to docs/memory — for AI recall in future sessions.
  Use when the user wants to save project context, capture decisions, document conventions, or
  preserve knowledge from the current session — e.g. "remember this", "save this to memory",
  "document what we did", "capture this decision", "write this down", "save for later",
  "don't forget", "note this", "record this convention", "preserve this knowledge".
  Auto-invoke when the conversation produces significant project knowledge worth preserving —
  architecture decisions, non-obvious conventions, complex feature flows, or important gotchas
  that would save time in future sessions. Do NOT auto-invoke for trivial changes.
  Unlike /cf-learn (educational notes for humans), this saves project context for AI recall.
---

# /cf-remember

Extract and save project knowledge. User input: **$ARGUMENTS**

## Purpose

After a coding session, key knowledge gets lost — logic flows, conventions, decisions, gotchas. This skill captures that knowledge into the project's memory folder so future sessions (and humans) can quickly understand the project.

## Folder

Output goes to `{docsDir}/memory/` (default: `docs/memory/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

**IMPORTANT — path resolution:**

- Run `pwd` to get the current working directory — substitute its actual output wherever `$CWD` appears below (do NOT pass `$CWD` as a literal string)
- Only check `$CWD/.coding-friend/config.json` for `docsDir` — do NOT search sub-folders
- Always resolve `file_path` as an **absolute path**: `$CWD/{docsDir}/memory/{category}/{name}.md`
- Never use relative paths in write specs — they may resolve incorrectly when the working directory contains nested git repos

## Workflow

### Step 0: Load Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-remember`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before Step 1
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Analyze the Conversation

If `$ARGUMENTS` is provided, use it as a filter — focus only on conversation content that relates to the user's stated purpose. Otherwise, scan the full conversation.

Identify:

- **Features worked on**: What was built or modified?
- **Logic flows**: How does the feature work? Key decision points?
- **Conventions**: Patterns established (naming, structure, API design)
- **Decisions**: Why was X chosen over Y?
- **Gotchas**: Tricky parts, common mistakes, non-obvious behavior

### Step 2: Determine the Category

Choose the right location based on **what the knowledge is about**, not just what task was performed:

| Category       | Location                                    | Use For                                             |
| -------------- | ------------------------------------------- | --------------------------------------------------- |
| Features       | `{docsDir}/memory/features/<name>.md`       | Feature-specific logic, flows, APIs                 |
| Conventions    | `{docsDir}/memory/conventions/<name>.md`    | Project-wide patterns and rules                     |
| Decisions      | `{docsDir}/memory/decisions/<name>.md`      | Architecture/design decision records                |
| Bugs           | `{docsDir}/memory/bugs/<name>.md`           | Bug root causes, fixes, and how to avoid recurrence |
| Infrastructure | `{docsDir}/memory/infrastructure/<name>.md` | Build, deploy, CI/CD, environment setup             |

**Category selection guide:**

- Fixing a bug → `bugs/` (root cause, fix, prevention), NOT `features/`
- Adding/changing a feature → `features/`
- Establishing a pattern or rule → `conventions/`
- Choosing between approaches → `decisions/`
- Build/deploy/tooling knowledge → `infrastructure/`

### Step 3: Assess Complexity

Before delegating to the cf-writer agent, assess the complexity of the content:

**Use `cf-writer` agent (haiku)** when:

- Simple feature docs, naming conventions, straightforward decisions
- Short content with clear structure

**Use `cf-writer-deep` agent (sonnet)** when:

- Complex architecture decisions with nuanced trade-offs
- Deep technical explanations requiring careful reasoning
- Long context that needs synthesis

### Step 4: Delegate to cf-writer Agent

Construct a write spec and invoke the appropriate cf-writer agent via the **Agent tool**.

Check if the target file already exists:

- File exists → `task: update`
- File doesn't exist → `task: create`

Read the `language` setting from config (local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`, default: `en`).

Build the write spec (use absolute path for `file_path`):

```
WRITE SPEC
----------
task: create | update
file_path: $CWD/{docsDir}/memory/{category}/{name}.md
language: {language from config}
content: |
  ---
  title: "<Title>"
  description: "<One-line summary for grep-based recall, under 100 chars>"
  tags: [tag1, tag2, tag3]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  type: "<type based on category>"
  importance: 3
  source: conversation
  ---

  # <Title>

  ## Overview
  <1-2 sentences describing this feature/convention/decision>

  ## Key Points
  - <point 1>
  - <point 2>

  ## Details
  <Longer explanation with code examples if needed>

  ## Gotchas
  - <gotcha 1>
  - <gotcha 2>

  ## Related
  - <link to related code/docs>
readme_update: false
auto_commit: false
existing_file_action: append
```

**Frontmatter rules:**

- `description` is the most important field — it enables fast grep-based recall without reading full docs. Write it as a factual, searchable summary.
- Good: `"Config management via .coding-friend/config.json with local/global override"` — specific, grep-friendly
- Bad: `"How we manage config"` — too vague, won't match grep queries
- `tags`: 3-5 relevant keywords as array
- When `task: update`, update the `updated` date in the existing frontmatter. Do NOT change `created`.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-writer"` or `"coding-friend:cf-writer-deep"` (based on Step 3 assessment) with the complete write spec as the prompt.

**MCP integration** (if `memory_store` MCP tool is available):

After the cf-writer saves the file, also call `memory_store` to index the memory:

- type: infer from category (features → fact, conventions → preference, decisions → context, bugs → episode, infrastructure → procedure)
- title/description/tags from the frontmatter above
- content: the full markdown content
- importance: 3 (default)
- source: "conversation"

This ensures the memory is both saved as a markdown file AND indexed for fast search. If the MCP tool is unavailable, the markdown file alone is sufficient — the memory system's file watcher will pick it up when the daemon is running.

### Step 5: Confirm

Read back the cf-writer agent's output and show the user what was saved and where.

## Interpreting `$ARGUMENTS`

`$ARGUMENTS` is free-form user input. It can express:

1. **A focus/filter** (most common) — the main idea, purpose, or requirement that narrows what to remember from the conversation.
   - Example: `/cf-remember the auth flow` → filter conversation for auth-related knowledge
   - Example: `/cf-remember why we chose Redis` → focus on that specific decision
   - Example: `/cf-remember gotchas from the migration` → extract only gotchas related to migration

2. **An explicit topic name** — only when the user clearly specifies a filename or category.
   - Example: `/cf-remember topic:caching-strategy` → use "caching-strategy" as the topic name
   - Example: `/cf-remember save as conventions/api-naming` → use the explicit path

**Default behavior**: Always auto-detect the topic name from the filtered content. Only use `$ARGUMENTS` as the literal topic name when the user explicitly indicates it (e.g., with "topic:", "save as", "call it", "name it").

When `$ARGUMENTS` acts as a filter:

- Use it to narrow which parts of the conversation to extract knowledge from
- Ignore conversation content that doesn't relate to the user's stated focus
- The topic name should be derived from the filtered content, not from `$ARGUMENTS` verbatim

## Rules

- If no arguments given, scan the entire conversation for key knowledge
- Be concise — bullet points over paragraphs
- Include code snippets only when they clarify the point
- Create directories as needed
