---
name: cf-help
description: >
  Answer questions about Coding Friend — skills, agents, hooks, CLI, config, memory,
  hosts, parameters. Auto-invoke for CF capabilities or how to use a skill — e.g. "what
  skills are available?", "how does coding friend work?", "list all skills", "how do I use
  cf-plan?", "what is cf-tdd?", "is the CLI required?". Do NOT auto-invoke for general
  coding questions unrelated to Coding Friend.
user-invocable: true
model: haiku
allowed-tools: [Read, Glob, Grep]
created: 2026-02-17
updated: 2026-08-27
---

# /cf-help — Coding Friend Help

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. Matrix: [CLI requirements](../../../docs/cli-requirements.md).

Catalog = what exists. Flags / config / hooks → lookup rule. Never guess.

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-help
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Understand the question

Classify (more than one is fine): general overview · specific skill · specific agent · hooks / fewer prompts · CLI · setup / config · memory / MCP · workflow · troubleshooting.

### Lookup rule (do not skip)

Never invent a flag, config key, hook name, CLI command, or host difference.

1. "What exists / which skill?" → catalog below.
2. Anything more specific → Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-help/topics.md` (or `plugin/skills/cf-help/topics.md` in this repo) — topic → source map, flags, hooks, CLI, config, native prompt reduction.
3. Then Read the source that index points to (`skills/<name>/SKILL.md`, `agents/<name>.md`, `hooks/<file>`).
4. If still unclear: Glob / Grep under `${CLAUDE_PLUGIN_ROOT}/skills/`, `agents/`, `hooks/`.

### Step 2: Provide overview (if general question)

Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code. Check skills first; TDD optional (`--add-tests` or `tdd: true`); verify before claiming done.

Hosts: Claude Code (default), Codex CLI, omp, **Google Antigravity** (`--agent agy` / `--agy`). Plugin works alone; `coding-friend-cli` is optional. Skills never call `cf`. Flags / config / native prompt-reduction: `topics.md`.

### Slash Commands (user triggers with /)

- `/cf-advise [decision]` — ⚡⚡ — Advisory interview. `--quick`, `--save`
- `/cf-ask [question]` — ⚡⚡ — Codebase Q&A → docs/memory/
- `/cf-plan [task]` — ⚡⚡ — Phased plans. `--fast`/`--quick`, `--hard`, `--auto`, `--inline`/`--no-file`, `--gui`/`--human`, `--model <alias>` pin the model for cf-planner at the brainstorm step.
- `/cf-plan-resume <plan>` — ⚡⚡ — Resume a saved plan. Honors `auto: true`.
- `/cf-later-do [item]` — ⚡⚡ — Resolve `docs/later/` via `/cf-fix` or `/cf-plan`
- `/cf-review [target]` — ⚡⚡ — Dispatch review. Flags: `--with-codex`/`--codex`, `--claude`, `--gemini`, `--cursor`, `--grok` run headless external reviewers in parallel and merge into one report; `--out` exports a `/cf-review-out` prompt with Claude's findings embedded. Set `review.withCodex: true` in config to enable Codex by default; `review.agentTimeout` (default 300s) bounds each external agent. Unavailable agents are skipped with a warning.
- `/cf-review-out [label]` — ⚡⚡ — Prompt + diff → `docs/reviews/`
- `/cf-review-in <label> [service]` — ⚡⚡ — Read external review, offer to fix
- `/cf-commit [hint]` — ⚡ — Conventional commit
- `/cf-design [mode]` — ⚡⚡ — Scan / design / modify UI
- `/cf-ship [hint]` — ⚡ — Verify, commit, push, PR (`--dry-run`)
- `/cf-fix [bug]` — ⚡⚡ — Quick bug-fix
- `/cf-optimize [target]` — ⚡⚡ — Baseline → optimize → measure
- `/cf-scan [description]` — ⚡⚡⚡ — Bootstrap memory
- `/cf-remember [topic]` — ⚡⚡ — Project knowledge → docs/memory/. Also auto-invoked.
- `/cf-learn [topic]` — ⚡⚡ — Educational notes. Also auto-invoked.
- `/cf-teach [topic]` — ⚡⚡ — Story of what happened
- `/cf-research [topic]` — ⚡⚡ — Web research → docs/research/
- `/cf-session [label]` — ⚡⚡ — Cross-machine session save
- `/cf-warm [user]` — ⚡⚡ — Git history catch-up
- `/cf-checkpoint [additional-prompt]` — ⚡⚡ — Checkpoint → docs/context/checkpoints/
- `/cf-checkpoint-from <slug> [message]` — ⚡⚡ — Restore checkpoint, then act. `--recap`
- `/cf-help [question]` — ⚡⚡⚡ — This skill. Also auto-invoked.

### Auto-Invoked Skills (activate automatically when relevant)

- **cf-tdd** — ⚡⚡ — Code-writing gate. Default direct; TDD with `--add-tests` or `tdd: true`. `--auto` = review + fix + commit.
- **cf-sys-debug** — ⚡⚡ — 4-phase debug
- **cf-verification** — ⚡ — Evidence gate before claiming done
- **cf-learn** / **cf-remember** / **cf-help** — also auto-invoked (see above)

### Agents (run in forked sessions — separate context window)

- **cf-reviewer** — ⚡ — Orchestrator: **cf-reviewer-plan** (sonnet), **cf-reviewer-security** (sonnet), **cf-reviewer-quality** (haiku), **cf-reviewer-tests** (haiku), **cf-reviewer-rules** (haiku), **cf-reviewer-reducer** (haiku)
- **cf-implementer** — ⚡ — Writes code; TDD with `--add-tests`. `[CF-RESULT: success|failure]`. No autopilot.
- **cf-explorer** — ⚡ — Repo map + context files
- **cf-planner** — ⚡ — Approaches + phased tasks
- **cf-writer** — ⚡ — Straightforward markdown
- **cf-writer-deep** — ⚡ — Nuanced technical docs

### Hooks (automatic — not slash commands)

`hooks/hooks.json` (+ `*.agy.*`; Codex transformed). Keys + native modes: `topics.md`.

**session-init.sh** · **rules-reminder.sh** · **privacy-block.sh** · **scout-block.cjs** · **auto-approve.cjs** (`autoApprove`; Claude `autoApproveLLM` default false → unknown defers to native) · **session-log.sh** · **task-tracker.sh** · **agent-tracker.sh** · **memory-capture.sh** · **statusline.sh** (Claude; `cf statusline`)

### CLI (`coding-friend-cli`, binary `cf`) — optional

Lifecycle `install|uninstall|enable|disable|update` (`--user|--project|--local`, `--agent claude|codex|omp|agy`); setup `init` `config` `permission` `statusline`; memory / learn / mcp; `status` `clean` `session` `guide` `dev`. No skill requires the CLI. Full flags: `topics.md`.

Tiers `⚡` / `⚡⚡` / `⚡⚡⚡`: https://cf.dinhanhthi.com/docs/reference/context-usage/.

### Step 3: Read specific files (if detailed question)

Follow the lookup rule. Start at `skills/cf-help/topics.md`, then `skills/<name>/SKILL.md`, `agents/<name>.md`, `hooks/`. Config keys and custom guides: `topics.md`. Repo-only schema: `docs/config-schema.md`.

### Step 4: Common Workflows (if workflow question)

Present the workflows in `topics.md`. Distinction: `/cf-remember` = project knowledge for AI; `/cf-learn` = notes for the human.

### Step 5: Troubleshooting (if troubleshooting question)

- **Skill not triggering?** Invoke `/cf-<skill-name>` manually.
- **Config / custom guides?** `topics.md`.
- **Permission prompts?** Native modes: Claude `auto` / `acceptEdits` / `sandbox.autoAllowBashIfSandboxed`; Codex `approval_policy` / Smart Approvals / `--approve-for-me`; AGY remembers per-conversation; omp `yolo`. CF hook: `autoApprove`. Details: `topics.md`.
- **After editing plugin files?** Run `cf dev sync` to copy changes to the cached version.
- **More?** [Troubleshooting](https://cf.dinhanhthi.com/docs/reference/troubleshooting/).

### Step 6: Answer concisely

Answer from sources you read. Link files for deeper dives. If you skipped the lookup rule on a flag / hook / CLI / config question, go back.

## CLI Requirements (quick reference)

Plugin works without CLI. **NONE** / **OPTIONAL** (MCP or grep) / **REQUIRED** (none today). Matrix: [docs/cli-requirements.md](../../../docs/cli-requirements.md).
