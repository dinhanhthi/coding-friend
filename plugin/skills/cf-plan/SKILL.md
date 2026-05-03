---
name: cf-plan
description: >
  Brainstorm and write an implementation plan. Use when the user wants to plan, build, create,
  or implement something — e.g. "let's build", "let's create", "I want to create", "create for me",
  "build for me", "add feature", "implement", "make a", "set up", "I need a", "can you build",
  "help me build", "how should we implement", "design a solution", "architect", "scaffold",
  "plan out", "figure out how to", "what's the best way to build". Also triggers on task
  descriptions that imply multi-step implementation work requiring upfront planning.
---

# /cf-plan

Create an implementation plan for: **$ARGUMENTS**

## Modes

| Mode       | Flag     | Steps skipped/added                                          | When to use                                          |
| ---------- | -------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| **Normal** | (none)   | Full workflow                                                | Default — most tasks                                 |
| **Fast**   | `--fast` | Skip discovery, inline exploration, skip planner agent       | Task is clear, single-module, additive               |
| **Hard**   | `--hard` | Extra discovery round, deeper exploration, rollback planning | Breaking changes, migrations, multi-module refactors |

Flags are parsed from `$ARGUMENTS`. Strip the flag before using the remaining text as the task description.

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan`

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 0.5: Determine Mode

1. **Resume flag** — if `--resume <path>` is present in `$ARGUMENTS`, extract the plan file path and jump immediately to the **Resume Protocol** in Step 7. Skip Steps 1–6 entirely.
2. **Explicit flag** — use `--fast` or `--hard` if present in `$ARGUMENTS`.
3. **Auto-detect** — scan the task for signals (need 2+ to trigger):
   - **Fast**: matches existing codebase pattern, single module/file, no external deps, additive-only, user says "just/simple/quick/same as"
   - **Hard**: multi-module, breaking changes/migrations/schema, security-sensitive, user says "refactor/migrate/rewrite/across all", external system deps, public API changes
4. **Confirm**: 3+ signals → apply automatically (announce reasons); 2 signals → propose and ask; mixed/unclear → use normal.

### Step 0.7: Check Memory

If `memory_search` is available, search for keywords related to the task. Use any relevant results as starting context; otherwise skip.

### Step 1: Discovery & Brainstorm

> **Fast mode**: Skip — proceed to Step 2.

Use `AskUserQuestion` for each round. Do NOT batch questions.

**Round 1 — Understand:** List ambiguities and assumptions; ask probing questions about objectives, constraints, success criteria; ask about preferred libraries/APIs — never guess.

**Check for official solutions first (before proposing anything):**

1. **Framework built-ins** — search official docs for native components or methods that solve this directly (e.g., React Suspense for loading states, Next.js Server Actions for mutations).
2. **Official patterns** — check framework best practices and migration guides for the recommended approach.
3. **Ecosystem standards** — identify officially maintained or widely adopted libraries for this use case.

If an official solution exists, it must be **Option 1** in the approach list. If recommending a custom approach over it, explain why the official solution is insufficient for this specific case.

**Round 2 — Challenge:** Question whether the proposed approach is the best path. Consider user/dev/ops/business angles. Be honest about feasibility and trade-offs. Apply YAGNI, KISS, DRY.

Run these **attack angles** against the recommended approach before presenting it:

| Attack angle       | Question                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| Dependency failure | If an external API, service, or tool goes down, can the plan degrade gracefully?        |
| Scale explosion    | At 10x data volume or user load, which step breaks first?                               |
| Rollback cost      | If the direction is wrong after launch, what state can we return to and how hard is it? |
| Premise collapse   | Which assumption in this plan is most fragile? What happens if it does not hold?        |

If an attack holds, deform the design and present the deformed version. If it shatters the approach entirely, discard it and tell the user why. Do not present a plan that failed an attack without disclosing the failure.

**Round 3 — Converge** (if needed): Present 2-3 approaches with pros/cons; ask which to pursue. Skip if request was already clear.

> **Hard mode** — add **Round 4: Risk & Rollback**: failure modes and blast radius; rollback plan; feature flags / gradual rollout options; incremental vs. all-or-nothing deployment.

If the user wants to skip brainstorming ("just plan it"), respect that and move on.

### Step 1.5: Generate Task ID

1. **task-id**: `<timestamp>-<short-descriptor>` (e.g. `1717500000-add-auth-middleware`)
2. **docsDir**: read from `CF_CONFIG_FILE` (= `$MAIN_REPO_ROOT/.coding-friend/config.json` from bootstrap context, fallback to `.coding-friend/config.json` in CWD) or default to `docs`. Use `CF_DOCS_ROOT` as the absolute docs base dir.
3. **Context file**: `{docsDir}/context/{task-id}.json`

### Step 2: Explore Codebase

> **Fast mode**: Inline search with Glob/Grep only — no agents, no deep exploration.
> **Normal**: Launch cf-explorer agent once.
> **Hard**: Launch cf-explorer twice — standard exploration, then blast-radius analysis.

Launch **cf-explorer** (`subagent_type: "coding-friend:cf-explorer"`):

> Explore the codebase for: [user request]
> Context file: [docsDir/context/<task-id>.json]
> Confirmed assumptions: [from Step 1] | Scope: [from Step 1]
> Answer: (1) project structure & relevant modules, (2) affected files/functions, (3) patterns/conventions/dependencies, (4) existing tests/configs/docs

> **Hard mode** — second cf-explorer call:
> Blast-radius for [files from first call]: (1) what imports/depends on changed code, (2) what breaks, (3) affected public API consumers, (4) test coverage gaps

### Step 3: Brainstorm Approaches

> **Fast mode**: Skip — pick the most straightforward approach from Step 2, proceed to Step 4.

Launch **cf-planner** (`subagent_type: "coding-friend:cf-planner"`):

> Plan: [user request]
> Context file: [docsDir/context/<task-id>.json] (cf-explorer findings already written; read it, then update with plan findings)
> Confirmed assumptions: [from Step 1] | User preferences: [from Step 1]
> Codebase context: [full cf-explorer report]
> Generate 2-3 approaches with pros, cons, effort, risk, confidence. Recommend one with rationale.

> **Hard mode**: Generate 3-4 approaches; each must include migration path, rollback strategy, incremental deployment option. Include blast-radius findings.

### Step 4: Validate with User

> **Fast mode**: Skip — go to Step 5.

Present: key codebase findings, approaches with pros/cons, recommended approach and why, open questions. Wait for approval or corrections.

### Step 5: Write the Plan

1. Break the chosen approach into tasks grouped into **phases**; each task completable in one session.
2. Per task: what to do (files, functions, tests), expected outcome, how to verify.
3. Phase markers: `#### Phase N [parallel]` (no shared files, run concurrently) or `#### Phase N [sequential]` (ordered). If no cf-planner or flat task list, wrap in a single `[sequential]` phase.

