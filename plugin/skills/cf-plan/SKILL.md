---
name: cf-plan
description: >
  Brainstorm and write an implementation plan. Use when the user wants to plan, build, create,
  or implement something — e.g. "let's build", "let's create", "I want to create", "create for me",
  "build for me", "add feature", "implement", "make a", "set up", "I need a", "can you build",
  "help me build", "how should we implement", "design a solution", "architect", "scaffold",
  "plan out", "figure out how to", "what's the best way to build". Also triggers on task
  descriptions that imply multi-step implementation work requiring upfront planning.
created: 2026-02-17
updated: 2026-06-16
---

# /cf-plan

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

Create an implementation plan for: **$ARGUMENTS**

## Modes

| Mode          | Flag                           | Steps skipped/added                                                                                                                                                                                                                                                                                                                            | When to use                                                                      |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Normal**    | (none)                         | Full workflow                                                                                                                                                                                                                                                                                                                                  | Default — most tasks                                                             |
| **Fast**      | `--fast` (alias `--quick`)     | Skip discovery, inline exploration, skip planner agent. **No plan file** when the result is single-phase (plan stays in chat, tracked via TaskCreate). Falls back to writing the file if the plan turns out multi-phase (user mis-flagged it) or when combined with `--auto`. **No human overview doc in fast mode** unless `--gui` is passed. | Task is clear, single-module, additive                                           |
| **Hard**      | `--hard`                       | Extra discovery round, deeper exploration, rollback planning                                                                                                                                                                                                                                                                                   | Breaking changes, migrations, multi-module refactors                             |
| **Autopilot** | `--auto`                       | Orthogonal — adds autopilot: after Step 7 approval, run all phases autonomously (auto review + fix Critical/Important + commit per phase, no confirmation prompts between phases). Combines with any mode.                                                                                                                                     | Hands-off end-to-end execution after plan approval                               |
| **Inline**    | `--inline` (alias `--no-file`) | Orthogonal — skip Step 6 (no plan file written). Plan is presented in chat only; progress tracked via TaskCreate. Combines with `--fast`/`--hard`. Incompatible with `--auto` and `--resume`.                                                                                                                                                  | Small one-off task where the user wants planning thought but no on-disk artifact |

Flags are parsed from `$ARGUMENTS`. Strip the flag before using the remaining text as the task description. Aliases (`--quick` → `--fast`, `--no-file` → `--inline`, `--tdd` → `--add-tests`, `--human` → `--gui`) are normalized to their canonical form. The user's single-dash `-gui` / `-human` are also normalized to `--gui`.

**Human overview doc:** off by default (it costs extra tokens). Pass `--gui` (alias `--human`) to also generate a concise, human-readable `overview.html` (or `overview.md`) alongside the agent plan — see Step 6 — or enable it globally by setting `disableGUIPlan: false` in config. Format is chosen by the `guiPlanFormat` config (`html` default, or `md`).

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan`

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 0.5: Determine Mode

1. **Resume flag** — if `--resume <path>` is present in `$ARGUMENTS`, extract the plan file path and skip Steps 1–6 entirely. (If `--inline`/`--no-file` is also present, refuse: there is no file to resume from. Tell the user and stop.) → Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/resume.md` now and follow it.
2. **Explicit flag** — normalize `--quick` → `--fast` first, then use `--fast` or `--hard` if present in `$ARGUMENTS`.
   2a. **Autopilot flag** — if `--auto` is present in `$ARGUMENTS`, set autopilot=true. This is orthogonal to fast/hard/normal — autopilot can combine with any. Strip `--auto` from the task description before using it. Announce: `> 🤖 Autopilot enabled — phases will run end-to-end without confirmation prompts.`
   2b. **Inline flag** — normalize `--no-file` → `--inline` first. If `--inline` is present, set inline=true. Strip `--inline` from the task description. If `--auto` is also set, refuse the combination: `> ⚠️ --inline cannot be combined with --auto (autopilot relies on the on-disk plan file for state). Pick one.` and stop. Otherwise announce: `> 📝 Inline mode — plan will be shown in chat only; no file will be written. Progress tracked via TaskCreate.`
   2c. **Human overview doc** — off by default (it costs extra tokens). Normalize `--human`/`-gui`/`-human` → `--gui`. Resolve humanDoc with this precedence: if `--gui` is present, set humanDoc=true and strip it (explicit opt-in — overrides fast mode and config). Otherwise, if fast mode is active (`--fast`/`--quick`, or auto-detected fast in steps 3–4), humanDoc=false. Otherwise resolve `disableGUIPlan` by merging the global config `~/.coding-friend/config.json` with the local `CF_CONFIG_FILE` (default `.coding-friend/config.json`), where **local overrides global** (the documented config precedence — `cf config`/`cf init` can save the key at global scope, so a global-only setting must still take effect); set humanDoc=true only when the merged `disableGUIPlan` is **explicitly `false`**, else humanDoc=false (unset means disabled). When humanDoc=true, use the merged `guiPlanFormat` (default `html`). The overview is only produced when a plan file is written (Step 6); `--inline` writes no file, so it produces none regardless (even with `--gui`).
