---
name: cf-sys-debug
description: Use when diagnosing bugs, investigating failures, or fixing broken behavior
user-invocable: false
---

# Systematic Debugging

## Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-sys-debug`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

## Core Constraint

**Do not touch code until you can state the root cause in one sentence:**

> "I believe the root cause is [X] because [evidence]."

Name a specific file, function, and line. "A state management issue" is not testable. "Stale cache in `useUser` at `src/hooks/user.ts:42` because the dependency array is missing `userId`" is testable. If you cannot be that specific, you do not have a hypothesis yet.

**Same symptom after a fix = hard stop.** Both a recurrence and "let me just try this" mean the hypothesis is unfinished. Re-read the execution path from scratch before touching code again.

**After 3 failed hypotheses, stop.** Use the Handoff Format below to surface what was checked, ruled out, and unknown. Ask how to proceed.

## Rationalization Watch

When these surface, stop and re-examine:

| Thought | What it means | Rule |
|---|---|---|
| "I'll just try this one thing" | No hypothesis, random-walking | Stop. Write the hypothesis first. |
| "I'm confident it's X" | Confidence is not evidence | Run an instrument that proves it. |
| "Probably the same issue as before" | Treating a new symptom as a known pattern | Re-read the execution path from scratch. |
| "It works on my machine" | Environment difference IS the bug | Enumerate every env difference before dismissing. |
| "One more restart should fix it" | Avoiding the error message | Read the last error verbatim. Never restart more than twice without new evidence. |

## Progress Signals

When these appear, the diagnosis is moving in the right direction:

| Thought | What it means | Next step |
|---|---|---|
| "This log line matches the hypothesis" | Positive evidence found | Find one more independent piece of evidence to cross-validate |
| "I can predict what the next error will be" | Mental model is forming | Run the prediction; if it matches, the model is correct |
| "Root cause is in A but symptoms appear in B" | Propagation path understood | Trace the call chain from A to B and confirm each link |
| "I can write a test that would fail on the old code" | Hypothesis is specific and testable | Write the test before applying the fix |

Do not claim progress without observable evidence matching at least one of these signals.

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
4. **Pay attention to deflection.** When someone says "that part doesn't matter," treat it as a signal. The area someone avoids examining is often where the problem lives.

### Bisect Mode

Activate when the symptom is "used to work, now broken" or "broke after an update". Random-walking forward from the current state wastes context and produces random fixes.

**Flow:**

1. Find `last-known-good` using the most recent tag where the behavior was correct: `git tag --sort=-version:refname | head -5`. Do not use a date or raw SHA as the anchor.
2. Define a pass/fail test command before starting. It must be runnable non-interactively and produce an unambiguous exit code. Write it once; reuse it at every step.
3. Run `git bisect start`, `git bisect bad` (current), `git bisect good <tag>`. Let bisect drive; do not jump ahead.
4. Context conservation: do not re-read large files at each step. Read once, note the key function or line, reference from notes.
5. When bisect names the culprit commit: read only that commit's diff, not surrounding history. Identify the specific line that introduced the regression.

### Phase 3: Hypothesis Testing

1. **Form one hypothesis** using the template: "The bug is caused by [X] because [evidence]." Name file and line.
2. **Add one targeted instrument:** a log line, a failing assertion, or the smallest test that would fail if the hypothesis is correct. Run it.
3. **If the evidence contradicts the hypothesis, discard it completely.** Re-orient with what was just learned. Do not preserve a hypothesis the evidence disproves.
4. **External tool failure: diagnose before switching.** When an MCP tool or API fails, determine why first (server running? API key valid? config correct?) before trying an alternative.
5. **Stack trace points into a library?** Walk back 3 frames into your own code. The bug is almost always there, not in the dependency.

### Phase 4: Implementation

1. **Fix the root cause**, not the symptom. If the fix touches more than 5 files, pause and confirm scope with the user.
2. **Regression Guard** — for any bug that recurred or was previously "fixed", the fix is not done until:
   - A regression test exists that fails on the unfixed code and passes on the fixed code
   - The test lives in the project's test suite, not a temporary file
   - The commit message states why the bug recurred and why this fix prevents it
3. **Write a regression test** that would have caught this bug
4. **Run the full test suite** — your fix must not break anything else
5. **Verify the original error is gone** — reproduce the original failure and confirm it's fixed

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

Show the user a 2-line summary:

- **Markdown file:** `{docsDir}/memory/bugs/...md` (created or updated)
- **Memory DB:** indexed ✓ — or: MCP unavailable, file only

## Gotchas

| What happened | Rule |
|---|---|
| Patched symptom file instead of origin | Trace the execution path backward before touching any file |
| MCP not loading, switched tools instead of diagnosing | Check server status, API key, config before switching |
| Orchestrator said RUNNING but a downstream stage was misconfigured | In multi-stage pipelines, test each stage in isolation |
| Race condition diagnosed as stale-state bug | For timing-sensitive issues, inspect event timestamps and ordering before state |
| Reproduced locally but failed in CI | Align the environment first (runtime version, env vars, timezone), then chase the code |
| Stack trace points deep into a library | Walk back 3 frames into your own code; the bug is almost always there |
| Adding a `try/catch` to suppress the error | Hides the bug, doesn't fix it — find and fix the root cause |
| Multiple changes at once | Can't tell which one fixed it — one change at a time, test after each |

## Debugging Tools

- `git bisect` — Find the exact commit that introduced a bug
- `git stash` — Isolate your changes to test clean state
- Print/log tracing — Add strategic logging at decision points
- Minimal reproduction — Smallest possible code that triggers the bug

## Outcome

### Success Format

```
Root cause:        [what was wrong, file:line]
Fix:               [what changed, file:line]
Confirmed:         [evidence or test that proves the fix]
Tests:             [pass/fail count, regression test location]
Regression guard:  [test file:line] or [none, reason]
```

Status: **resolved**, **resolved with caveats** (state them), or **blocked** (state what is unknown).

### Handoff Format (after 3 failed hypotheses)

```
Symptom:
[Original error description, one sentence]

Hypotheses Tested:
1. [Hypothesis 1] → [Test method] → [Result: ruled out because...]
2. [Hypothesis 2] → [Test method] → [Result: ruled out because...]
3. [Hypothesis 3] → [Test method] → [Result: ruled out because...]

Evidence Collected:
- [Log snippets / stack traces / file content]
- [Reproduction steps]
- [Environment info: versions, config, runtime]

Ruled Out:
- [Root causes that have been eliminated]

Unknowns:
- [What is still unclear]
- [What information is missing]

Suggested Next Steps:
1. [Next investigation direction]
2. [External tools or permissions that may be needed]
3. [Additional context the user should provide]
```

Status: **blocked**

## Review Reminder

After the fix is verified, ask the user if they want to run `/cf-review` or `/cf-commit`. Do NOT auto-run — wait for their choice.
