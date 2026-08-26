## Skills

Skills are slash commands (`/cf-*`) or auto-invoked when a matching situation appears.

### Plan & build

- `/cf-plan` — Brainstorm and write a phased implementation plan. Use when you want to build or implement something. Flags: `--auto`, `--fast`, `--hard`.
- `/cf-plan-resume` — Resume a saved plan from where execution last stopped. Use when you want to continue a plan under `docs/plans/`.
- `/cf-advise` — Structured interview, then a verdict-first recommendation with pitfalls and ranked alternatives. Use when you need to decide, not build. Advisory-only; never writes code.
- `/cf-design` — Scan existing UI patterns, design new UI, or modify UI so it stays consistent. Use when a component or page should match the rest of the project.
- `/cf-optimize` — Baseline, analyze, optimize, measure, compare. Use when something is slow or you want a measured performance change.

### Fix & debug

- `/cf-fix` — Quick bug-fix workflow: reproduce, state a hypothesis, then fix. Use when something is broken, throws, or fails a test.
- `cf-sys-debug` — Four-phase debugging: root cause, hypothesis tests, regression-guarded fix, bug doc. Auto-invoked for hard, recurring, or unclear bugs.
- `cf-tdd` — Direct implementation by default. Auto-invoked when production code is about to be written. Pass `--add-tests` for RED → GREEN → REFACTOR.
- `cf-verification` — Run tests and show evidence before claiming work is done. Auto-invoked after code-changing work.

### Review & ship

- `/cf-review` — Multi-layer code review in a separate subagent. Use when you want changes checked before merge.
- `/cf-review-out` — Write a self-contained review prompt for an external AI. Use when you want a second opinion you will paste elsewhere.
- `/cf-review-in` — Collect and act on that external review. Use after `/cf-review-out` when the result file is ready.
- `/cf-commit` — Conventional commit from the diff. Use when you want to save the current work.
- `/cf-ship` — Verify, commit, push, and open a PR. Use when a branch is ready. Supports `--dry-run`.

### Knowledge

- `/cf-ask` — Focused Q&A about the codebase, saved to `docs/memory`. Use when you need to know how something works.
- `/cf-scan` — Scan the project and bootstrap memory (architecture, conventions, stack). Use on a new repo or when you want to refresh project understanding.
- `/cf-remember` — Capture project knowledge for AI recall across sessions. Use when a decision, convention, or gotcha should persist.
- `/cf-learn` — Extract educational notes for you. Use after a session that taught something non-trivial.
- `/cf-teach` — Conversational story of what happened and why. Use when you want a deep-dive, not a short note.
- `/cf-research` — In-depth research with web search, saved under `docs/research/`. Use before you build, not instead of planning.

### Context & session

- `/cf-session` — Save the current session to `docs/sessions/`. Use when you will continue on another machine.
- `/cf-checkpoint` — Snapshot this conversation (decisions, breaking changes, next steps) to resume later. Use before you start a fresh chat.
- `/cf-checkpoint-from` — Load a saved checkpoint, then do what you ask next. Use to pick up that snapshot. Pass `--recap` for a summary.
- `/cf-warm` — Summarize git history after you were away. Use when you need to catch up on the project.
- `/cf-later-do` — Work through deferred items in `docs/later/`. Use when you want to clear that backlog.

### Help

- `/cf-help` — Answers questions about Coding Friend (skills, agents, setup). Slash command, and auto-invoked when you ask about the toolkit itself.

Example outputs:

`/cf-plan`

```text
Progress

| Status         | Phase             | Tasks   |
| -------------- | ----------------- | ------- |
| ✅ DONE        | Phase 1: Teardown | 3 tasks |
| 🔄 IN PROGRESS | Phase 4: Content  | 6 tasks |
| ⬜ TODO        | Phase 5: Merge    | 1 task  |

#### Phase 1 [sequential]
```

`/cf-review`

```text
🚨 Critical
- None.

⚠️ Important
- None.

💡 Suggestions
- None.

📋 Summary
No blocking issues found. You're clear to commit.
```

`/cf-commit`

```text
feat(cli): add agy host lifecycle commands

DONE — commit created.
```

`/cf-fix`

```text
> ✨ **CODING FRIEND** → /cf-fix activated

Root cause:   [what was wrong, file:line]
Fix:          [what changed, file:line]
Confirmed:    [evidence or test that proves the fix]
Tests:        [pass/fail count, regression test location]
Status: DONE
```