3. **Auto-detect** — scan the task for signals (need 2+ to trigger):
   - **Fast**: matches existing codebase pattern, single module/file, no external deps, additive-only, user says "just/simple/quick/same as"
   - **Hard**: multi-module, breaking changes/migrations/schema, security-sensitive, user says "refactor/migrate/rewrite/across all", external system deps, public API changes
4. **Confirm**: 3+ signals → apply automatically (announce reasons); 2 signals → propose and ask; mixed/unclear → use normal. When fast mode is applied (whether via `--fast` or auto-detected), note in the announcement that a single-phase plan stays in chat with no file written — unless combined with `--auto`, which always writes the file (see Step 6).

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

1. **task-id**: `YYYY-MM-DD-<short-descriptor>` (e.g. `2026-05-03-add-auth-middleware`)
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

> **Keep the agent plan agent-only.** Write only what cf-implementer needs to execute: tasks, files, verify steps, phase markers, and the minimum Context/Assumptions/Approach to act correctly. Narrative, rationale, big-picture framing, and "why this matters" belong in the **human overview doc** (Step 6), not here — do not pad the agent plan with tutorial prose.

1. Break the chosen approach into tasks grouped into **phases**; each task completable in one session.
2. Per task: what to do (files, functions, tests), expected outcome, how to verify.
3. Phase markers: `#### Phase N [parallel]` (no shared files, run concurrently) or `#### Phase N [sequential]` (ordered). If no cf-planner or flat task list, wrap in a single `[sequential]` phase.
4. When autopilot=true, the plan body MUST include a `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. Copy the AUTOPILOT CONTRACT block verbatim — Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now and copy its fenced block exactly.

> **Hard mode**: Each task adds a **Rollback** field; add `## Migration & Rollback` section with overall rollback strategy.

### Step 6: Save the Plan

> **Inline mode** (`--inline`): Skip the file write entirely. Use TaskCreate to register every task from the plan (one task per implementation task, in phase order). Present the full plan body (Context, Approach, Tasks per phase, Risks) inline in chat. Do NOT create any file under `{docsDir}/plans/`. Skip the rest of this step and proceed to Step 7. Progress tracking in Step 7 uses TaskUpdate instead of editing a plan file; all "edit the plan file" / "Progress table" instructions in Step 7 become "call TaskUpdate on the corresponding task". The context file at `{docsDir}/context/<task-id>.json` is still created (cf-implementer needs it).

> **Fast mode** (`--fast`, no `--auto`, no `--inline`): If the plan has exactly **1 phase**, do NOT write a file — follow the **Inline mode** path above (present the plan in chat, register tasks via TaskCreate, still create the context file). Because no file is written, the whole rest of the workflow tracks this plan inline: in Step 7, use TaskUpdate on the corresponding task instead of editing a plan file — the "small plan → edit `README.md`" instructions do NOT apply. If the plan turns out to have **2+ phases**, the task was bigger than fast scope assumed: announce `> ℹ️ Plan came out multi-phase — exceeded fast scope, writing it to disk.` and write the plan folder per the Layout rules below (normal Step 7 file-edit tracking applies). When `--fast` is combined with `--auto`, always write the file (autopilot reads `auto: true` from the on-disk plan), regardless of phase count.

**Layout** — every written plan is a **subfolder** `{docsDir}/plans/YYYY-MM-DD-<slug>/`; the entry point is always `README.md`. Phase count only decides whether phases are split into separate files (it no longer decides file-vs-folder):

