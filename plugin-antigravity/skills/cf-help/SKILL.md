---
name: cf-help
description: >
  Answer questions about Coding Friend — skills, agents, hooks, CLI, config,
  memory, hosts, parameters. Auto-invoke when the user asks about Coding Friend
  capabilities, available skills, how to use a skill, what skills / agents /
  commands / hooks exist, flags or parameters, how it works, or how to
  configure it — e.g. "what skills are available?", "how does coding friend
  work?", "what can you do?", "list all skills", "what agents exist?", "how do
  I use cf-plan?", "what is cf-tdd?", "what flags does X have?", "what hooks
  exist?", "how do I get started?", "coding friend features/setup", "does X
  require the CLI?", "what works without coding-friend-cli?", "is the CLI
  required?".
  Do NOT auto-invoke for general coding questions unrelated to Coding Friend itself.
created: 2026-02-17
updated: 2026-08-27
---

# /cf-help — Coding Friend Help

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

Answer questions about the Coding Friend toolkit. You are the single place to ask anything about CF — skills, agents, hooks, CLI, config, memory, hosts, flags. Catalog below covers "what exists". For how / flags / config, follow the lookup rule — never guess.

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "<plugin-root>/lib/load-custom-guide.sh" cf-help
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Understand the question

Classify the question (more than one is fine):

- **General overview** — what is Coding Friend, what can it do, how does it work?
- **Specific skill** — how does /cf-commit work? what flags does /cf-plan have?
- **Specific agent** — what is the cf-reviewer agent?
- **Hooks** — what hooks exist? what does privacy-block do? how does auto-approve work? how do I get fewer permission prompts?
- **CLI** — what does `cf init` do? memory commands? install scopes?
- **Setup / config** — keys, custom guides, ignore patterns, hosts
- **Memory / MCP** — tiers, tools, `/cf-remember` vs `/cf-learn`
- **Workflow** — how do skills work together?
- **Troubleshooting** — skill not triggering, CLI, hooks, MCP

### Lookup rule (do not skip)

Never invent a flag, config key, hook name, CLI command, or host difference.

1. A "what exists / which skill should I use" question → answer from the catalog below.
2. Anything more specific → Read `<plugin-root>/skills/cf-help/topics.md` (or `plugin/skills/cf-help/topics.md` in this repo) — topic → source map, flags, hooks, CLI, config.
3. Then Read the source file that index points to (`skills/<name>/SKILL.md`, `agents/<name>.md`, `hooks/<file>`, project config).
4. If still unclear: Glob / Grep under `<plugin-root>/skills/`, `agents/`, `hooks/`.

### Step 2: Provide overview (if general question)

Coding Friend is a lean toolkit for disciplined engineering workflows in Google Antigravity. Core philosophy:

1. **Check skills first** — Before any task, check if a relevant skill exists
2. **Test before code** — RED → GREEN → REFACTOR
3. **Verify before claiming** — Never claim done without running tests
4. **Commit with purpose** — Conventional commits with clear "why"

Supported hosts: Claude Code (default), Codex CLI (beta), omp (beta), and **Google Antigravity (beta)** (`--agent agy` / `--agy`).

Two packages: the **plugin** (skills / agents / hooks — works alone) and optional **`coding-friend-cli`** (memory MCP, learn-host, `cf init` / install / config). Skills never call the `cf` binary.

### Slash Commands (user triggers with /)

