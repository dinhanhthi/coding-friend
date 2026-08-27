---
name: cf-fix
description: >
  Quick bug fix workflow. Use when the user reports a bug or broken behavior — e.g. "fix
  this", "it's broken", "not working", "there's a bug", "this crashes", "debug this", "it
  throws", "failing test", "regression", "unexpected behavior". Also triggers on stack
  traces or error messages.
created: 2026-02-17
updated: 2026-08-27
---

# /cf-fix

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

Fix the bug: **$ARGUMENTS**

## Workflow

### Step 0: Custom Guide

```!
bash "<plugin-root>/lib/load-custom-guide.sh" cf-fix
```

If output is not empty: `## Before` → before first step, `## Rules` → throughout, `## After` → after final step.

### Step 1: Understand the Bug

1. Read the error or description from `$ARGUMENTS`
2. If unclear, ask expected vs actual, and when it happens

### Step 2: Verify the Problem Exists

1. Run the failing test or command; capture exact output
2. If you **cannot reproduce**, tell the user and ask for context — do NOT guess
3. No test AND `--add-tests` (alias `--tdd`) → write one that fails. Else reproduce via existing tests or by running the code.

### Step 3: Recall Past Bugs + Explore Relevant Code

**3a. Check existing bug docs** (memory recall):

Extract 2–3 keywords from the bug.

**Primary — Memory MCP** (if `memory_search` is available):
`{ "query": "<bug keywords>", "type": "episode", "limit": 3 }`

**Fallback — grep** (`{docsDir}` from `.coding-friend/config.json`, default `docs`):

1. Grep `^description:` in `{docsDir}/memory/bugs/**/*.md`
2. Else grep `^tags:`

Read the top 1–2 matches; pass relevant findings to the explorer.

**3b. Generate task-id and explore** (cf-explorer):

1. **task-id**: `YYYY-MM-DD-<short-descriptor>`
2. **docsDir**: `.coding-friend/config.json` or `docs`
3. **Context file**: `{docsDir}/context/{task-id}.json`

Call `invoke_subagent` with agent `cf-explorer`. Pass:

> Diagnose this bug: [from $ARGUMENTS]
> Error output: [Step 2]
> **Context file:** write structured findings to [docsDir/context/<task-id>.json]
> [If 3a hits]: Related past bugs: [summary]
> Answer: (1) error path backward to origin (2) files/functions/deps (3) existing tests (4) relevant patterns

Wait for findings.

### Step 4: Locate Root Cause

Using explorer findings:

1. Read the full stack trace, not just the message
2. Trace backward from the error to its origin
3. **Hypothesis** (exact template) before fixing:

   > "I believe the root cause is [X] because [evidence]."

   Name file, function, and line. Vague labels are not a hypothesis.

4. **Rationalization Watch** — stop and re-examine if any appear:

   | Thought                             | Rule                                                                  |
   | ----------------------------------- | --------------------------------------------------------------------- |
   | "I'll just try this one thing"      | Write the hypothesis first                                            |
   | "Probably the same issue as before" | Re-read the execution path from scratch                               |
   | "One more restart should fix it"    | Read the last error verbatim. Max two restarts without new evidence   |
   | "I'm confident it's X"              | Confidence is not evidence — instrument it                            |

### Step 5: Confirm Approach

Before changing code:

1. State the root cause (Step 4 template)
2. Say what you will change and why
3. If unsure, say so and ask
4. **Same symptom after a fix = hard stop.** New hypothesis + new evidence required. Escalate to cf-sys-debug if the symptom recurs unchanged.

### Step 6: Implement Fix (via cf-implementer agent)

Dispatch the **cf-implementer** agent. Call `invoke_subagent` with agent `cf-implementer`. Pass the Step 3b context file.

**Prompt template:**

> Fix the following bug:
>
> **Bug:** [from $ARGUMENTS]
> **Context file:** [docsDir/context/<task-id>.json]
> **Root cause:** [Step 4]
> **Fix approach:** [Step 5]
> **Failing test/command:** [Step 2]
> **Relevant files:** [explorer + Step 4]
> **Test patterns:** [framework, locations, run command]
>
> Requirements:
>
> 1. `--add-tests` and no regression test → write a failing test first. Else fix directly.
> 2. Fix the root cause, not the symptom. No try/catch to suppress errors.
> 3. One fix at a time
> 4. Full test suite — no regressions
> 5. Report: what was fixed, tests written, full test output

**Out-of-scope side-effects:** if you notice a non-trivial problem **unrelated to this bug**, do not fix it inline. Record it, then continue:

```bash
bash "<plugin-root>/lib/capture-later.sh" \
  --name "<short title>" --description "<what & where — enough to act on cold>" \
  --source cf-fix [--slug <bug-doc/task slug, if one exists>] [--problem "<the bug being fixed>"]
```