- **Small plan** (exactly 1 phase) → `README.md` holds the full plan inline (Context, Assumptions, Approach, Progress, Tasks, Risks — the Small plan template body). No separate phase files. No task-count ceiling.
- **Big plan** (2+ phases) → `README.md` (overview + Progress table) + one `phase-N-<name>.md` per phase — see Big plan template below.

Progress icons: `⬜ TODO` → `🔄 IN PROGRESS` → `✅ DONE` | `❌ FAILED` (permanent failure after max retries)

After saving, present: folder path created, phase count, task count, entry point (`README.md`), and the overview path (if generated).

1. Use TaskCreate to create a task list.
2. Set the `slug:` frontmatter field in `README.md` to the plan folder name (`YYYY-MM-DD-<slug>`, identical to the task-id from Step 1.5). This is what the user copies to mention the plan or pass to `--resume <slug>`. Include the slug in the post-save summary so it is easy to copy.
3. Generate the human overview doc (see **Human overview doc** below) unless humanDoc=false.
4. Present the plan summary to the user.
5. When autopilot=true, add `auto: true` to the YAML frontmatter at the top of `README.md`. For **big plans**, the `## AUTOPILOT` section is ALSO copied into EVERY `phase-N-*.md` file (so any phase file Claude re-opens during a long conversation carries the rules).

#### Human overview doc

When humanDoc=true AND a plan file was written, generate a concise human-readable overview next to `README.md`. (humanDoc is off by default — it is only true when `--gui`/`--human` is passed or `disableGUIPlan: false` is set; `--inline` writes no plan file at all — so it never reaches this step.):

