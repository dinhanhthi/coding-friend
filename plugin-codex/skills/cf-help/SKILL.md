---
name: cf-help
description: >
  Answer questions about Coding Friend — skills, agents, workflows, setup.
  Auto-invoke when the user asks about Coding Friend capabilities, available
  skills, how to use a skill, what skills/agents/commands exist, how it works,
  or how to configure it — e.g. "what skills are available?", "how does coding
  friend work?", "what can you do?", "list all skills", "what agents exist?",
  "how do I use cf-plan?", "what is cf-tdd?", "what does cf-fix do?", "which
  skill should I use?", "how do I get started?", "coding friend features/setup",
  "does X require the CLI?", "what works without coding-friend-cli?", "is the
  CLI required?".
  Do NOT auto-invoke for general coding questions unrelated to Coding Friend itself.
created: 2026-02-17
updated: 2026-07-24
---

# $cf-help — Coding Friend Help

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

Answer questions about the Coding Friend toolkit. Provide a brief overview when asked generally, or read specific skill files on-demand when asked about a particular skill/agent/workflow.

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-help
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Understand the question

Determine what the user is asking about:

- **General overview** — what is Coding Friend, what can it do?
- **Specific skill** — how does $cf-commit work? what does cf-tdd do?
- **Specific agent** — what is the cf-reviewer agent?
- **Setup/config** — how to configure, custom guides, ignore patterns
- **Workflow** — how do skills work together?

### Step 2: Provide overview (if general question)

Coding Friend is a lean toolkit for disciplined engineering workflows in Codex CLI. Core philosophy:

1. **Check skills first** — Before any task, check if a relevant skill exists
2. **Test before code** — RED → GREEN → REFACTOR
3. **Verify before claiming** — Never claim done without running tests
4. **Commit with purpose** — Conventional commits with clear "why"

### Slash Commands (user triggers with /)

