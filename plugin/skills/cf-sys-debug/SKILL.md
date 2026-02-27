---
name: cf-sys-debug
description: Use when diagnosing bugs, investigating failures, or fixing broken behavior
---

# Systematic Debugging

## The 3-Fix Rule

If you've attempted 3+ fixes and the bug persists, **stop**. The problem is architectural, not local. Step back and re-examine your assumptions.

## 4-Phase Process

### Phase 1: Root Cause Investigation
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

## Common Traps

| Trap | Why It Fails | Do This Instead |
|---|---|---|
| "Let me just try this..." | Random fixes waste time and obscure the real cause | Form a hypothesis first |
| Adding a `try/catch` to suppress the error | Hides the bug, doesn't fix it | Find and fix the root cause |
| "It works on my machine" | Environment difference IS the bug | Compare environments systematically |
| Fixing where the error appears | Symptom vs cause confusion | Trace backward to the origin |
| Multiple changes at once | Can't tell which one fixed it | One change at a time, test after each |

## Debugging Tools

- `git bisect` — Find the exact commit that introduced a bug
- `git stash` — Isolate your changes to test clean state
- Print/log tracing — Add strategic logging at decision points
- Minimal reproduction — Smallest possible code that triggers the bug
