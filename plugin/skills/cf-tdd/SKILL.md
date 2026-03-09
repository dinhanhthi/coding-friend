---
name: cf-tdd
description: Use when writing new production code, adding features, or implementing changes
user-invocable: false
---

# Test-Driven Development

## Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-tdd`

If output is not empty, integrate the returned sections:

- `## Before` → apply before the main content below
- `## Rules` → apply as additional rules throughout
- `## After` → apply after the workflow completes

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

| Situation                                       | Action                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| "Let me just write the function first"          | NO. Write the test first.                                                 |
| "This is too simple to test"                    | If it's too simple to test, it's too simple to get wrong. Test it anyway. |
| "I'll add tests later"                          | No. Tests come FIRST. This is non-negotiable.                             |
| "The test framework isn't set up"               | Set it up. That's part of the work.                                       |
| "I already know what the code should look like" | Great. Describe it as a test first.                                       |
| "This is just a refactor"                       | Ensure existing tests pass before AND after.                              |

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

## Subagent Dispatch

For **substantial implementations** (new feature spanning 3+ files, complex algorithm, or multi-step feature), dispatch the **cf-implementer agent** instead of implementing inline. This preserves the main conversation's context and enforces TDD in an isolated execution.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-implementer"`. Pass:

- Task description and expected behavior
- Relevant file paths (source files, test files, config)
- Test framework and patterns used in the project
- Any constraints or edge cases

**Prompt template:**

> Implement the following using strict TDD:
>
> **Task:** [description]
> **Expected behavior:** [what the code should do]
> **Relevant files:** [paths]
> **Test patterns:** [framework, conventions, example test file]
> **Constraints:** [any limits or edge cases]
>
> Follow RED → GREEN → REFACTOR. Report results when done.

**When NOT to dispatch** (do TDD inline instead):

- Single-file changes or small functions
- Pure refactoring with existing test coverage
- When the user is actively pairing on the implementation

## Review Reminder

After implementation is complete and all tests pass, ask the user if they want to run `/cf-review` or `/cf-commit`. Do NOT auto-run — wait for their choice.