> **Hard mode**: Each task adds a **Rollback** field; add `## Migration & Rollback` section with overall rollback strategy.

### Step 6: Save the Plan

**Size threshold**: count total tasks across all phases.

- **Small** (< 8 tasks AND < 3 phases) → single file `{docsDir}/plans/YYYY-MM-DD-<slug>.md` — see Small plan template below.
- **Big** (8+ tasks OR 3+ phases) → subfolder `{docsDir}/plans/YYYY-MM-DD-<slug>/` with `README.md` + one `phase-N-<name>.md` per phase — see Big plan template below.

Progress icons: `⬜ TODO` → `🔄 IN PROGRESS` → `✅ DONE` | `❌ FAILED` (permanent failure after max retries)

After saving, present: path(s) created, phase count, task count, entry point.

1. Use TaskCreate to create a task list.
2. Present the plan summary to the user.

### Step 7: Offer Implementation

Ask: **"Ready to start implementing?"** If yes, execute phase by phase.

#### Resume Protocol (`--resume <path>`)

1. **Resolve the plan file**:
   - Full path (contains `/`) → validate it is within the current working directory or `{docsDir}`; report error and stop if outside.
   - Filename only → look up `{docsDir}/plans/<path>` (append `.md` if missing).
   - If not found → report error and stop.
