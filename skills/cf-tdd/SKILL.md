---
name: cf-tdd
version: 1.5.0
description: Use when writing new production code, adding features, or implementing changes
---

# Test-Driven Development

## The Iron Law

**No production code without a failing test first.**

Code written before a test exists must be deleted and rewritten test-first. No exceptions.

## Cycle: RED → GREEN → REFACTOR

### RED — Write a failing test
1. Write the smallest test that describes the desired behavior
2. Run it. It MUST fail. If it passes, you don't need this code.
3. The failure message should clearly describe what's missing

### GREEN — Make it pass
1. Write the **minimum** production code to make the test pass
2. No extra features, no "while I'm here" improvements
3. Run the test. It MUST pass.

### REFACTOR — Clean up
1. Remove duplication between test and production code
2. Improve naming, extract functions if needed
3. Run ALL tests. They MUST still pass.

## Rules

| Situation | Action |
|---|---|
| "Let me just write the function first" | NO. Write the test first. |
| "This is too simple to test" | If it's too simple to test, it's too simple to get wrong. Test it anyway. |
| "I'll add tests later" | No. Tests come FIRST. This is non-negotiable. |
| "The test framework isn't set up" | Set it up. That's part of the work. |
| "I already know what the code should look like" | Great. Describe it as a test first. |
| "This is just a refactor" | Ensure existing tests pass before AND after. |

## Test Quality Checklist

- [ ] Test describes behavior, not implementation
- [ ] Test has a clear failure message
- [ ] Test is independent (no shared mutable state)
- [ ] Test runs fast (<1s)
- [ ] One assertion per test (or closely related assertions)

## Anti-Patterns

1. **Testing mocks, not behavior** — If your test only verifies mock calls, it tests nothing
2. **Test-only methods in production** — Never add methods just to make testing easier
3. **Integration test as afterthought** — Unit tests first, then integration tests for boundaries
