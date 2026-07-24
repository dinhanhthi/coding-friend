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
updated: 2026-07-24
---

# $cf-plan

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

Create an implementation plan for: **$ARGUMENTS**

## Modes

| Mode          | Flag                           | Steps skipped/added                                                                                                                                                                                                                                                                                                                            | When to use                                                                      |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Normal**    | (none)                         | Full workflow                                                                                                                                                                                                                                                                                                                                  | Default — most tasks                                                             |
| **Fast**      | `--fast` (alias `--quick`)     | Skip discovery, inline exploration, skip planner agent. **Never writes a plan file** — the plan stays in chat, tracked with an inline checklist. If the plan turns out multi-phase (user mis-flagged it), fast is abandoned and the run **switches to normal mode**, which writes the plan file. When combined with `--auto`, the file is always written (autopilot needs it). **No human overview doc in fast mode** unless `--gui` is passed. | Task is clear, single-module, additive                                           |
| **Hard**      | `--hard`                       | Extra discovery round, deeper exploration, rollback planning                                                                                                                                                                                                                                                                                   | Breaking changes, migrations, multi-module refactors                             |
| **Autopilot** | `--auto`                       | Orthogonal — adds autopilot: after Step 7 approval, run all phases autonomously (auto review + fix Critical/Important + commit per phase, no confirmation prompts between phases). Combines with any mode.                                                                                                                                     | Hands-off end-to-end execution after plan approval                               |
| **Inline**    | `--inline` (alias `--no-file`) | Orthogonal — skip Step 6 (no plan file written). Plan is presented in chat only; progress tracked with an inline checklist. Combines with `--fast`/`--hard`. Incompatible with `--auto`.                                                                                                                                                                 | Small one-off task where the user wants planning thought but no on-disk artifact |

Flags are parsed from `$ARGUMENTS`. Strip the flag before using the remaining text as the task description. Aliases (`--quick` → `--fast`, `--no-file` → `--inline`, `--tdd` → `--add-tests`, `--human` → `--gui`) are normalized to their canonical form. The user's single-dash `-gui` / `-human` are also normalized to `--gui`.

**Human overview doc:** off by default (it costs extra tokens). Pass `--gui` (alias `--human`) to also generate a concise, human-readable `overview.html` (or `overview.md`) alongside the agent plan — see Step 6 — or enable it globally by setting `disableGUIPlan: false` in config. Format is chosen by the `guiPlanFormat` config (`html` default, or `md`).

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 0.5: Determine Mode

0. **Legacy resume guard** — if a bare `--resume` token appears in `$ARGUMENTS`, do NOT plan. Resuming moved to its own command: `> ℹ️ Resuming a plan is now \`$cf-plan-resume <plan>\` (not \`$cf-plan --resume\`).` and stop.
1. **Explicit flag** — normalize `--quick` → `--fast` first, then use `--fast` or `--hard` if present in `$ARGUMENTS`.
   1a. **Autopilot flag** — if `--auto` is present in `$ARGUMENTS`, set autopilot=true. This is orthogonal to fast/hard/normal — autopilot can combine with any. Strip `--auto` from the task description before using it. Announce: `> 🤖 Autopilot enabled — phases will run end-to-end without confirmation prompts.`
   1b. **Inline flag** — normalize `--no-file` → `--inline` first. If `--inline` is present, set inline=true. Strip `--inline` from the task description. If `--auto` is also set, refuse the combination: `> ⚠️ --inline cannot be combined with --auto (autopilot relies on the on-disk plan file for state). Pick one.` and stop. Otherwise announce: `> 📝 Inline mode — plan will be shown in chat only; no file will be written. Progress tracked with an inline checklist.`
   1c. **Human overview doc** — off by default (it costs extra tokens). Normalize `--human`/`-gui`/`-human` → `--gui`. Resolve humanDoc with this precedence: if `--gui` is present, set humanDoc=true and strip it (explicit opt-in — overrides fast mode and config). Otherwise, if fast mode is active (`--fast`/`--quick`, or auto-detected fast in steps 2–3), humanDoc=false. Otherwise resolve `disableGUIPlan` by merging the global config `~/.coding-friend/config.json` with the local `CF_CONFIG_FILE` (default `.coding-friend/config.json`), where **local overrides global** (the documented config precedence — `cf config`/`cf init` can save the key at global scope, so a global-only setting must still take effect); set humanDoc=true only when the merged `disableGUIPlan` is **explicitly `false`**, else humanDoc=false (unset means disabled). When humanDoc=true, use the merged `guiPlanFormat` (default `html`). The overview is only produced when a plan file is written (Step 6); `--inline` writes no file, so it produces none regardless (even with `--gui`).
