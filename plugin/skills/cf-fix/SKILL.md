---
name: cf-fix
description: >
  Quick bug fix workflow. Use when the user reports a bug, error, or broken behavior — e.g.
  "fix this", "it's broken", "not working", "there's a bug", "I'm getting an error",
  "this crashes", "something is wrong", "why does this fail", "debug this", "it throws",
  "fix the issue", "resolve this error", "help me fix", "can you fix", "this doesn't work",
  "stopped working", "regression", "unexpected behavior", "failing test", "broken after update".
  Also triggers on stack traces, error messages, or descriptions of incorrect program behavior.
---

# /cf-fix

Fix the bug: **$ARGUMENTS**

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-fix`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Understand the Bug

1. Read the error message or bug description from `$ARGUMENTS`
2. If no clear error, **ask the user** to describe the expected vs actual behavior
3. If the bug description is vague, ask: what did you expect? what happened instead? when does it happen?

### Step 2: Verify the Problem Exists

1. Run the failing test or command that triggers the bug
2. Capture the exact error output
3. If you **cannot reproduce**, tell the user and ask for more context — do NOT guess
4. If no test exists, write one that demonstrates the failure

### Step 3: Recall Past Bugs + Explore Relevant Code

**3a. Check existing bug docs** (memory recall):

Before exploring, search for related past bugs. Extract 2-3 keywords from the bug description.

**Primary — Memory MCP** (if `memory_search` tool is available):
Call `memory_search` with: `{ "query": "<bug keywords>", "type": "episode", "limit": 3 }`

**Fallback — grep** (if memory MCP unavailable):
Check `{docsDir}` from `.coding-friend/config.json` (default: `docs`).

1. Grep `^description:` lines across `{docsDir}/memory/bugs/**/*.md` — match against bug keywords
2. If no match, grep `^tags:` lines across `{docsDir}/memory/bugs/**/*.md`

If matches found, read the top 1-2 matched files — they may reveal known root causes or patterns.
Include any relevant findings as context for the explorer.

**3b. Explore relevant code** (via cf-explorer agent):

Launch the **cf-explorer agent** to gather context around the bug.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass:

> Explore the codebase to help diagnose this bug: [bug description from $ARGUMENTS]
>
> Error output: [from Step 2]
>
> [If past bug docs were found in 3a]:
> Related past bugs found in memory:
> [summary of relevant findings]
>
> Questions to answer:
>
> 1. What does the code path look like from the error location backward to the origin?
> 2. What are the relevant files, functions, and dependencies involved?
> 3. Are there existing tests covering this area?
> 4. What patterns or conventions might be relevant to the fix?

Wait for the cf-explorer to return its findings.

### Step 4: Locate Root Cause

Using the cf-explorer's findings:

1. Read the error — full stack trace, not just the message
2. Trace backward from where the error appears to where it originates
3. The bug is usually NOT where the error shows up
4. **State your hypothesis** for the root cause before fixing — if unsure, say so and ask

### Step 5: Confirm Approach

Before changing code:

1. Tell the user what you believe the root cause is
2. Explain what you plan to change and why
3. If you're not confident, say so — ask for the user's input

### Step 6: Implement Fix (via cf-implementer agent)

Dispatch the **cf-implementer agent** to fix the bug test-first. Use the **Agent tool** with `subagent_type: "coding-friend:cf-implementer"`.

**Prompt template:**

> Fix the following bug using strict TDD:
>
> **Bug:** [description from $ARGUMENTS]
> **Root cause:** [from Step 4]
> **Fix approach:** [confirmed in Step 5]
> **Failing test/command:** [from Step 2]
> **Relevant files:** [paths from explorer findings + root cause analysis in Step 4]
> **Test patterns:** [framework, test file locations, run command]
>
> Requirements:
>
> 1. If no regression test exists for this bug, write one first that demonstrates the failure
> 2. Fix the root cause — not the symptom. No try/catch to suppress errors.
> 3. One fix at a time — no additional changes
> 4. Run the full test suite — no regressions allowed
> 5. Report: what was fixed, tests written, and full test output as evidence

### Step 7: Verify Agent Results

1. Review the cf-implementer's report — confirm the fix addresses the root cause from Step 4
2. If tests are still failing or the report shows concerns, provide more context and re-dispatch
3. If the agent could not fix it after a reasonable attempt, fall back to fixing inline following TDD discipline

### Step 8: Save Bug Knowledge (conditional)

**Only run this step if the fix required more than 1 attempt** (i.e., the first fix attempt in Step 6/7 did not succeed and required re-dispatch or inline fixing). If the fix succeeded on the first attempt, skip to Step 9.

1. Read `language` config (local `.coding-friend/config.json` overrides global, default: `en`)
2. Construct a write spec and delegate to **cf-writer agent** via the **Agent tool** with `subagent_type: "coding-friend:cf-writer"` (use absolute path for `file_path` — run `pwd` and substitute its actual output for `$CWD`, only check `$CWD/.coding-friend/config.json` for `docsDir`, do NOT pass `$CWD` as a literal string):

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
  importance: 3
  source: conversation
  ---

  # <Bug Title>

  ## Overview
  <What went wrong — symptom and context>

  ## Root Cause
  <What was actually wrong — the real cause, not the symptom>

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

- `description`: factual summary for grep recall. Good: `"Race condition in webhook handler causing duplicate payment processing"`. Bad: `"Fixed a bug"`.
- `tags`: include error type, affected module, root cause category (e.g., `[race-condition, webhooks, payments]`)

### Step 8b: Index in CF Memory (MANDATORY)

**This step is REQUIRED — do NOT skip it.**

After the cf-writer saves the bug doc, you MUST call the `memory_store` MCP tool to index it in the database. This is a separate action from writing the file — the cf-writer agent does NOT do this.

Call `memory_store` with:

- `title`: from the frontmatter title
- `description`: from the frontmatter description
- `type`: `episode`
- `tags`: from the frontmatter tags
- `content`: the full markdown content (including frontmatter)
- `importance`: 3 (default)
- `source`: "auto-capture"
- `index_only`: true

If the MCP tool is unavailable, log a warning to the user but do NOT fail silently.

### Step 9: Auto-Review

Automatically invoke `/cf-review` — use the **Skill tool** with skill name `coding-friend:cf-review`. Do NOT ask the user first, just run it.

### Step 10: Performance Suggestion (conditional)

If the bug fix involved **performance-critical code** — e.g. database queries, API endpoints, loops over large datasets, memory management, caching, or I/O operations — suggest running `/cf-optimize` on the affected code path. Present it as an optional next step, do NOT auto-run.

Example: _"The fix touched a database query path. Want to run `/cf-optimize` on it to verify performance hasn't regressed and look for optimization opportunities?"_

If the fix was not performance-related, skip this step.

## Completion Protocol

When the fix is complete (after Step 9/10), report status:

- **DONE** — Bug fixed, tests pass, review clean. Show: root cause summary + files changed + test evidence.
- **DONE_WITH_CONCERNS** — Bug fixed but with caveats. Show: what was fixed + what concerns remain (e.g., "fix is correct but the function has other issues worth addressing").
- **BLOCKED** — Cannot fix. Show: what was tried, what failed, what information is needed to proceed.

## Escalation

If you've tried **2 fixes** and the bug still persists, before attempting a 3rd fix:

1. **Suggest `/cf-learn`** — Ask the user: _"This bug is taking multiple attempts. Want to run `/cf-learn` to capture the debugging insights so far before continuing?"_
2. If the user agrees, invoke `/cf-learn` via the **Skill tool** with skill name `coding-friend:cf-learn`
3. Then proceed with the 3rd attempt

If you've tried **3 fixes** and the bug persists:

1. Stop fixing
2. Load the `cf-sys-debug` skill
3. Follow its full 4-phase process — the bug is likely deeper than expected

## Quick Checks

Before diving deep, try these common causes first:

- **Typo in variable/function name?** Check spelling
- **Wrong import path?** Check relative vs absolute
- **Stale cache/build?** Clean and rebuild
- **Missing dependency?** Check package.json/requirements
- **Environment mismatch?** Check env vars, node version, etc.
