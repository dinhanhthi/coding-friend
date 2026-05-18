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
user-invocable: false
created: 2026-02-17
updated: 2026-05-02
---

# Implementation Workflow

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

## Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-tdd`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

## Mode Detection

Determine the implementation mode BEFORE doing anything else:

1. Check if the user's invocation or task description contains `--add-tests`
2. Check if `.coding-friend/config.json` exists and has `"tdd": true`
3. Check if the user's invocation or task description contains `--auto` (orthogonal to mode — autopilot can combine with both Direct and TDD mode).

**Result:**

- `--add-tests` present OR `tdd: true` in config → **TDD mode**. Show: `> TDD mode enabled — RED → GREEN → REFACTOR`
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

Note: `--auto` enables the **Autopilot Post-Implementation Loop** (see section below). It does NOT change the implementation mode itself.

---

## Direct Mode (default)

1. Read the task description and relevant existing code
2. Implement the feature directly — no test writing
3. Run existing tests if a test suite exists — fix failures before reporting
4. Run typecheck/lint if available
5. Report what was implemented

## TDD Mode (`--add-tests` or `tdd: true` in config)

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

## Test Quality Checklist (TDD mode only)

- [ ] Test describes behavior, not implementation
- [ ] Test has a clear failure message
- [ ] Test is independent (no shared mutable state)
- [ ] Test runs fast (<1s)
- [ ] One assertion per test (or closely related assertions)

## Anti-Patterns (TDD mode only)

1. **Testing mocks, not behavior** — If your test only verifies mock calls, it tests nothing
2. **Test-only methods in production** — Never add methods just to make testing easier
3. **Integration test as afterthought** — Unit tests first, then integration tests for boundaries

## Subagent Dispatch

For **substantial implementations** (new feature spanning 3+ files, complex algorithm, or multi-step feature), dispatch the **cf-implementer agent** instead of implementing inline. This preserves the main conversation's context.

### Context Handoff Protocol

Before dispatching, create a structured context file for the agent:

1. **Generate a task-id**: use format `<timestamp>-<short-descriptor>` (e.g., `1717500000-add-auth-middleware`)
2. **Determine docsDir**: read from `.coding-friend/config.json` if present, default to `docs`
3. **Context file path**: `{docsDir}/context/{task-id}.json`

If dispatching cf-explorer or cf-planner first, pass the context file path so they write their findings to it. The cf-implementer will then read and consume the same file.

### Dispatch

Use the **Agent tool** with `subagent_type: "coding-friend:cf-implementer"`. Pass:

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

## Autopilot Post-Implementation Loop (`--auto` only)

This section activates **iff `--auto` is present in the current cf-tdd invocation's arguments**.

That single check is sufficient — Claude does NOT need to introspect whether cf-tdd was loaded transitively. Why: cf-plan owns the autopilot loop when a plan has `auto: true`, and cf-plan's contract explicitly forbids propagating `--auto` to cf-implementer (see "Autopilot note" in the Subagent Dispatch section above). So a transitively-loaded cf-tdd (e.g. cf-plan falling back to inline TDD when cf-implementer fails) will never see `--auto` in its own arguments, and this section will not fire. Direct user invocations like `/cf-tdd --auto …` always carry the flag and correctly activate this loop.

When active, after implementation completes its own verification (existing tests pass + typecheck/lint clean), run this loop instead of the standard Review Reminder:

1. **Run review** — invoke the cf-review skill (Skill tool, `coding-friend:cf-review`, no extra args). cf-review will analyze uncommitted changes.

2. **Parse findings** — cf-review returns bullets under 4 emoji headers:
   - 🚨 **Critical** → must fix
   - ⚠️ **Important** → must fix
   - 💡 **Suggestions** → log only, do NOT block
   - 📋 **Summary** → informational
   If output is unparseable, STOP autopilot and surface to user.

3. **Fix loop (max 1 fix round = 2 reviews total)** — If Critical or Important findings exist:
   - Dispatch ONE cf-implementer with task "Fix these review findings: <verbatim Critical + Important bullets>". Files: union of files referenced.
   - **Fix-task failure path** — If the fix cf-implementer returns `[CF-RESULT: failure]`, STOP autopilot immediately. Do NOT consume the second review round. Surface the failure to user.
   - Otherwise, re-run `/cf-review` (round 2).
   - If round 2 still has Critical or Important → STOP autopilot, surface both review outputs and the fix attempt, ask user.
   - Hard cap: 2 reviews total, 1 fix attempt.

4. **Commit** — On clean review (or only Suggestions):
   - `git add -A`
   - Generate conventional commit message: `<type>(<scope>): <task summary>` where `<type>` is feat/fix/refactor/docs/chore/test based on the dominant change, `<scope>` is inferred from the changed files' directory.
   - Commit body: brief summary + any Suggestion findings logged as follow-ups.
   - `git commit -m "$(cat <<'EOF'
<message>
EOF
)"`
   - NEVER use `--no-verify`. NEVER include AI/Claude co-author lines (project rule #6).
   - If `git commit` fails (pre-commit hook), do NOT amend — fix the issue, re-stage, create a NEW commit. Repeated failure → STOP and surface to user.

5. **Report** — Print a brief summary of what was implemented, reviewed, fixed, and committed.

**Stop conditions (only these end autopilot)**:
- Implementation fails its own verification (typecheck/test failure that cannot be auto-fixed).
- The fix cf-implementer returns `[CF-RESULT: failure]` (do not consume the second review round).
- Review round 2 still has Critical or Important findings.
- Review output cannot be parsed.
- `git commit` fails repeatedly.
- User explicitly interrupts.

**Drift guard**: if you find yourself about to ask the user "should I commit?" or "should I run review?" while autopilot is active, that is a drift bug. Re-read this section and proceed per the loop.

**Note on propagation from cf-plan**: When cf-plan dispatches cf-implementer for an `auto: true` plan, cf-plan owns the review/fix/commit loop. cf-implementer does NOT run this loop. This Autopilot Post-Implementation Loop only fires when cf-tdd itself is the top-level skill handling the user's request.

## Review Reminder

After implementation is complete: if `--auto` is active, the Autopilot Post-Implementation Loop (above) has already handled review and commit — skip this section. Otherwise, ask the user if they want to run `/cf-review` or `/cf-commit`. Do NOT auto-run — wait for their choice.