2. **Auto-detect** — scan the task for signals (need 2+ to trigger):
   - **Fast**: matches existing codebase pattern, single module/file, no external deps, additive-only, user says "just/simple/quick/same as"
   - **Hard**: multi-module, breaking changes/migrations/schema, security-sensitive, user says "refactor/migrate/rewrite/across all", external system deps, public API changes
3. **Confirm**: 3+ signals → apply automatically (announce reasons); 2 signals → propose and ask; mixed/unclear → use normal. When fast mode is applied (whether via `--fast` or auto-detected), note in the announcement that the plan stays in chat with no file written; if it turns out multi-phase the run switches to normal mode and writes the file — unless combined with `--auto`, which always writes the file (see Step 6).

### Step 0.7: Check Memory

If `memory_search` is available, search for keywords related to the task. Use any relevant results as starting context; otherwise skip.

### Step 1: Discovery & Brainstorm

> **Fast mode**: Skip — proceed to Step 2.

> **Not sure this is worth building, or which direction to take?** If the discovery below reveals the user hasn't actually decided _whether_ or _which approach_ — they're weighing options or questioning if the work is worth it — pause and suggest `$cf-advise` first. It runs a structured interview and returns a verdict-first recommendation. `cf-plan` assumes the decision to build is already made; it plans _how_, not _whether_.

Use a direct user question for each round. Do NOT batch questions.

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

Launch **cf-explorer** (`cf-explorer` custom agent):

> Explore the codebase for: [user request]
> Context file: [docsDir/context/<task-id>.json]
> Confirmed assumptions: [from Step 1] | Scope: [from Step 1]
> Answer: (1) project structure & relevant modules, (2) affected files/functions, (3) patterns/conventions/dependencies, (4) existing tests/configs/docs

> **Hard mode** — second cf-explorer call:
> Blast-radius for [files from first call]: (1) what imports/depends on changed code, (2) what breaks, (3) affected public API consumers, (4) test coverage gaps

### Step 3: Brainstorm Approaches

> **Fast mode**: Skip — pick the most straightforward approach from Step 2, proceed to Step 4.

Launch **cf-planner** (`cf-planner` custom agent):

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
4. When autopilot=true, the plan body MUST include a `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. Copy the AUTOPILOT CONTRACT block verbatim — Read `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now and copy its fenced block exactly.

> **Hard mode**: Each task adds a **Rollback** field; add `## Migration & Rollback` section with overall rollback strategy.

### Step 6: Save the Plan

> **Inline mode** (`--inline`): Skip the file write entirely. Create an inline checklist containing every task from the plan (one task per implementation task, in phase order). Present the full plan body (Context, Approach, Tasks per phase, Risks) inline in chat. Do NOT create any file under `{docsDir}/plans/`. Skip the rest of this step and proceed to Step 7. Progress tracking in Step 7 updates the inline checklist instead of editing a plan file; all "edit the plan file" / "Progress table" instructions in Step 7 become "update the corresponding checklist item". The context file at `{docsDir}/context/<task-id>.json` is still created (cf-implementer needs it).

