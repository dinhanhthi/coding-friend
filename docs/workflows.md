# Workflows

coding-friend installs globally. No files copied into your project. On every Claude Code session, hooks auto-run: detect project type, inject rules, block sensitive files, activate skills (TDD, debugging, verification, learn) based on context. You only interact via slash commands.

## Setup

- **New project**: run `cf init` to create workspace folders (`docs/plans`, `docs/memory`, `docs/research`, `docs/learn`), configure `.gitignore`, language, and `/cf-learn` settings.
- **Existing project**: nothing needed — coding-friend is already active. Optionally run `cf init` for project-specific settings.
- **Per-project config** (optional): `.coding-friend/config.json` to customize docs folder, toggle hooks. `.coding-friend/ignore` to block directories from agent access.

## Plan → `/cf-plan [task]`

- **When**: starting a new feature or significant change
- **Why**: get a structured plan before writing code — avoids going in the wrong direction
- **How**: `/cf-plan Build a REST API with auth`
  - Explores codebase + requirements → brainstorms 2-3 approaches → picks best → writes plan to `docs/plans/YYYY-MM-DD-<slug>.md` → creates todo list

## Implement (auto)

- **When**: writing any production code (after planning or ad-hoc)
- **Why**: `cf-tdd` auto-activates to enforce test-driven development
- **How**: just ask Claude to implement — TDD kicks in automatically
  - RED: write failing test first
  - GREEN: minimum code to pass
  - REFACTOR: clean up, all tests must still pass

## Fix a bug → `/cf-fix [bug]`

- **When**: you encounter a bug and want a quick fix
- **Why**: structured fix workflow — faster than ad-hoc debugging
- **How**: `/cf-fix Login fails with 401 when token is valid`
  - Reproduce → locate root cause → fix → verify → regression test
  - If 3 fix attempts fail → auto-escalates to `cf-sys-debug` (4-phase systematic debugging: root cause investigation → pattern analysis → hypothesis testing → implementation)

## Review → `/cf-review [target]`

- **When**: before shipping, after implementation, or anytime you want a second opinion
- **Why**: runs in a forked context — doesn't pollute your main conversation
- **How**:
  - `/cf-review` — all uncommitted changes
  - `/cf-review src/auth/` — specific directory
  - `/cf-review HEAD~3..HEAD` — last 3 commits
  - Reports: Critical (must fix) → Important (should fix) → Suggestions

## Commit → `/cf-commit [hint]`

- **When**: you're ready to commit changes
- **Why**: runs tests first, writes conventional commit message automatically
- **How**: `/cf-commit Add retry logic for API calls`
  - Runs tests → stages relevant files → writes conventional commit → commits

## Ship → `/cf-ship [hint]`

- **When**: feature is done and reviewed, ready to push
- **Why**: full pipeline in one command — no manual steps
- **How**: `/cf-ship Add notifications`
  - Verify (tests, build, lint) → commit → push → create PR

## Quick Q&A → `/cf-ask [question]`

- **When**: you need to understand how something works in the codebase
- **Why**: explores code to find the answer, then saves Q&A for future sessions
- **How**: `/cf-ask How does the auth middleware work?`
  - Explores codebase → answers directly → saves to `docs/memory/`

## Optimize → `/cf-optimize [target]`

- **When**: you know something is slow and want structured improvement
- **Why**: measures before/after so you can prove the optimization works
- **How**: `/cf-optimize database query in getUserById`
  - Baseline (3 runs) → analyze bottlenecks → plan → implement (TDD) → measure after → compare

## Research → `/cf-research [topic]`

- **When**: you need to learn about a technology, compare approaches, or explore an external repo
- **Why**: deep research with web search + parallel subagents — more thorough than a quick search
- **How**: `/cf-research GraphQL vs REST for mobile APIs`
  - Structured output saved to `docs/research/`

## Save knowledge → `/cf-remember [topic]`

- **When**: you discovered something important during the conversation that should persist
- **Why**: saves project knowledge for AI to use in future sessions (`docs/memory/`)
- **How**:
  - `/cf-remember auth flow` — extract knowledge about a specific topic
  - `/cf-remember` — scan entire conversation for features, conventions, decisions, gotchas

## Learn → `/cf-learn [topic]`

- **When**: the conversation covered something you (the human) want to remember
- **Why**: extracts learnings so you actually learn from vibe coding — not just let AI do everything
- **How**:
  - `/cf-learn dependency injection` — focus on a specific concept
  - `/cf-learn` — extract all learnings from the session
  - Also auto-invoked when substantial new knowledge is detected
  - Output to configured dir (default: `docs/learn/`). Read with `cf host` (localhost:3333) or use as MCP server (`cf mcp`)

## Typical flow

1. `/cf-plan Add dark mode toggle` — plan
2. Implement (TDD auto-enforced) — code
3. `/cf-review` — review
4. `/cf-ship Dark mode feature` — ship
5. `/cf-remember` + `/cf-learn` — capture knowledge

## What's automatic vs manual

- **Automatic** (no action needed): TDD enforcement, systematic debugging (after 3 failed fixes), verification before done, privacy block (.env, credentials), scout block (node_modules, dist), session bootstrap, rules injection, learning extraction on substantial knowledge
- **Manual** (slash commands): `cf init`, `/cf-plan`, `/cf-fix`, `/cf-ask`, `/cf-optimize`, `/cf-review`, `/cf-commit`, `/cf-ship`, `/cf-remember`, `/cf-learn`, `/cf-research`
