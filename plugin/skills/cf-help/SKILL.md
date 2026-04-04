---
name: cf-help
description: >
  Answer questions about Coding Friend — skills, agents, workflows, setup.
  Auto-invoke this skill when the user asks about Coding Friend capabilities,
  available skills, how to use a skill, what skills exist, how Coding Friend
  works, what agents are available, how to configure Coding Friend, or any
  question about the toolkit itself — e.g. "what skills are available?",
  "how does coding friend work?", "what can you do?", "list all skills",
  "what agents exist?", "how do I use cf-plan?", "what is cf-tdd?",
  "explain this skill", "show me all commands", "what workflows are available?",
  "how to configure coding friend", "what is coding friend?", "help me with
  coding friend", "tell me about your skills", "what slash commands exist?",
  "how do skills work together?", "what auto-invoked skills are there?",
  "coding friend features", "coding friend setup", "what does cf-fix do?",
  "which skill should I use?", "how do I get started with coding friend?".
  Do NOT auto-invoke for general coding questions unrelated to Coding Friend itself.
user-invocable: true
model: haiku
allowed-tools: [Read, Glob]
---

# /cf-help — Coding Friend Help

Answer questions about the Coding Friend toolkit. Provide a brief overview when asked generally, or read specific skill files on-demand when asked about a particular skill/agent/workflow.

## Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-help`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

## Step 1: Understand the question

Determine what the user is asking about:

- **General overview** — what is Coding Friend, what can it do?
- **Specific skill** — how does /cf-commit work? what does cf-tdd do?
- **Specific agent** — what is the cf-reviewer agent?
- **Setup/config** — how to configure, custom guides, ignore patterns
- **Workflow** — how do skills work together?

## Step 2: Provide overview (if general question)

Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code. Core philosophy:

1. **Check skills first** — Before any task, check if a relevant skill exists
2. **Test before code** — RED → GREEN → REFACTOR
3. **Verify before claiming** — Never claim done without running tests
4. **Commit with purpose** — Conventional commits with clear "why"

### Slash Commands (user triggers with /)

- `/cf-ask [question]` — ⚡⚡ — Quick Q&A about codebase → docs/memory/
- `/cf-plan [task]` — ⚡⚡ — Brainstorm and write implementation plan
- `/cf-review [target]` — ⚡⚡ — Dispatch code review to subagent
- `/cf-commit [hint]` — ⚡ — Analyze diff and create conventional commit
- `/cf-ship [hint]` — ⚡ — Verify, commit, push, and create PR
- `/cf-fix [bug]` — ⚡⚡ — Quick bug fix workflow
- `/cf-optimize [target]` — ⚡⚡ — Structured optimization with before/after measurement
- `/cf-scan [description]` — ⚡⚡⚡ — Scan project and bootstrap memory
- `/cf-remember [topic]` — ⚡⚡ — Extract project knowledge to docs/memory/
- `/cf-learn [topic]` — ⚡⚡ — Extract learnings (configurable output, language, categories)
- `/cf-research [topic]` — ⚡⚡ — In-depth research with web search → docs/research/
- `/cf-session [label]` — ⚡⚡ — Save current session to sync folder for cross-machine resume
- `/cf-help [question]` — ⚡⚡ — This skill — answer questions about Coding Friend. Also auto-invoked.

### Auto-Invoked Skills (activate automatically when relevant)

- **cf-tdd** — ⚡⚡ — When writing new code: RED → GREEN → REFACTOR
- **cf-sys-debug** — ⚡⚡ — When debugging: investigate → analyze → test → fix
- **cf-verification** — ⚡ — Before claiming done: run, read output, verify
- **cf-help** — ⚡⚡ — When asking about Coding Friend skills, agents, or workflows

### Agents (run in forked sessions — separate context window)

- **cf-reviewer** — ⚡ — Review orchestrator: dispatches 5 specialist agents in parallel + reducer
  - **cf-reviewer-plan** (sonnet) — Plan alignment
  - **cf-reviewer-security** (sonnet) — Security vulnerabilities
  - **cf-reviewer-quality** (haiku) — Code quality + slop detection
  - **cf-reviewer-tests** (haiku) — Test coverage
  - **cf-reviewer-rules** (haiku) — Project rules compliance (CLAUDE.md)
  - **cf-reviewer-reducer** (haiku) — Deduplicates and ranks findings
- **cf-implementer** — ⚡ — TDD implementation subagent
- **cf-explorer** — ⚡ — Codebase exploration and analysis (read-only)
- **cf-planner** — ⚡ — Task decomposition and approach brainstorming
- **cf-writer** — ⚡ — Lightweight doc writer for markdown file generation
- **cf-writer-deep** — ⚡ — Deep reasoning doc writer for nuanced technical content

### Context Window Usage

Each skill loads its SKILL.md into context when triggered. Context tiers: `⚡` = low (<1,000 tokens), `⚡⚡` = medium (1,000–2,500), `⚡⚡⚡` = high (>2,500). Bootstrap context (~1,300 tokens) is loaded every session. Agents run in forked sessions with their own context window. For exact token counts, see https://cf.dinhanhthi.com/docs/reference/context-usage/.

## Step 3: Read specific files (if detailed question)

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

## Step 4: Common Workflows (if workflow question)

If the user asks how skills work together, present these common workflows:

- **Build a feature:** `/cf-plan` → implement → `/cf-review` → `/cf-commit` → `/cf-ship`
- **Fix a bug:** `/cf-fix` → (auto: review) → `/cf-commit`
- **Quick question:** `/cf-ask` → answer saved to docs/memory/
- **Deep research:** `/cf-research` → `/cf-plan` → implement
- **End of session:** `/cf-remember` (project context for AI) + `/cf-learn` (educational notes for human)
- **Optimize:** `/cf-optimize` → baseline → fix → measure → compare

**Key distinction:** `/cf-remember` saves project knowledge for AI recall in future sessions. `/cf-learn` saves educational notes for the human to learn from.

## Step 5: Troubleshooting (if troubleshooting question)

Common issues:

- **Skill not triggering?** Check description in SKILL.md — it may not match the user's phrasing. Use `/cf-<skill-name>` to trigger manually.
- **Custom guide not loading?** Verify the path: `.coding-friend/skills/<skill-name>-custom/SKILL.md` and that it has `## Before`, `## Rules`, or `## After` sections.
- **Config not applied?** Local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`. Check both.
- **After editing plugin files?** Run `cf dev sync` to copy changes to the cached version.

## Step 6: Answer concisely

Provide a clear, concise answer based on the information gathered. Link to specific files if the user wants to dive deeper.