> **Fast mode** (`--fast`, no `--auto`, no `--inline`): **Never write a plan file.** Follow the **Inline mode** path above (present the plan in chat, register tasks in an inline checklist, still create the context file). Because no file is written, the whole rest of the workflow tracks this plan inline: in Step 7, update the corresponding checklist item instead of editing a plan file — the "small plan → edit `README.md`" instructions do NOT apply. If the plan turns out to have **2+ phases**, the task was bigger than fast scope assumed — fast is not suitable: announce `> ℹ️ Plan came out multi-phase — exceeded fast scope, switching to normal mode and writing it to disk.`, treat the run as **normal mode** from here on, and write the plan folder per the Layout rules below (normal Step 7 file-edit tracking applies). When `--fast` is combined with `--auto`, always write the file (autopilot reads `auto: true` from the on-disk plan), regardless of phase count.

**Layout** — every written plan is a **subfolder** `{docsDir}/plans/YYYY-MM-DD-<slug>/`; the entry point is always `README.md`. Phase count only decides whether phases are split into separate files (it no longer decides file-vs-folder):

- **Small plan** (exactly 1 phase) → `README.md` holds the full plan inline (Context, Assumptions, Approach, Progress, Tasks, Risks — the Small plan template body). No separate phase files. No task-count ceiling.
- **Big plan** (2+ phases) → `README.md` (overview + Progress table) + one `phase-N-<name>.md` per phase — see Big plan template below.

Progress icons: `⬜ TODO` → `🔄 IN PROGRESS` → `✅ DONE` | `❌ FAILED` (permanent failure after max retries)

After saving, present: folder path created, phase count, task count, entry point (`README.md`), and the overview path (if generated).

1. Create a task checklist and keep it updated.
2. Set the `slug:` frontmatter field in `README.md` to the plan folder name (`YYYY-MM-DD-<slug>`, identical to the task-id from Step 1.5). This is what the user copies to mention the plan or pass to `$cf-plan-resume <slug>`. Include the slug in the post-save summary so it is easy to copy.
3. Generate the human overview doc (see **Human overview doc** below) unless humanDoc=false.
4. Present the plan summary to the user.
5. When autopilot=true, add `auto: true` to the YAML frontmatter at the top of `README.md`. For **big plans**, the `## AUTOPILOT` section is ALSO copied into EVERY `phase-N-*.md` file (so any phase file Codex re-opens during a long conversation carries the rules).

#### Human overview doc

When humanDoc=true AND a plan file was written, generate a concise human-readable overview next to `README.md`. (humanDoc is off by default — it is only true when `--gui`/`--human` is passed or `disableGUIPlan: false` is set; `--inline` writes no plan file at all — so it never reaches this step.):

