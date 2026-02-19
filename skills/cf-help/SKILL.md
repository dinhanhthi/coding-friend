---
name: cf-help
description: Core knowledge for coding-friend toolkit usage
user-invocable: false
---

# coding-friend

You have the coding-friend toolkit loaded. Follow these rules in every interaction.

## Core Rules

1. **Check skills first.** Before starting any task, check if a relevant skill exists. Load it before proceeding.
2. **Test before code.** No production code without a failing test first (see: cf-tdd skill).
3. **Verify before claiming.** Never claim work is complete without running tests and showing output (see: cf-verification skill).
4. **Respect boundaries.** Do not read files blocked by .coding-friend/ignore or privacy rules.
5. **Commit with purpose.** Every commit must be a conventional commit with clear "why" (see: cf-commit skill).

## Available Skills

### Slash Commands (user triggers)
- `/cf-plan [task]` — Brainstorm and write implementation plan
- `/cf-review [target]` — Dispatch code review to subagent
- `/cf-commit [hint]` — Analyze diff and create conventional commit
- `/cf-ship [hint]` — Verify, commit, push, and create PR
- `/cf-fix [bug]` — Quick bug fix workflow
- `/cf-remember [topic]` — Extract project knowledge to docs/memory/
- `/cf-learn [topic]` — Extract learnings to docs/learn/
- `/cf-statusline` — Setup coding-friend statusline

### Auto-Invoked (load when relevant)
- **cf-tdd** — When writing new code: RED → GREEN → REFACTOR
- **cf-sys-debug** — When debugging: investigate → analyze → test → fix
- **cf-code-review** — When reviewing code: plan, quality, security, testing
- **cf-verification** — Before claiming done: run, read output, verify

## Available Agents

- **code-reviewer** — Multi-layer code review in forked context
- **implementer** — TDD implementation subagent
- **planner** — Codebase exploration and task decomposition

## Conventions

- Tests live next to source files or in `__tests__/` / `tests/` directories
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Project knowledge in `docs/memory/`, learning notes in `docs/learn/`, plans in `docs/plans/`
- Config via `.coding-friend/config.json` (optional, all settings have defaults)
- Respect `.coding-friend/ignore` patterns — do not read blocked directories
