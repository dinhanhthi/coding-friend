---
name: cf-sys-debug
description: Use when diagnosing bugs, investigating failures, or fixing broken behavior
user-invocable: false
---

# Systematic Debugging

## Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-sys-debug`

If output is not empty, integrate the returned sections:

- `## Before` → apply before the main content below
- `## Rules` → apply as additional rules throughout
- `## After` → apply after debugging completes

## The 3-Fix Rule

If you've attempted 3+ fixes and the bug persists, **stop**. The problem is architectural, not local. Step back and re-examine your assumptions.

## 4-Phase Process + Documentation

### Phase 1: Root Cause Investigation

**1a. Check existing bug docs** (memory recall):

Before investigating, search for related past bugs. Extract 2-3 keywords from the bug description.

**Primary — Memory MCP** (if `memory_search` tool is available):
Call `memory_search` with: `{ "query": "<bug keywords>", "type": "episode", "limit": 3 }`

**Fallback — grep** (if memory MCP unavailable):
Check `{docsDir}` from `.coding-friend/config.json` (default: `docs`).

1. Grep `^description:` lines across `{docsDir}/memory/bugs/**/*.md` — match against bug keywords
2. If no match, grep `^tags:` lines across `{docsDir}/memory/bugs/**/*.md`

If matches found, read the top 1-2 matched files — they may reveal known root causes or patterns that save investigation time.

**1b. Investigate:**

1. **Read the actual error.** Do not guess. Read the full stack trace, error message, and logs.
2. **Reproduce the bug.** Write a test or command that triggers the failure reliably.
3. **Trace backward.** Follow the call chain from the error to its origin. The bug is usually NOT where the error appears.

### Phase 2: Pattern Analysis

1. **When did it start?** Check recent changes: `git log --oneline -20`, `git diff HEAD~5`
2. **Is it consistent?** Does it fail every time, or intermittently? Intermittent = timing/state issue.
3. **What's the minimal reproduction?** Strip away everything unrelated until you have the smallest case.

### Phase 3: Hypothesis Testing

1. **Form one hypothesis.** "The bug is caused by X because Y."
2. **Design a test.** What observation would confirm or disprove this hypothesis?
3. **Test it.** Run the test. Read the output carefully.
4. **If disproved**, go back to Phase 1 with new information. Do NOT patch around it.

### Phase 4: Implementation

1. **Fix the root cause**, not the symptom
2. **Write a regression test** that would have caught this bug
3. **Run the full test suite** — your fix must not break anything else
4. **Verify the original error is gone** — reproduce the original failure and confirm it's fixed

### Phase 5: Document the Bug

cf-sys-debug is only invoked for hard bugs — always document the findings.

1. Read `language` config (local `.coding-friend/config.json` overrides global, default: `en`)
2. Check `{docsDir}` from `$CWD/.coding-friend/config.json` only (default: `docs`) — run `pwd` and substitute its actual output for `$CWD` (do NOT pass `$CWD` as a literal string), do NOT search sub-folders
3. Construct a write spec and delegate to **cf-writer agent** via the **Agent tool** with `subagent_type: "coding-friend:cf-writer"` (use absolute `file_path`):

```
WRITE SPEC
----------
task: create
file_path: $CWD/{docsDir}/memory/bugs/{name}.md
language: {language from config}
content: |
  ---
  title: "<Short bug title>"
  description: "<One-line summary of the bug and fix, under 100 chars>"
  tags: [tag1, tag2, tag3]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  type: episode
  importance: 4
  source: conversation
  ---

  # <Bug Title>

  ## Overview
  <What went wrong — symptom and why it was hard to diagnose>

  ## Investigation
  <What was tried and ruled out — hypotheses that didn't pan out>

  ## Root Cause
  <What was actually wrong — the real cause>

  ## Fix
  <What was changed to fix it>

  ## Prevention
  <How to avoid this bug in the future>

  ## Related Files
  - `path/to/file1`
  - `path/to/file2`
readme_update: false
auto_commit: false
existing_file_action: skip
```

**Frontmatter rules:**

- `description`: factual summary for grep recall. Good: `"Circular dependency in plugin loader causing silent init failure"`. Bad: `"Hard bug fixed"`.
- `tags`: include error type, affected module, root cause category (e.g., `[circular-dependency, plugin-loader, initialization]`)

### Index in CF Memory (MANDATORY)

**This step is REQUIRED — do NOT skip it.**

After the cf-writer saves the bug doc, you MUST call the `memory_store` MCP tool to index it in the database. This is a separate action from writing the file — the cf-writer agent does NOT do this.

Call `memory_store` with:

- `title`: from the frontmatter title
- `description`: from the frontmatter description
- `type`: `episode`
- `tags`: from the frontmatter tags
- `content`: the full markdown content (including frontmatter)
- `importance`: 4
- `source`: "auto-capture"
- `index_only`: true

If the MCP tool is unavailable, log a warning to the user but do NOT fail silently.

## Common Traps

| Trap                                       | Why It Fails                                       | Do This Instead                       |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------- |
| "Let me just try this..."                  | Random fixes waste time and obscure the real cause | Form a hypothesis first               |
| Adding a `try/catch` to suppress the error | Hides the bug, doesn't fix it                      | Find and fix the root cause           |
| "It works on my machine"                   | Environment difference IS the bug                  | Compare environments systematically   |
| Fixing where the error appears             | Symptom vs cause confusion                         | Trace backward to the origin          |
| Multiple changes at once                   | Can't tell which one fixed it                      | One change at a time, test after each |

## Debugging Tools

- `git bisect` — Find the exact commit that introduced a bug
- `git stash` — Isolate your changes to test clean state
- Print/log tracing — Add strategic logging at decision points
- Minimal reproduction — Smallest possible code that triggers the bug

## Review Reminder

After the fix is verified, ask the user if they want to run `/cf-review` or `/cf-commit`. Do NOT auto-run — wait for their choice.
