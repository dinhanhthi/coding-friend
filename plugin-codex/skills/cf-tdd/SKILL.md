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
  By default uses direct implementation (no new tests written). TDD is enabled when `--add-tests`
  is present or config `tdd: true`. This is the gate for all code writing in the project.
  Do NOT auto-invoke for documentation-only changes, config edits, non-code file updates,
  or when the user is only asking questions about code without requesting changes.
created: 2026-02-17
updated: 2026-07-04
---

# Implementation Workflow

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

## Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-tdd
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

## Mode Detection

Determine the implementation mode BEFORE doing anything else:

1. Check if the user's invocation or task description contains `--add-tests`
2. Check if `.coding-friend/config.json` exists and has `"tdd": true`
3. Check if the user's invocation or task description contains `--auto` (orthogonal to mode — autopilot can combine with both Direct and TDD mode).

**Result:**

- `--add-tests` present OR `tdd: true` in config → **TDD mode**. Show: `> TDD mode enabled — RED → GREEN → REFACTOR`. → TDD mode: Read `${PLUGIN_ROOT}/skills/cf-tdd/modes/tdd-mode.md` now and follow RED→GREEN→REFACTOR.
- Neither → **Direct mode** (default). Show: `> Direct mode — implementing without new tests`
- Additionally, if `--auto` is present → **Autopilot active**. Show: `> 🤖 Autopilot enabled — will auto-review, auto-fix Critical+Important, and auto-commit after implementation.`

## Skip Conditions

Check these BEFORE starting. If a skip condition is met, bypass the workflow entirely and proceed directly to implementation.

### Auto-skip whitelist

If **ALL** changed/new files match these extensions, skip entirely — note why and proceed:

- **Styles**: `.css`, `.scss`, `.sass`, `.less`, `.styl`
- **Docs**: `.md`, `.mdx`, `.txt`, `.rst`
- **Config**: `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.ini`, `.lock`, `.config`

### `--no-tdd` flag

Deprecated — direct mode is now the default. If present, acknowledge and proceed in direct mode:

> `--no-tdd` is now the default. Proceeding in direct mode.

### `--auto` flag

Note: `--auto` enables the **Autopilot Post-Implementation Loop**. It does NOT change the implementation mode itself. → When `--auto` is active, Read `${PLUGIN_ROOT}/skills/cf-tdd/modes/autopilot-loop.md` now and run that loop instead of the standard Review Reminder.

---

## Direct Mode (default)

1. Read the task description and relevant existing code
2. Implement the feature directly — no test writing
3. Run existing tests if a test suite exists — fix failures before reporting
4. Run typecheck/lint if available
5. Report what was implemented

## Subagent Dispatch

For **substantial implementations** (new feature spanning 3+ files, complex algorithm, or multi-step feature), dispatch the **cf-implementer agent** instead of implementing inline. This preserves the main conversation's context.

### Context Handoff Protocol

Before dispatching, create a structured context file for the agent:

1. **Generate a task-id**: use format `<timestamp>-<short-descriptor>` (e.g., `1717500000-add-auth-middleware`)
2. **Determine docsDir**: read from `.coding-friend/config.json` if present, default to `docs`
3. **Context file path**: `{docsDir}/context/{task-id}.json`

If dispatching cf-explorer or cf-planner first, pass the context file path so they write their findings to it. The cf-implementer will then read and consume the same file.

### Dispatch

Spawn the `cf-implementer` custom agent. Pass:

- Task description and expected behavior
- `--add-tests` in the prompt if TDD mode is active
- Context file path (if cf-explorer/cf-planner wrote one)
- Relevant file paths (source files, test files, config)
- Test framework and patterns used in the project (if TDD mode)
- Any constraints or edge cases

**Prompt template:**

> Implement the following [--add-tests if TDD mode]:
>
> **Task:** [description]
> **Context file:** [path to docs/context/<task-id>.json, or "none"]
> **Expected behavior:** [what the code should do]
> **Relevant files:** [paths]
> **Test patterns:** [framework, conventions, example test file — only if TDD mode]
> **Constraints:** [any limits or edge cases]

**Autopilot note**: If cf-tdd was invoked with `--auto`, do NOT include `--auto` in the cf-implementer dispatch prompt. cf-implementer just executes a single task; the review/fix/commit loop is handled at this (cf-tdd) level.

### Retry on Failure

After the cf-implementer returns, **parse the last non-empty line** of its response for the result signal using a strict regex match — `^\[CF-RESULT: (success|failure)( .*)?\]$`:

- `[CF-RESULT: success]` → proceed to Review Reminder
- `[CF-RESULT: failure] <reason>` → trigger retry (see below)
- **Sentinel missing, malformed, or not on the last non-empty line → treat as failure** with reason `empty-output`. Never assume silent success — a truncated or aborted agent run may produce output that looks complete but skipped the result signal.

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

**When NOT to dispatch** (implement inline instead):

- Single-file changes or small functions
- Pure refactoring with existing test coverage
- When the user is actively pairing on the implementation

## Review Reminder

After implementation is complete: if `--auto` is active, the Autopilot Post-Implementation Loop in `${PLUGIN_ROOT}/skills/cf-tdd/modes/autopilot-loop.md` has already handled review and commit — skip this section. Otherwise, ask the user if they want to run `$cf-review` or `$cf-commit`. Do NOT auto-run — wait for their choice.