- **Output**: `{plan-folder}/overview.html` when `guiPlanFormat` = `html` (default), or `{plan-folder}/overview.md` when `guiPlanFormat` = `md`.
- **Generator**: dispatch **cf-writer-deep** (`cf-writer-deep` custom agent). Give it: the just-written plan (the `README.md` + any `phase-N-*.md`), the matching template at `${PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.{html,md}`, and the output path. Instruct it to fill the template's `<!-- FILL: … -->` markers from the plan and replace the placeholder content. For HTML output, it must HTML-escape prose values it injects (so `<`, `&`, and generic types like `Foo<T>` render correctly).
- **Content rules**: SHORT and decision-focused — a **Plan at a Glance** summary (Phases = number of phases, Tasks = total tasks across all phases; both counts come straight from the just-written plan), the original problem/intent, the solution big picture, the key decisions (one concise line each), and an ASCII diagram (plain text, box-drawing/arrow characters, inside a `<pre>`/code fence — no Mermaid or other rendered-diagram syntax) for any structure/flow/state-machine/algorithm where a picture beats prose. **Write Problem & Intent and Solution as concise bullet lists, not paragraphs** (the templates already use `<ul class="bullets">` / `-` bullets — fill those, don't replace with `<p>`). Do NOT copy the step-by-step task list — that lives in the agent plan.
- **Point-in-time**: generated once here; NOT updated as the Progress table changes during implementation.
- **Skip** entirely when humanDoc=false — i.e. whenever `--gui`/`--human` is absent and `disableGUIPlan` is not explicitly `false` (the default), in **fast mode** without `--gui`, or in `--inline` mode (no plan file at all).

### Step 7: Offer Implementation

Ask: **"Ready to start implementing?"** If yes, execute phase by phase. If user approves AND autopilot=true → Read `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now — it holds the Per-Phase Loop and the AUTOPILOT CONTRACT block. **Progress checkpoints (`⬜` → `🔄` → `✅`) still apply under autopilot** — see `modes/execute.md`. If autopilot=false → follow the Sequential/Parallel phases protocols in `modes/execute.md` (see pointer below).

→ For the Sequential/Parallel phases execution protocols (cf-implementer dispatch, result-signal parsing, retry, big-plan phase sync, out-of-scope side-effect capture, phase order, post-implementation), Read `${PLUGIN_ROOT}/skills/cf-plan/modes/execute.md` now and follow it. (This is the shared protocol `$cf-plan-resume` also uses.)

## Plan Templates

### AUTOPILOT CONTRACT block

Only when `--auto`: the AUTOPILOT CONTRACT block lives in `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` (Step 5 #4 loads it for that case). Skip in normal runs.

### Small plan (1 phase — written as `README.md` inside the plan folder)

```markdown
---
slug: YYYY-MM-DD-<slug> # = plan folder name; copy this to mention or `$cf-plan-resume <slug>`
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

After implementation: `$cf-review` → `$cf-commit`
```

### Big plan (subfolder)

**README.md** (entry point):

```markdown
---
slug: YYYY-MM-DD-<slug> # = plan folder name; copy this to mention or `$cf-plan-resume <slug>`
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

After implementation: `$cf-review` → `$cf-commit`
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

- `${PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.html` — styled, self-contained HTML; diagrams as plain ASCII text in a `<pre>` block (no external dependency).
- `${PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.md` — Markdown mirror; diagrams as ASCII text in a plain code fence.

Both carry `<!-- FILL: … -->` markers for: Problem & Intent, Solution (big picture), Key Decisions, diagram(s), Not Building.

## Completion Protocol

- **DONE** — Plan saved. Show: task count, risk summary, next step.
- **DONE_WITH_CONCERNS** — Plan saved with open questions or high-risk items. Show what needs user decision.
- **BLOCKED** — Cannot plan. Show what information is missing.

## Rules

- **Plan first, implement second** — never start coding before the plan is saved and user approves. (Inline mode: never start before the plan is **presented** in chat and user approves.)
- **Brainstorm first, plan second** — challenge assumptions, explore alternatives. Use a direct user question. (Relaxed in fast mode.)
- **Delegate exploration** — use cf-explorer for codebase exploration, cf-planner for approach brainstorming. (Fast mode: inline search only.)
- **Delegate implementation** — use cf-implementer. If it fails after retry, fall back to inline TDD (load cf-tdd).
- **Respect the mode** — do not escalate without user consent. If mode seems wrong mid-workflow, pause and ask.
- **Honor autopilot** — if `auto: true` is in the plan frontmatter, never prompt between phases. Re-read the plan file's `## AUTOPILOT` section whenever uncertain.
- When uncertain, say so and ask.
- Do NOT assume libraries, APIs, or tools — ask.
- Plans must be concrete: exact file paths, function names, test commands.
- **No placeholders in approved plans.** Every step must be concrete before the user approves. Forbidden patterns: `TBD`, `TODO`, `"implement later"`, `"similar to step N"`, `"details to be determined"`. A plan with placeholders is a promise to plan later.
