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

### Step 5: Fix
1. Fix the **root cause**, not the symptom
2. Do NOT add try/catch to suppress errors
3. Do NOT make multiple changes at once — one fix at a time

### Step 6: Verify
1. Run the failing test — it must now pass
2. Run the full test suite — no regressions
3. Show the test output as evidence

### Step 7: Regression Test
If no test existed for this bug, write one that would catch it if reintroduced.

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