2. Read the plan file at the resolved path.
3. Derive the task-id: extract from the filename stem (e.g. `2026-05-03-my-plan` → `<timestamp>-my-plan`) or from a `task-id:` frontmatter field if present. Re-read existing context file at `{docsDir}/context/<task-id>.json` if it exists — load it now, before dispatching any tasks.
4. Scan the Progress table. Classify each task:
   - `✅ DONE` → skip.
   - `🔄 IN PROGRESS` → Edit plan file: reset to `⬜ TODO`, treat as pending. (Session ended mid-task; completion status is unreliable.)
   - `❌ FAILED` → ask user: "Task N previously failed. Re-run it? (y/n)"
   - `⬜ TODO` → pending, run as normal.
5. If ALL tasks are `✅ DONE` → inform user: "Plan is already complete. Nothing to resume." Stop.
6. Show user: list of pending tasks and estimated phases remaining. Ask: "Resume from the first pending task? (y/n)"
7. If confirmed → execute pending tasks using the same Sequential phases protocol below, passing the context file loaded in step 3 to each cf-implementer dispatch.

#### Sequential phases

Dispatch **cf-implementer** (`subagent_type: "coding-friend:cf-implementer"`) per task:

> Task: [description] | Context file: [path] | Context: [overall plan] | Files: [list] | Verify: [criteria] | Test patterns: [framework, locations — only if --add-tests] | Constraints: [risks/edge cases]
> If `--add-tests` was passed to `/cf-plan`, include `--add-tests` in this prompt. Otherwise implement directly without writing new tests.

**Checkpoint before dispatch**: Edit the plan file — change the task's `⬜ TODO` → `🔄 IN PROGRESS` in the Progress table.

Parse the **last non-empty line** for the result signal — strict regex `^\[CF-RESULT: (success|failure)( .*)?\]$`:

- `[CF-RESULT: success]` → Edit the plan file — change `🔄 IN PROGRESS` → `✅ DONE`. Then advance to next task.
- `[CF-RESULT: failure] <reason>` → retry once
- Missing/malformed/not-on-last-line → treat as failure (`empty-output`). Never assume silent success.

**Retry protocol** (max 1 per task):

1. Notify: `> ⟳ Task N attempt 1 failed (<reason>). Retrying...`
2. Add `previous_failure` key to context file (reason, error summary, attempt number).
3. Re-dispatch cf-implementer.
4. Second failure → Edit the plan file — change `🔄 IN PROGRESS` → `❌ FAILED`. Report both failures, ask: "Continue to next task or stop?"

**Big plan phase sync**: After each task reaches `✅ DONE`, check if ALL tasks in the current phase file are `✅ DONE`. If yes, update the phase's row in `README.md` progress table to `✅ DONE`. When all phase rows in `README.md` are `✅ DONE`, update the top-level `**Status:**` field to `✅ DONE`.

**Rule**: Only the cf-plan orchestrator edits the plan file. cf-implementer must NOT modify the plan file.

**Cleanup**: Delete the context file ONLY after all phases are `✅ DONE`. On session interrupt, quota limit, or user Ctrl+C — keep the context file so `--resume` can read it later.

#### Parallel phases

**File-overlap guard** (MANDATORY before spawning):

1. Collect declared file lists from each task's `files:` field.
2. Normalize all paths (absolute, no trailing slashes).
3. If any path appears in 2+ tasks → STOP. Report duplicates and tasks involved.
4. Ask: _"Phase N has a file-overlap conflict. (a) Convert to sequential, (b) reorganize so files don't overlap, or (c) abort?"_
5. Only proceed after user resolves. Do NOT auto-serialize.

After overlap check passes:

1. Spawn one cf-implementer **per task** with `run_in_background: true` — all in a **single message block**.
2. Each agent prompt must be fully self-contained.
3. Render status table immediately after launch (`running` → `done`/`failed`).
4. Wait for all to complete; update table as each reports.
5. All passed → proceed to next phase automatically. Any failed → warn, show details, ask: **"Proceed? (y/n)"**

#### Phase execution order

Phase 1 → Phase 2 → … A phase must complete before the next starts.

#### Post-implementation

1. **Hard mode**: run `/cf-review` after every phase; only continue if review passes.
2. After all phases, automatically invoke `/cf-review` (Skill tool, `coding-friend:cf-review`).
3. If plan involved performance-critical features, suggest `/cf-optimize` as optional next step — do NOT auto-run.