- **Output**: `{plan-folder}/overview.html` when `guiPlanFormat` = `html` (default), or `{plan-folder}/overview.md` when `guiPlanFormat` = `md`.
- **Generator**: dispatch **cf-writer-deep** (`subagent_type: "coding-friend:cf-writer-deep"`). Give it: the just-written plan (the `README.md` + any `phase-N-*.md`), the matching template at `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.{html,md}`, and the output path. Instruct it to fill the template's `<!-- FILL: … -->` markers from the plan and replace the placeholder content. For HTML output, it must HTML-escape prose values it injects (so `<`, `&`, and generic types like `Foo<T>` render correctly). **Mermaid diagram labels derived from plan text must also be sanitized** — strip or escape `<`, `>`, `"`, `&` in node/edge labels and wrap labels in quotes. The `<div class="mermaid">` body is parsed by the browser as HTML _before_ Mermaid runs, so an unsanitized label like `</div><img onerror=…>` would break out of the container and execute (Mermaid's `securityLevel` only sanitizes what Mermaid itself renders — too late to stop browser-level DOM injection).
- **Content rules**: SHORT and decision-focused — a **Plan at a Glance** summary (Phases = number of phases, Tasks = total tasks across all phases; both counts come straight from the just-written plan), the original problem/intent, the solution big picture, the key decisions (one concise line each), and Mermaid diagrams for any structure/flow/state-machine/algorithm where a picture beats prose. **Write Problem & Intent and Solution as concise bullet lists, not paragraphs** (the templates already use `<ul class="bullets">` / `-` bullets — fill those, don't replace with `<p>`). Do NOT copy the step-by-step task list — that lives in the agent plan.
- **Point-in-time**: generated once here; NOT updated as the Progress table changes during implementation.
- **Skip** entirely when humanDoc=false — i.e. whenever `--gui`/`--human` is absent and `disableGUIPlan` is not explicitly `false` (the default), in **fast mode** without `--gui`, or in `--inline` mode (no plan file at all).

### Step 7: Offer Implementation

Ask: **"Ready to start implementing?"** If yes, execute phase by phase. If user approves AND autopilot=true → Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now — it holds the Per-Phase Loop and the AUTOPILOT CONTRACT block. If autopilot=false → use the existing Sequential/Parallel phases protocols unchanged.

#### Sequential phases

Dispatch **cf-implementer** (`subagent_type: "coding-friend:cf-implementer"`) per task:

> Task: [description] | Context file: [path] | Context: [overall plan] | Files: [list] | Verify: [criteria] | Test patterns: [framework, locations — only if --add-tests] | Constraints: [risks/edge cases]
> If `--add-tests` was passed to `/cf-plan`, include `--add-tests` in this prompt. Otherwise implement directly without writing new tests.

**Checkpoint before dispatch**: Edit the file containing this task's row — `README.md` for small plans, or the **relevant phase file** (`phase-N-<name>.md`) for big plans. Change the task's `⬜ TODO` → `🔄 IN PROGRESS` in the Progress table. **Big plan only** — if this is the first task of the phase to leave `⬜ TODO`, also edit `README.md` and flip that phase's row to `🔄 IN PROGRESS` (see "Big plan phase sync" below).

Parse the **last non-empty line** for the result signal — strict regex `^\[CF-RESULT: (success|failure)( .*)?\]$`:

- `[CF-RESULT: success]` → Edit the same file targeted at dispatch — change `🔄 IN PROGRESS` → `✅ DONE`. Then advance to next task.
- `[CF-RESULT: failure] <reason>` → retry once
- Missing/malformed/not-on-last-line → treat as failure (`empty-output`). Never assume silent success.

**Retry protocol** (max 1 per task):

1. Notify: `> ⟳ Task N attempt 1 failed (<reason>). Retrying...`
2. Add `previous_failure` key to context file (reason, error summary, attempt number).
3. Re-dispatch cf-implementer.
4. Second failure → Edit the same file targeted at dispatch — change `🔄 IN PROGRESS` → `❌ FAILED`. **Big plan only** — also edit `README.md` and flip that phase's row to `❌ FAILED`. Report both failures, ask: "Continue to next task or stop?"

**Big plan phase sync** — every flip is its own Edit tool call applied **immediately**, never batched at the end of the plan:

- **Phase start** — when the first task of a phase flips to `🔄 IN PROGRESS` in the phase file, also flip that phase's row in `README.md` to `🔄 IN PROGRESS`.
- **Task done** — after each task reaches `✅ DONE` in the phase file, check if ALL tasks in that phase file are `✅ DONE`. If yes, update the phase's row in `README.md` to `✅ DONE`.
- **Phase failed** — when any task in the phase file becomes `❌ FAILED` (after retry), update the phase's row in `README.md` to `❌ FAILED` (overrides any `🔄 IN PROGRESS`).
- **Plan done** — when all phase rows in `README.md` are `✅ DONE`, update the top-level `**Status:**` field to `✅ DONE`. If any row is `❌ FAILED`, set `**Status:**` to `❌ FAILED` instead.
- **Parallel phases** — when multiple cf-implementer dispatches in a parallel phase return near-simultaneously, **serialize** the Edit calls: apply one Edit, wait for it to succeed, then apply the next. Concurrent edits to the same Markdown table will lose updates.
- **Autopilot override** — when the plan has `auto: true`, the README phase-row flip to ✅ DONE is DEFERRED until Step 6 of the Per-Phase Loop in `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` (after `/cf-review` clean + commit success). Do NOT flip the README row to ✅ DONE at last-task-DONE checkpoint time under autopilot — that would mislabel a phase as DONE while review may still fail. If autopilot subsequently stops at review or commit failure, the README row remains in `🔄 IN PROGRESS` and gets flipped to `❌ FAILED` by the stop-handling code paths.

**Rule**: Only the cf-plan orchestrator edits plan files (`README.md` for small plans; the README and phase files for big plans). cf-implementer must NOT modify any plan file.

**Cleanup**: Delete the context file ONLY after all phases are `✅ DONE`. On session interrupt, quota limit, or user Ctrl+C — keep the context file so `--resume` can read it later.

**Capturing out-of-scope side-effects:** If, while executing a phase, an unrelated problem surfaces that is non-trivial (fixing it would expand beyond the approved plan), do NOT fix it now and do NOT silently grow scope. Record it for later, then continue the plan:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/capture-later.sh" \
  --name "<short title>" --description "<what & where — enough to act on cold>" \
  --source cf-plan --slug <this plan's slug> [--problem "<the phase/task in progress>"]
```

This writes `<docsDir>/later/YYYY-MM-DD-<name>.md` with frontmatter (slug, problem, conversation_id). This is an in-repo audit trail, independent of the `spawn_task` tool.

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

→ When autopilot=true, Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now — it holds the Per-Phase Loop and the AUTOPILOT CONTRACT block.

#### Post-implementation

1. **Hard mode**: run `/cf-review` after every phase; only continue if review passes.
2. After all phases, automatically invoke `/cf-review` (use the Skill tool with skill name `coding-friend:cf-review`) (the per-phase reviews under autopilot already covered the changes; this final review is optional in autopilot mode but harmless).
3. If plan involved performance-critical features, suggest `/cf-optimize` as optional next step — do NOT auto-run.

## Plan Templates

### AUTOPILOT CONTRACT block

Only when `--auto`: the AUTOPILOT CONTRACT block lives in `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` (Step 5 #4 loads it for that case). Skip in normal runs.

### Small plan (1 phase — written as `README.md` inside the plan folder)

```markdown
---
slug: YYYY-MM-DD-<slug> # = plan folder name; copy this to mention or `--resume <slug>`
auto: false # set true when created with --auto
---

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

## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

<!-- only when --auto: copy the canonical "AUTOPILOT CONTRACT block" (under ## Plan Templates) here verbatim; omit this whole section when auto: false -->

## Progress

<!-- small plans are always exactly 1 phase; multi-phase plans use the Big template -->

| Status  | Phase   | Task        |
| ------- | ------- | ----------- |
| ⬜ TODO | Phase 1 | Task 1 name |
| ⬜ TODO | Phase 1 | Task 2 name |

## Tasks

#### Phase 1 [sequential]

1. <task 1>
   - Files: <specific files>
   - Verify: <how to verify>
   - Rollback: <how to undo — hard mode only>
2. <task 2>
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
---
slug: YYYY-MM-DD-<slug> # = plan folder name; copy this to mention or `--resume <slug>`
auto: false # set true when created with --auto
---

# Plan: <title>

**Mode:** normal | fast | hard
**Created:** YYYY-MM-DD
**Status:** IN PROGRESS

## Overview

<1-2 sentences about the problem and chosen approach>

## Not Building

- <explicit out-of-scope item>

## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

<!-- only when --auto: copy the canonical "AUTOPILOT CONTRACT block" (under ## Plan Templates) here verbatim; omit this whole section when auto: false -->

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

## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

<!-- only when --auto: copy the canonical "AUTOPILOT CONTRACT block" (under ## Plan Templates) here verbatim; omit this whole section when auto: false -->

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

### Human overview doc templates

The human overview doc (Step 6) is generated by cf-writer-deep from one of these skeleton templates (do NOT inline them here — they live as separate files so they don't inflate this skill's token footprint):

- `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.html` — styled, self-contained HTML; Mermaid via CDN (major-version range).
- `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.md` — Markdown mirror; Mermaid code fences.

Both carry `<!-- FILL: … -->` markers for: Problem & Intent, Solution (big picture), Key Decisions, diagram(s), Not Building.

## Completion Protocol

- **DONE** — Plan saved. Show: task count, risk summary, next step.
- **DONE_WITH_CONCERNS** — Plan saved with open questions or high-risk items. Show what needs user decision.
- **BLOCKED** — Cannot plan. Show what information is missing.

## Rules

- **Plan first, implement second** — never start coding before the plan is saved and user approves. (Inline mode: never start before the plan is **presented** in chat and user approves.)
- **Brainstorm first, plan second** — challenge assumptions, explore alternatives. Use `AskUserQuestion`. (Relaxed in fast mode.)
- **Delegate exploration** — use cf-explorer for codebase exploration, cf-planner for approach brainstorming. (Fast mode: inline search only.)
- **Delegate implementation** — use cf-implementer. If it fails after retry, fall back to inline TDD (load cf-tdd).
- **Respect the mode** — do not escalate without user consent. If mode seems wrong mid-workflow, pause and ask.
- **Honor autopilot** — if `auto: true` is in the plan frontmatter, never prompt between phases. Re-read the plan file's `## AUTOPILOT` section whenever uncertain.
- When uncertain, say so and ask.
- Do NOT assume libraries, APIs, or tools — ask.
- Plans must be concrete: exact file paths, function names, test commands.
- **No placeholders in approved plans.** Every step must be concrete before the user approves. Forbidden patterns: `TBD`, `TODO`, `"implement later"`, `"similar to step N"`, `"details to be determined"`. A plan with placeholders is a promise to plan later.
