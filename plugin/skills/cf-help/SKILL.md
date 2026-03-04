---
name: cf-help
description: Answer questions about Coding Friend — skills, agents, workflows, setup
user-invocable: true
model: haiku
tools: [Read, Glob]
---

# /cf-help — Coding Friend Help

Answer questions about the Coding Friend toolkit. Provide a brief overview when asked generally, or read specific skill files on-demand when asked about a particular skill/agent/workflow.

## Step 0: Load Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-help`

If output is not empty, integrate the returned sections:

- `## Before` → execute before Step 1
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

## Step 1: Understand the question

Determine what the user is asking about:

- **General overview** — what is Coding Friend, what can it do?
- **Specific skill** — how does /cf-commit work? what does cf-tdd do?
- **Specific agent** — what is the cf-code-reviewer agent?
- **Setup/config** — how to configure, custom guides, ignore patterns
- **Workflow** — how do skills work together?

## Step 2: Provide overview (if general question)

Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code. Core philosophy:

1. **Check skills first** — Before any task, check if a relevant skill exists
2. **Test before code** — RED → GREEN → REFACTOR
3. **Verify before claiming** — Never claim done without running tests
4. **Commit with purpose** — Conventional commits with clear "why"

### Slash Commands (user triggers with /)

- `/cf-ask [question]` — Quick Q&A about codebase → docs/memory/
- `/cf-plan [task]` — Brainstorm and write implementation plan
- `/cf-review [target]` — Dispatch code review to subagent
- `/cf-commit [hint]` — Analyze diff and create conventional commit
- `/cf-ship [hint]` — Verify, commit, push, and create PR
- `/cf-fix [bug]` — Quick bug fix workflow
- `/cf-optimize [target]` — Structured optimization with before/after measurement
- `/cf-remember [topic]` — Extract project knowledge to docs/memory/
- `/cf-learn [topic]` — Extract learnings (configurable output, language, categories)
- `/cf-research [topic]` — In-depth research with web search → docs/research/
- `/cf-help [question]` — This skill — answer questions about Coding Friend

### Auto-Invoked Skills (activate automatically when relevant)

- **cf-tdd** — When writing new code: RED → GREEN → REFACTOR
- **cf-sys-debug** — When debugging: investigate → analyze → test → fix
- **cf-auto-review** — When reviewing code: plan, quality, security, testing
- **cf-verification** — Before claiming done: run, read output, verify

### Agents

- **cf-code-reviewer** — Multi-layer code review in forked context
- **cf-implementer** — TDD implementation subagent
- **cf-explorer** — Codebase exploration and analysis (read-only)
- **cf-planner** — Task decomposition and approach brainstorming
- **cf-writer** — Lightweight doc writer for markdown file generation
- **cf-writer-deep** — Deep reasoning doc writer for nuanced technical content

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

## Step 4: Answer concisely

Provide a clear, concise answer based on the information gathered. Link to specific files if the user wants to dive deeper.