## Plan Templates

### Small plan (single file)

```markdown
# Plan: <title>

**Mode:** normal | fast | hard

## Context

<1-2 sentences>

## Assumptions

- <assumption> — basis: <why>

## Approach

<chosen approach and why>

## Not Building

- <explicit out-of-scope item>

## Progress

| Status  | Phase   | Task      |
| ------- | ------- | --------- |
| ⬜ TODO | Phase 1 | Task name |
| ⬜ TODO | Phase 2 | Task name |

## Tasks

#### Phase 1 [parallel]

1. <task 1>
   - Files: <specific files>
   - Verify: <how to verify>
   - Rollback: <how to undo — hard mode only>
2. <task 2>
   - Files: <no overlap with task 1>
   - Verify: <how to verify>

#### Phase 2 [sequential]

3. <task 3> — depends on Phase 1
   - Files: <specific files>
   - Verify: <how to verify>

## Risks

- <risk and mitigation>

## Migration & Rollback (hard mode only)

- Overall rollback strategy: <how to revert all>
- Point of no return: <which task>
- Incremental deployment: <gradual rollout option>

## Next Steps

After implementation: `/cf-review` → `/cf-commit`
```

### Big plan (subfolder)

**README.md** (entry point):

```markdown
# Plan: <title>

**Mode:** normal | fast | hard
**Created:** YYYY-MM-DD
**Status:** IN PROGRESS

## Overview

<1-2 sentences about the problem and chosen approach>

## Not Building

- <explicit out-of-scope item>

## Progress

| Status  | Phase           | File                                     | Tasks   |
| ------- | --------------- | ---------------------------------------- | ------- |
| ⬜ TODO | Phase 1: <name> | [phase-1-<name>.md](./phase-1-<name>.md) | N tasks |
| ⬜ TODO | Phase 2: <name> | [phase-2-<name>.md](./phase-2-<name>.md) | N tasks |

## Assumptions

- <assumption> — basis: <why>

## Risks

- <risk and mitigation>

## Migration & Rollback (hard mode only)

- Overall rollback strategy: <how to revert all>
- Point of no return: <which task>
- Incremental deployment: <gradual rollout option>

## Next Steps

After implementation: `/cf-review` → `/cf-commit`
```

**phase-N-\<name\>.md** (one per phase):

```markdown
# Phase N: <name>

**Plan:** [README.md](./README.md)
**Type:** parallel | sequential

## Progress

| Status  | Task          |
| ------- | ------------- |
| ⬜ TODO | <task 1 name> |
| ⬜ TODO | <task 2 name> |

## Tasks

1. <task 1>
   - Files: <specific files>
   - Verify: <how to verify>
   - Rollback: <how to undo — hard mode only>
2. <task 2>
   - Files: <specific files>
   - Verify: <how to verify>
```

## Completion Protocol

- **DONE** — Plan saved. Show: task count, risk summary, next step.
- **DONE_WITH_CONCERNS** — Plan saved with open questions or high-risk items. Show what needs user decision.
- **BLOCKED** — Cannot plan. Show what information is missing.

## Rules

- **Plan first, implement second** — never start coding before the plan is saved and user approves.
- **Brainstorm first, plan second** — challenge assumptions, explore alternatives. Use `AskUserQuestion`. (Relaxed in fast mode.)
- **Delegate exploration** — use cf-explorer for codebase exploration, cf-planner for approach brainstorming. (Fast mode: inline search only.)
- **Delegate implementation** — use cf-implementer. If it fails after retry, fall back to inline TDD (load cf-tdd).
- **Respect the mode** — do not escalate without user consent. If mode seems wrong mid-workflow, pause and ask.
- When uncertain, say so and ask.
- Do NOT assume libraries, APIs, or tools — ask.
- Plans must be concrete: exact file paths, function names, test commands.
- **No placeholders in approved plans.** Every step must be concrete before the user approves. Forbidden patterns: `TBD`, `TODO`, `"implement later"`, `"similar to step N"`, `"details to be determined"`. A plan with placeholders is a promise to plan later.
