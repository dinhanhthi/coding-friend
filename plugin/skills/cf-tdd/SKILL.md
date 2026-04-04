---
name: cf-tdd
description: >
  Use when writing new production code, adding features, implementing changes, or refactoring
  existing code — e.g. "implement this", "build this feature", "create a function", "add a new
  endpoint", "write the implementation", "refactor this", "clean up this code", "extract into
  a module", "simplify this function", "scaffold", "write a test", "add tests", "create a
  component", "implement the API", "add a route", "write a service", "create the handler".
  Also auto-invoke when the conversation transitions from planning/discussion to actual code
  writing — any time production code is about to be written, this skill MUST be loaded first.
  This is the MANDATORY gate for all code writing in the project. Do NOT auto-invoke for
  documentation-only changes, config edits, non-code file updates, or when the user is only
  asking questions about code without requesting changes.
user-invocable: false
---

# Test-Driven Development

## Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-tdd`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

## Skip Conditions

Check these BEFORE starting any TDD step. If a skip condition is met, bypass TDD entirely and proceed directly to implementation.

### Auto-skip whitelist

If **ALL** changed/new files match these extensions, skip TDD — note why and proceed:

- **Styles**: `.css`, `.scss`, `.sass`, `.less`, `.styl`
- **Docs**: `.md`, `.mdx`, `.txt`, `.rst`
- **Config**: `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.ini`, `.lock`, `.config`

### `--no-tdd` flag

If the user's invocation includes `--no-tdd`, skip TDD. Show a one-line acknowledgment:

> TDD skipped via --no-tdd

Then proceed directly to implementation.

---

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

### Context Handoff Protocol

Before dispatching, create a structured context file for the agent:

1. **Generate a task-id**: use format `<timestamp>-<short-descriptor>` (e.g., `1717500000-add-auth-middleware`)
2. **Determine docsDir**: read from `.coding-friend/config.json` if present, default to `docs`
3. **Context file path**: `{docsDir}/context/{task-id}.json`

If dispatching cf-explorer or cf-planner first, pass the context file path so they write their findings to it. The cf-implementer will then read and consume the same file.

### Dispatch

Use the **Agent tool** with `subagent_type: "coding-friend:cf-implementer"`. Pass:

- Task description and expected behavior
- Context file path (if cf-explorer/cf-planner wrote one)
- Relevant file paths (source files, test files, config)
- Test framework and patterns used in the project
- Any constraints or edge cases

**Prompt template:**

> Implement the following using strict TDD:
>
> **Task:** [description]
> **Context file:** [path to docs/context/<task-id>.json, or "none"]
> **Expected behavior:** [what the code should do]
> **Relevant files:** [paths]
> **Test patterns:** [framework, conventions, example test file]
> **Constraints:** [any limits or edge cases]
>
> Follow RED → GREEN → REFACTOR. Report results when done.

### Retry on Failure

After the cf-implementer returns, **parse the last line** of its response for the result signal:

- `[CF-RESULT: success]` → proceed to Review Reminder
- `[CF-RESULT: failure] <reason>` → trigger retry (see below)
- No signal found → treat as success (backward compatibility)

**Retry protocol** (max 1 retry):

1. **Notify the user** (always visible — never retry silently):

   ```
   > ⟳ Attempt 1 failed (<reason>). Retrying with error context...
   ```

2. **Update the context file** — write the failure details to `{docsDir}/context/{task-id}.json`:

   ```json
   {
     "task_id": "<task-id>",
     "task_summary": "<original task>",
     "relevant_files": ["..."],
     "key_findings": ["..."],
     "constraints": ["..."],
     "suggested_approach": "...",
     "previous_failure": {
       "reason": "<tests-failed|compile-error|empty-output>",
       "error_summary": "<brief error details from the agent's response>",
       "attempt": 1
     }
   }
   ```

3. **Re-dispatch cf-implementer** with the updated context file path and an amended prompt:

   > **RETRY** — Previous attempt failed: [reason]. Error details: [summary].
   > Review the context file at [path] for full failure context.
   > [original prompt]

4. **If retry also fails**, escalate to user:

   ```
   > ✗ Both attempts failed. Summary:
   > - Attempt 1: <reason>
   > - Attempt 2: <reason>
   > Please review and guide the next step.
   ```

5. **Cleanup**: If the workflow completes (success or final escalation), delete the context file if it still exists. If the user cancels mid-workflow, delete the context file to avoid orphans.

**When NOT to dispatch** (do TDD inline instead):

- Single-file changes or small functions
- Pure refactoring with existing test coverage
- When the user is actively pairing on the implementation

## Review Reminder

After implementation is complete and all tests pass, ask the user if they want to run `/cf-review` or `/cf-commit`. Do NOT auto-run — wait for their choice.
