---
name: cf-tdd
description: >
  Use when writing new production code, adding features, implementing, or refactoring —
  e.g. "implement this", "build this feature", "create a function", "add a new endpoint",
  "write the implementation", "refactor this", "write a test", "add tests", "create a
  component", "implement the API", "add a route". Also auto-invoke when planning shifts to
  writing production code — load this first. Default: direct implementation (no new
  tests). TDD when `--add-tests` or config `tdd: true`. Do NOT auto-invoke for docs-only,
  config edits, or questions without requested changes.
user-invocable: false
created: 2026-02-17
updated: 2026-09-09
---

# Implementation Workflow

## Custom Guide

```!
bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-tdd
```

If the block above printed anything, apply only the `## Before`, `## Rules`, and `## After` sections; if it shows the raw command instead of output, re-run that exact `load-custom-guide.sh` fence now.

## Mode Detection

Determine the implementation mode BEFORE doing anything else:

1. Check if the user's invocation or task description contains `--add-tests`
2. Check if `.coding-friend/config.json` exists and has `"tdd": true`
3. Check if the user's invocation or task description contains `--auto` (orthogonal to mode — autopilot can combine with both Direct and TDD mode).

**Result:**

- `--add-tests` present OR `tdd: true` in config → **TDD mode**. Show: `> TDD mode enabled — RED → GREEN → REFACTOR`. → TDD mode: Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-tdd/modes/tdd-mode.md` now and follow RED→GREEN→REFACTOR.
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

Note: `--auto` enables the **Autopilot Post-Implementation Loop**. It does NOT change the implementation mode itself. → When `--auto` is active, Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-tdd/modes/autopilot-loop.md` now and run that loop instead of the standard Review Reminder.

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

Dispatch `cf-implementer`. Pass:

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

Follow `${CLAUDE_PLUGIN_ROOT}/lib/protocols/implementer-result.md` (parse `[CF-RESULT:`, one retry with `previous_failure`, escalate, cleanup). On success → Review Reminder. On both-attempts failure → wait for the user / Review Reminder; do not auto inline-fix.

**When NOT to dispatch** (implement inline instead):

- Single-file changes or small functions
- Pure refactoring with existing test coverage
- When the user is actively pairing on the implementation

## Review Reminder

After implementation is complete: if `--auto` is active, the Autopilot Post-Implementation Loop in `${CLAUDE_PLUGIN_ROOT}/skills/cf-tdd/modes/autopilot-loop.md` has already handled review and commit — skip this section. Otherwise, ask the user if they want to run `/cf-review` or `/cf-commit`. Do NOT auto-run — wait for their choice.