Writes `<docsDir>/later/YYYY-MM-DD-<name>.md` (frontmatter: slug, problem, conversation_id). Trivial fixes the bug requires stay inline.

### Step 7: Verify Agent Results + Retry on Failure

Parse the **last non-empty line** of the implementer response — `^\[CF-RESULT: (success|failure)( .*)?\]$`:

- `[CF-RESULT: success]` → Step 8
- `[CF-RESULT: failure] <reason>` → retry
- Missing, malformed, or not last non-empty line → failure, reason `empty-output`. Never assume silent success.

**On success:** confirm the report matches the Step 4 root cause, then Step 8.

**Retry protocol** (max 1 retry):

1. Notify:

   ```
   > ⟳ Attempt 1 failed (<reason>). Retrying with error context...
   ```

2. Update `{docsDir}/context/{task-id}.json` — add `previous_failure`:

   ```json
   {
     "previous_failure": {
       "reason": "<tests-failed|compile-error|empty-output>",
       "error_summary": "<brief details from the agent>",
       "attempt": 1
     }
   }
   ```

   Keep existing keys (`task_id`, `task_summary`, `relevant_files`, `key_findings`, `constraints`, `suggested_approach`).

3. Re-dispatch cf-implementer:

   > **RETRY** — Previous attempt failed: [reason]. Error details: [summary].
   > Review the context file at [path] for full failure context.
   > [original prompt from Step 6]

4. Retry fails → escalate:

   ```
   > ✗ Both attempts failed. Summary:
   > - Attempt 1: <reason>
   > - Attempt 2: <reason>
   > Please review and guide the next step.
   ```

   Then inline-fix with TDD discipline, or load `cf-sys-debug` if the user prefers.

5. **Cleanup:** delete the context file after success, escalation, or cancel.

### Step 8: Save Bug Knowledge (conditional)

**Only if the first Step 6/7 attempt failed** (re-dispatch or inline fix). First-attempt success → skip to Step 9.

1. Read `language` (local `.coding-friend/config.json` overrides global, default `en`)
2. Delegate to **cf-writer** by calling `invoke_subagent` with agent `cf-writer`. Absolute `file_path`: `MAIN_REPO_ROOT` from bootstrap (fallback `pwd`), config from `CF_CONFIG_FILE`, docs base `CF_DOCS_ROOT`.

```
WRITE SPEC
----------
task: create
file_path: {CF_DOCS_ROOT}/memory/bugs/YYYY-MM-DD-{name}.md
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
  <Symptom and context>

  ## Root Cause
  <Real cause, not the symptom>

  ## Fix
  <What changed>

  ## Prevention
  <How to avoid it>

  ## Related Files
  - `path/to/file`
readme_update: false
auto_commit: false
existing_file_action: skip
```

Existing bug files without a date prefix stay as-is — do not rename.

**Frontmatter:** `description` is a factual grep summary (not "Fixed a bug"). `tags`: error type, module, root-cause category.

### Step 8b: Index in CF Memory (MANDATORY)

**Required — do not skip.** After cf-writer saves the file, call `memory_store` yourself (the writer does not):

- `title` / `description` / `tags` from frontmatter
- `type`: `episode`
- `content`: full markdown including frontmatter
- `importance`: 3
- `source`: "auto-capture"
- `index_only`: true

If MCP is unavailable, warn the user — do not fail silently.

2-line summary:

- **Markdown file:** `{docsDir}/memory/bugs/...md` (created or updated)
- **Memory DB:** indexed ✓ — or: MCP unavailable, file only

### Step 9: Auto-Review

Automatically invoke `/cf-review` — activate the `cf-review` skill (type `/cf-review`). Do not ask first.

On Google Antigravity, cf-review uses the native Coding Friend multi-agent review and ignores the Claude-only `review.withCodex` setting.

### Step 10: Performance Suggestion (conditional)

If the fix touched performance-critical code (queries, APIs, large loops, memory, cache, I/O), suggest `/cf-optimize` as optional — do not auto-run. Skip otherwise.

## Completion Protocol

After Step 9/10:

**On success:**

```
Root cause:   [what was wrong, file:line]
Fix:          [what changed, file:line]
Confirmed:    [evidence or test that proves the fix]
Tests:        [pass/fail count, regression test location]
```

Status: **DONE**, **DONE_WITH_CONCERNS** (state caveats), or **BLOCKED** (what is unknown and what is needed).

## Escalation

After **2 failed fixes**, before a 3rd:

1. Suggest `/cf-learn` to capture debugging insights so far
2. If the user agrees, invoke `/cf-learn` — activate the `cf-learn` skill (type `/cf-learn`)
3. Then attempt the 3rd fix

After **3 failed fixes**:

1. Stop
2. Load `cf-sys-debug`
3. Follow its 4-phase process

## Quick Checks

Try first: typo / wrong import / stale cache or build / missing dependency / env or runtime mismatch.
