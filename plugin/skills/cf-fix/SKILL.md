---
name: cf-fix
description: Quick bug fix workflow
disable-model-invocation: true
---

# /cf-fix

Fix the bug: **$ARGUMENTS**

## Workflow

### Step 1: Understand the Bug

1. Read the error message or bug description from `$ARGUMENTS`
2. If no clear error, **ask the user** to describe the expected vs actual behavior
3. If the bug description is vague, ask: what did you expect? what happened instead? when does it happen?

### Step 2: Verify the Problem Exists

1. Run the failing test or command that triggers the bug
2. Capture the exact error output
3. If you **cannot reproduce**, tell the user and ask for more context — do NOT guess
4. If no test exists, write one that demonstrates the failure

### Step 3: Locate Root Cause

1. Read the error — full stack trace, not just the message
2. Trace backward from where the error appears to where it originates
3. The bug is usually NOT where the error shows up
4. **State your hypothesis** for the root cause before fixing — if unsure, say so and ask

### Step 4: Confirm Approach

Before changing code:

1. Tell the user what you believe the root cause is
2. Explain what you plan to change and why
3. If you're not confident, say so — ask for the user's input

### Step 5: Implement Fix (via implementer agent)

Dispatch the **implementer agent** to fix the bug test-first. Use the **Agent tool** with `subagent_type: "coding-friend:implementer"`.

**Prompt template:**

> Fix the following bug using strict TDD:
>
> **Bug:** [description from $ARGUMENTS]
> **Root cause:** [from Step 3]
> **Fix approach:** [confirmed in Step 4]
> **Failing test/command:** [from Step 2]
> **Relevant files:** [paths and line numbers from Step 3]
> **Test patterns:** [framework, test file locations, run command]
>
> Requirements:
> 1. If no regression test exists for this bug, write one first that demonstrates the failure
> 2. Fix the root cause — not the symptom. No try/catch to suppress errors.
> 3. One fix at a time — no additional changes
> 4. Run the full test suite — no regressions allowed
> 5. Report: what was fixed, tests written, and full test output as evidence

### Step 6: Verify Agent Results

1. Review the implementer's report — confirm the fix addresses the root cause from Step 3
2. If tests are still failing or the report shows concerns, provide more context and re-dispatch
3. If the agent could not fix it after a reasonable attempt, fall back to fixing inline following TDD discipline

### Step 7: Review Reminder

Ask the user if they want to run `/cf-review` or `/cf-commit`. Do NOT auto-run — wait for their choice.

## Escalation

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