- `$cf-advise [decision]` — ⚡⚡ — Decision advisory: a structured interview (one question at a time) that surfaces hidden requirements, confirms a reframing, then delivers a verdict-first recommendation with pitfalls and ranked alternatives. Advisory-only — never writes code or plans (that's `$cf-plan`). Flags: `--quick` fewer questions, `--save` persist the decision to `docs/memory/decisions/`.
- `$cf-ask [question]` — ⚡⚡ — Quick Q&A about codebase → docs/memory/; auto-generates an ASCII flow diagram for "how does X work" / flow / lifecycle questions
- `$cf-plan [task]` — ⚡⚡ — Brainstorm and create phased implementation plans with parallel execution. Flags: `--fast` (alias `--quick`) lighter workflow, `--hard` deeper exploration + rollback, `--auto` end-to-end autopilot (auto review + fix Critical/Important + commit per phase), `--inline` (alias `--no-file`) plan in chat only without writing a file, `--gui` (alias `--human`) also generate the human-readable overview doc for this run (off by default).
- `$cf-plan-resume <plan>` — ⚡⚡ — Resume a saved plan (folder path, entry file, or bare `<slug>`) from where execution last stopped: reads the plan + its context file, re-runs pending/interrupted tasks, honors `auto: true` frontmatter to continue in autopilot.
- `$cf-later-do [item]` — ⚡⚡ — Work through deferred side-tasks in `docs/later/`: list captured items, pick one, route the fix to `$cf-fix` (bugs) or `$cf-plan` (features), remove the file only after the fix is verified-done, then suggest the next. The read/resolve side of `capture-later.sh`.
- `$cf-review [target]` — ⚡⚡ — Dispatch code review to subagent. Flags: `--with-codex`/`--codex`, `--claude`, `--gemini`, `--cursor`, `--grok` run headless external reviewers in parallel and merge into one report; `--out` exports a `$cf-review-out` prompt with Claude's findings embedded. Set `review.withCodex: true` in config to enable Codex by default; `review.agentTimeout` (default 300s) bounds each external agent. Unavailable agents are skipped with a warning.
- `$cf-commit [hint]` — ⚡ — Analyze diff, soft review check, and create conventional commit
- `$cf-design [mode]` — ⚡⚡ — UI design workflow: scan existing patterns, design new UI, or modify UI consistently
- `$cf-ship [hint]` — ⚡ — Verify, commit, push, and create PR (supports `--dry-run`)
- `$cf-fix [bug]` — ⚡⚡ — Quick bug fix workflow
- `$cf-optimize [target]` — ⚡⚡ — Structured optimization with before/after measurement
- `$cf-scan [description]` — ⚡⚡⚡ — Scan project and bootstrap memory
- `$cf-remember [topic]` — ⚡⚡ — Extract project knowledge to docs/memory/. Also auto-invoked.
- `$cf-learn [topic]` — ⚡⚡ — Extract learnings (configurable output, language, categories)
- `$cf-research [topic]` — ⚡⚡ — In-depth research with web search → docs/research/
- `$cf-session [label]` — ⚡⚡ — Save current session to sync folder for cross-machine resume
- `$cf-warm [user]` — ⚡⚡ — Catch up after absence — git history summary for a user
- `$cf-checkpoint [additional-prompt]` — ⚡⚡ — Capture a concise conversation checkpoint (decisions, breaking changes, next steps) → docs/context/checkpoints/; updates an existing checkpoint when the arg matches one.
- `$cf-checkpoint-from <slug> [message]` — ⚡⚡ — Load a saved checkpoint as context, then do the message (first word is the slug, the rest is what to do next). Add `--recap` to also print a summary of the restored context.
- `$cf-help [question]` — ⚡⚡ — This skill — answer questions about Coding Friend. Also auto-invoked.

### Auto-Invoked Skills (activate automatically when relevant)

- **cf-tdd** — ⚡⚡ — When writing new code: direct implementation by default; TDD with `--add-tests` or config `tdd: true`. Add `--auto` for standalone autopilot (auto review + fix + commit after implementation).
- **cf-sys-debug** — ⚡⚡ — When debugging: investigate → analyze → test → fix
- **cf-verification** — ⚡ — Before claiming done: run, read output, verify
- **cf-learn** — ⚡⚡ — After substantial new knowledge: extract educational notes
- **cf-remember** — ⚡⚡ — After non-obvious bug fixes, arch decisions, new conventions, or undocumented session gotchas: save to docs/memory/
- **cf-help** — ⚡⚡ — When asking about Coding Friend skills, agents, or workflows

### Agents (run in forked sessions — separate context window)

- **cf-reviewer** — ⚡ — Review orchestrator: dispatches 5 specialist agents in parallel + reducer
  - **cf-reviewer-plan** (medium reasoning effort) — Plan alignment
  - **cf-reviewer-security** (medium reasoning effort) — Security vulnerabilities
  - **cf-reviewer-quality** (low reasoning effort) — Code quality + slop detection
  - **cf-reviewer-tests** (low reasoning effort) — Test coverage
  - **cf-reviewer-rules** (low reasoning effort) — Project rules compliance (AGENTS.md)
  - **cf-reviewer-reducer** (low reasoning effort) — Deduplicates and ranks findings
- **cf-implementer** — ⚡ — Implementation subagent: direct coding by default, TDD with `--add-tests` (reads structured context file, returns result signals, supports auto-retry on failure). Does not own autopilot loops — cf-plan / cf-tdd orchestrate review / fix / commit when `--auto` is active.
- **cf-explorer** — ⚡ — Codebase exploration and context gathering (writes structured context files for downstream agents)
- **cf-planner** — ⚡ — Task decomposition with parallel/sequential phases (writes structured context file)
- **cf-writer** — ⚡ — Lightweight doc writer for markdown file generation
- **cf-writer-deep** — ⚡ — Deep reasoning doc writer for nuanced technical content

### Context Window Usage

Each skill loads its SKILL.md into context when triggered. Context tiers: `⚡` = low (<1,500 tokens), `⚡⚡` = medium (1,500–3,000), `⚡⚡⚡` = high (>3,000). Bootstrap context (~2,100 tokens) is loaded every session. Agents run in forked sessions with their own context window. For exact token counts, see https://cf.dinhanhthi.com/docs/reference/context-usage/.

### Step 3: Read specific files (if detailed question)

If the user asks about a **specific skill**, read its SKILL.md:

```
plugin/skills/<skill-name>/SKILL.md
```

If the user asks about a **specific agent**, read its definition:

```
plugin/agents/<agent-name>.md
```

If the user asks about **configuration**, read:

- `.coding-friend/config.json` — local project config
- `docs/config-schema.md` — config schema reference

If the user asks about **custom skill guides**, explain:

- Local: `.coding-friend/skills/<skill-name>-custom/SKILL.md`
- Global: `~/.coding-friend/skills/<skill-name>-custom/SKILL.md`
- Sections: `## Before` (pre-workflow), `## Rules` (throughout), `## After` (post-workflow)

### Step 4: Common Workflows (if workflow question)

If the user asks how skills work together, present these common workflows:

- **Build a feature:** `$cf-plan` → implement → `$cf-review` → `$cf-commit` → `$cf-ship`
- **Fix a bug:** `$cf-fix` → (auto: review) → `$cf-commit`
- **Quick question:** `$cf-ask` → answer saved to docs/memory/
- **Deep research:** `$cf-research` → `$cf-plan` → implement
- **End of session:** `$cf-remember` (project context for AI) + `$cf-learn` (educational notes for human)
- **Optimize:** `$cf-optimize` → baseline → fix → measure → compare

**Key distinction:** `$cf-remember` saves project knowledge for AI recall in future sessions. `$cf-learn` saves educational notes for the human to learn from.

### Step 5: Troubleshooting (if troubleshooting question)

Common issues:

- **Skill not triggering?** Check description in SKILL.md — it may not match the user's phrasing. Use `/cf-<skill-name>` to trigger manually.
- **Custom guide not loading?** Verify the path: `.coding-friend/skills/<skill-name>-custom/SKILL.md` and that it has `## Before`, `## Rules`, or `## After` sections.
- **Config not applied?** Local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`. Check both.
- **More issues?** Point the user to the [Troubleshooting page](https://cf.dinhanhthi.com/docs/reference/troubleshooting/) for memory daemon, install, hook, and MCP issues.

### Step 6: Answer concisely

Provide a clear, concise answer based on the information gathered. Link to specific files if the user wants to dive deeper.

## CLI Requirements (quick reference)

The Coding Friend plugin works without `coding-friend-cli`. The CLI adds the memory MCP server (fast indexed search), the learn-host doc server, and a few utilities — but every skill and agent has a documented fallback path.

**Three tiers:**

- **NONE** — works with zero CLI involvement.
- **OPTIONAL** — uses CLI-installed memory MCP for speed; falls back to grep over `docs/memory/` and direct file writes when CLI is absent. Full functionality preserved.
- **REQUIRED** — cannot function without CLI. **(0 skills today.)**

For the full per-skill/per-agent/per-hook matrix, see [docs/cli-requirements.md](../../../docs/cli-requirements.md).

### Example: answering "do I need the CLI?" questions

When users ask whether a skill needs the CLI, look up its tier first.

> **Q:** "Do I need the CLI to use `$cf-fix`?"
>
> **A:** "No. `cf-fix` is OPTIONAL-tier — it uses the memory MCP when available, but falls back to `grep -r '<query>' docs/memory/`. See `docs/cli-requirements.md` for the full matrix."

Trigger phrases this skill should recognize:

- "does X require the CLI?"
- "what works without coding-friend-cli?"
- "how do I use memory without the CLI?"
- "is the CLI required?"
- "do I need to install the CLI?"