- `/cf-advise [decision]` — ⚡⚡ — Decision advisory: a structured interview (one question at a time) that surfaces hidden requirements, confirms a reframing, then delivers a verdict-first recommendation with pitfalls and ranked alternatives. Advisory-only — never writes code or plans (that's `/cf-plan`). Flags: `--quick` fewer questions, `--save` persist the decision to `docs/memory/decisions/`.
- `/cf-ask [question]` — ⚡⚡ — Quick Q&A about codebase → docs/memory/; auto-generates an ASCII flow diagram for "how does X work" / flow / lifecycle questions
- `/cf-plan [task]` — ⚡⚡ — Brainstorm and create phased implementation plans with parallel execution. Flags: `--fast` (alias `--quick`) lighter workflow, `--hard` deeper exploration + rollback, `--auto` end-to-end autopilot (auto review + fix Critical/Important + commit per phase), `--inline` (alias `--no-file`) plan in chat only without writing a file, `--gui` (alias `--human`) also generate the human-readable overview doc for this run (off by default), `--model <alias>` pin the model for cf-planner at the brainstorm step (valid: `inherit`, `flash`, `pro`).
- `/cf-plan-resume <plan>` — ⚡⚡ — Resume a saved plan (folder path, entry file, or bare `<slug>`) from where execution last stopped: reads the plan + its context file, re-runs pending/interrupted tasks, honors `auto: true` frontmatter to continue in autopilot.
- `/cf-later-do [item]` — ⚡⚡ — Work through deferred side-tasks in `docs/later/`: list captured items, pick one, route the fix to `/cf-fix` (bugs) or `/cf-plan` (features), remove the file only after the fix is verified-done, then suggest the next. The read/resolve side of `capture-later.sh`.
- `/cf-review [target]` — ⚡⚡ — Dispatch code review to subagent. Flags: `--claude`, `--gemini`, `--cursor`, `--grok` run headless external reviewers in parallel and merge into one report; `--out` exports a `/cf-review-out` prompt with in-session findings embedded. `--with-codex`/`--codex` and `review.withCodex` are ignored on Google Antigravity (do not spawn a nested Codex review). `review.agentTimeout` (default 300s) bounds each external agent. Unavailable agents are skipped with a warning.
- `/cf-review-out [label]` — ⚡⚡ — Write a self-contained review prompt + diff to `docs/reviews/` for an external AI or human. Pair with `/cf-review-in`. Prefer `/cf-review --claude|--gemini|--cursor|--grok|--codex` when those CLIs are installed.
- `/cf-review-in <label> [service]` — ⚡⚡ — Read an external review result, present findings, offer to fix.
- `/cf-commit [hint]` — ⚡ — Analyze diff, soft review check, and create conventional commit
- `/cf-design [mode]` — ⚡⚡ — UI design workflow: scan existing patterns, design new UI, or modify UI consistently
- `/cf-ship [hint]` — ⚡ — Verify, commit, push, and create PR (supports `--dry-run`)
- `/cf-fix [bug]` — ⚡⚡ — Quick bug fix workflow
- `/cf-optimize [target]` — ⚡⚡ — Structured optimization with before/after measurement
- `/cf-scan [description]` — ⚡⚡⚡ — Scan project and bootstrap memory
- `/cf-remember [topic]` — ⚡⚡ — Extract project knowledge to docs/memory/. Also auto-invoked.
- `/cf-learn [topic]` — ⚡⚡ — Extract learnings (configurable output, language, categories)
- `/cf-teach [topic]` — ⚡⚡ — Conversational teacher narrative of what just happened and why (human understanding). Unlike `/cf-learn` (structured notes).
- `/cf-research [topic]` — ⚡⚡ — In-depth research with web search → docs/research/
- `/cf-session [label]` — ⚡⚡ — Save current session to sync folder for cross-machine resume
- `/cf-warm [user]` — ⚡⚡ — Catch up after absence — git history summary for a user
- `/cf-checkpoint [additional-prompt]` — ⚡⚡ — Capture a concise conversation checkpoint (decisions, breaking changes, next steps) → docs/context/checkpoints/; updates an existing checkpoint when the arg matches one.
- `/cf-checkpoint-from <slug> [message]` — ⚡⚡ — Load a saved checkpoint as context, then do the message (first word is the slug, the rest is what to do next). Add `--recap` to also print a summary of the restored context.
- `/cf-help [question]` — ⚡⚡⚡ — This skill — answer questions about Coding Friend. Also auto-invoked.

### Auto-Invoked Skills (activate automatically when relevant)

- **cf-tdd** — ⚡⚡ — When writing new code: direct implementation by default; TDD with `--add-tests` or config `tdd: true`. Add `--auto` for standalone autopilot (auto review + fix + commit after implementation).
- **cf-sys-debug** — ⚡⚡ — When debugging: investigate → analyze → test → fix
- **cf-verification** — ⚡ — Before claiming done: run, read output, verify
- **cf-learn** — ⚡⚡ — After substantial new knowledge: extract educational notes
- **cf-remember** — ⚡⚡ — After non-obvious bug fixes, arch decisions, new conventions, or undocumented session gotchas: save to docs/memory/
- **cf-help** — ⚡⚡⚡ — When asking about Coding Friend skills, agents, hooks, CLI, or workflows

### Agents (run in forked sessions — separate context window)

- **cf-reviewer** — ⚡ — Review orchestrator: dispatches 5 specialist agents in parallel + reducer
  - **cf-reviewer-plan** (pro) — Plan alignment
  - **cf-reviewer-security** (pro) — Security vulnerabilities
  - **cf-reviewer-quality** (flash) — Code quality + slop detection
  - **cf-reviewer-tests** (flash) — Test coverage
  - **cf-reviewer-rules** (flash) — Project rules compliance (AGENTS.md)
  - **cf-reviewer-reducer** (flash) — Deduplicates and ranks findings
- **cf-implementer** — ⚡ — Implementation subagent: direct coding by default, TDD with `--add-tests` (reads structured context file, returns result signals, supports auto-retry on failure). Does not own autopilot loops — cf-plan / cf-tdd orchestrate review / fix / commit when `--auto` is active.
- **cf-explorer** — ⚡ — Codebase exploration and context gathering (writes structured context files for downstream agents)
- **cf-planner** — ⚡ — Task decomposition with parallel/sequential phases (writes structured context file)
- **cf-writer** — ⚡ — Lightweight doc writer for markdown file generation
- **cf-writer-deep** — ⚡ — Deep reasoning doc writer for nuanced technical content

### Hooks (automatic — not slash commands)

Claude events live in `hooks/hooks.json`. Adapters: `*.agy.*` (Antigravity); Codex uses a transformed manifest. Details and config keys: `topics.md`.

- **session-init.sh** — SessionStart — bootstrap context, paths, ignore
- **rules-reminder.sh** — UserPromptSubmit — inject core rules
- **privacy-block.sh** — PreToolUse — block `.env` / credentials (`privacyBlock`)
- **scout-block.cjs** — PreToolUse — respect `.coding-friend/ignore` (`scoutBlock`)
- **auto-approve.cjs** — PreToolUse — opt-in auto-approve (`autoApprove`). Claude LLM classifier is opt-in (`autoApproveLLM`, default false → unknown defers to native). Native host modes: `topics.md`.
- **session-log.sh** — Stop — turn log for memory capture
- **task-tracker.sh** — TaskCreated/Completed — statusline progress (Claude)
- **agent-tracker.sh** — SubagentStart/Stop — statusline active agent
- **memory-capture.sh** — PreCompact — episode capture (`memory.autoCapture`)
- **statusline.sh** — Claude statusline renderer (`cf statusline`; not in `hooks.json`)

### CLI (`coding-friend-cli`, binary `cf`) — optional

- Lifecycle: `cf install|uninstall|enable|disable|update` — `--user|--project|--local`; `--agent claude|codex|omp|agy`
- Setup: `cf init`, `cf config`, `cf permission`, `cf statusline`
- Memory: `cf memory [status|search|list|rm|init|config|rebuild|mcp|start-daemon|stop-daemon]`
- Learn: `cf learn [host|push]`, `cf mcp`
- Other: `cf status`, `cf clean`, `cf session [save|load]`, `cf guide [create|list]`, `cf dev [on|off|status|sync|restart]`

No skill requires the CLI. Full flags: `topics.md`.

### Context Window Usage

Each skill loads its SKILL.md into context when triggered. Context tiers: `⚡` = low (<1,500 tokens), `⚡⚡` = medium (1,500–3,000), `⚡⚡⚡` = high (>3,000). Bootstrap context (~2,100 tokens) is loaded every session. Agents run in forked sessions with their own context window. For exact token counts, see https://cf.dinhanhthi.com/docs/reference/context-usage/.

### Step 3: Read specific files (if detailed question)

Follow the lookup rule. Typical paths (plugin root = `<plugin-root>`):

```
skills/cf-help/topics.md          ← always start here for details
skills/<skill-name>/SKILL.md
agents/<agent-name>.md
hooks/hooks.json
hooks/<hook-file>
```

If the user asks about **configuration**, also read:

- `.coding-friend/config.json` — local project config
- `~/.coding-friend/config.json` — global defaults
- `topics.md` (Config section) — key list. Repo checkout only: `docs/config-schema.md`

If the user asks about **custom skill guides**, explain:

- Local: `.coding-friend/skills/<skill-name>-custom/SKILL.md`
- Global: `~/.coding-friend/skills/<skill-name>-custom/SKILL.md`
- Sections: `## Before` (pre-workflow), `## Rules` (throughout), `## After` (post-workflow)

### Step 4: Common Workflows (if workflow question)

If the user asks how skills work together, present these common workflows:

- **Build a feature:** `/cf-plan` → implement → `/cf-review` → `/cf-commit` → `/cf-ship`
- **Fix a bug:** `/cf-fix` → (auto: review) → `/cf-commit`
- **Quick question:** `/cf-ask` → answer saved to docs/memory/
- **Deep research:** `/cf-research` → `/cf-plan` → implement
- **Outside review:** `/cf-review-out` → external AI → `/cf-review-in`
- **End of session:** `/cf-remember` (project context for AI) + `/cf-learn` (educational notes for human)
- **Optimize:** `/cf-optimize` → baseline → fix → measure → compare

**Key distinction:** `/cf-remember` saves project knowledge for AI recall in future sessions. `/cf-learn` saves educational notes for the human to learn from.

### Step 5: Troubleshooting (if troubleshooting question)

Common issues:

- **Skill not triggering?** Check description in SKILL.md — it may not match the user's phrasing. Use `/cf-<skill-name>` to trigger manually.
- **Custom guide not loading?** Verify the path: `.coding-friend/skills/<skill-name>-custom/SKILL.md` and that it has `## Before`, `## Rules`, or `## After` sections.
- **Config not applied?** Local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`. Check both.
- **Permission prompts?** Hosts have native modes that reduce prompts (Claude `auto` / `acceptEdits` / `sandbox.autoAllowBashIfSandboxed`; Codex `approval_policy` / Smart Approvals / `--approve-for-me`; AGY remembers per-conversation; omp `yolo` default). CF `autoApprove` is the plugin hook. Details: `topics.md`.
- **More issues?** Point the user to the [Troubleshooting page](https://cf.dinhanhthi.com/docs/reference/troubleshooting/) for memory daemon, install, hook, and MCP issues.

### Step 6: Answer concisely

Provide a clear, concise answer based on the information gathered. Link to specific files if the user wants to dive deeper. If you did not read a source file for a specific-skill / flag / hook / CLI / config question, go back to the lookup rule first.

## CLI Requirements (quick reference)

The Coding Friend plugin works without `coding-friend-cli`. The CLI adds the memory MCP server (fast indexed search), the learn-host doc server, and a few utilities — but every skill and agent has a documented fallback path.

**Three tiers:**

- **NONE** — works with zero CLI involvement.
- **OPTIONAL** — uses CLI-installed memory MCP for speed; falls back to grep over `docs/memory/` and direct file writes when CLI is absent. Full functionality preserved.
- **REQUIRED** — cannot function without CLI. **(0 skills today.)**

For the full per-skill/per-agent/per-hook matrix, see [docs/cli-requirements.md](../../../docs/cli-requirements.md).

### Example: answering "do I need the CLI?" questions

When users ask whether a skill needs the CLI, look up its tier first.

> **Q:** "Do I need the CLI to use `/cf-fix`?"
>
> **A:** "No. `cf-fix` is OPTIONAL-tier — it uses the memory MCP when available, but falls back to `grep -r '<query>' docs/memory/`. See `docs/cli-requirements.md` for the full matrix."

Trigger phrases this skill should recognize:

- "does X require the CLI?"
- "what works without coding-friend-cli?"
- "how do I use memory without the CLI?"
- "is the CLI required?"
- "do I need to install the CLI?"
- "what flags does X have?"
- "what hooks exist?"
- "how do I configure CF?"
- "what does `cf memory` do?"
