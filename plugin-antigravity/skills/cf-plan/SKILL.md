---
name: cf-plan
description: >
  Brainstorm and write an implementation plan. Use when the user wants to plan, build,
  create, or implement something — e.g. "let's build", "let's create", "add feature",
  "implement", "set up", "design a solution", "architect", "scaffold", "plan out", "what's
  the best way to build". Also triggers on multi-step work needing planning.
created: 2026-02-17
updated: 2026-09-09
---

# /cf-plan

Create an implementation plan for: **$ARGUMENTS**

## Modes

- `--fast` (`--quick`) — skip discovery + planner; plan stays in chat (Track progress), never writes a file unless `--auto` or 2+ phases (then normal).
- `--hard` — extra discovery, deeper exploration, rollback planning.
- `--auto` — after approval, run all phases (review + fix + commit, no prompts). Combines with any mode.
- `--inline` (`--no-file`) — no plan file; chat only; Track progress. Incompatible with `--auto`.
- `--gui` (`--human`; or config `disableGUIPlan: false`; `guiPlanFormat` html|md) — overview at Step 6 when a file is written. Fast: none unless `--gui`.
- `--model <alias>` — pin cf-planner at Step 3 (`--model <alias>` or `--model=<alias>`).
- `--add-tests` (`--tdd`) — TDD for implementation.

Strip flags (and `--model`'s value) before using the rest as the task. `brief.md` is written in native normal/hard only.

## Workflow

### Step 0: Custom Guide

```!
bash "<plugin-root>/lib/load-custom-guide.sh" cf-plan
```

If the block above printed anything, apply only the `## Before`, `## Rules`, and `## After` sections; if it shows the raw command instead of output, re-run that exact `load-custom-guide.sh` fence now.

### Step 0.5: Determine Mode

0. **Resume** — bare `--resume` → print `> ℹ️ Resuming a plan is now \`/cf-plan-resume <plan>\` (not \`/cf-plan --resume\`).` and stop.
1. **Explicit flag** — `--quick` → `--fast`; honor `--fast` or `--hard`.
   1a. **Autopilot** — `--auto` → true; strip. Announce: `> 🤖 Autopilot enabled — phases will run end-to-end without confirmation prompts.`
   1b. **Inline** — `--no-file` → `--inline`; if with `--auto` refuse: `> ⚠️ --inline cannot be combined with --auto (autopilot relies on the on-disk plan file for state). Pick one.` Else announce: `> 📝 Inline mode — plan will be shown in chat only; no file will be written. Track progress.`
   1c. **Overview** — `--human`/`-gui`/`-human` → `--gui`. `--gui` → humanDoc=true (overrides fast + config). Else if fast → false. Else merge global+local config (local wins); true only when `disableGUIPlan` is explicitly `false`. Format: `guiPlanFormat` (default `html`). None for `--inline`.
   1d. **`--model` flag** <!-- cf-plan-model-flag -->
   Accept `--model <alias>` (two tokens, e.g. `--model pro`) AND `--model=<alias>` (one token, e.g. `--model=flash`). **Strip both the flag and the value**. Example: `/cf-plan --model pro Add a healthz endpoint` → remaining task description is exactly `Add a healthz endpoint`. Valid aliases: `inherit`, `flash`, `pro`. Do not accept Claude aliases or full model IDs. Invalid → print this exact warning then CONTINUE (do NOT stop): `> ⚠️ --model <value> is not a valid Antigravity model alias (inherit|flash|pro). Ignoring it; cf-planner inherits the session model.` If `--fast`/`--quick` is already in `$ARGUMENTS`, print this exact warning then CONTINUE: `> ⚠️ --model bị bỏ qua ở fast mode (Step 3 không dispatch cf-planner).` Auto-detected fast is not known yet — item 4 re-checks after mode is resolved (steps 2–3). `--hard` still dispatches cf-planner. When a valid alias is parsed, it is used at Step 3 unless skipped as fast.
2. **Auto-detect** — 2+ signals. Fast: existing pattern, single module, additive, "just/simple/quick". Hard: multi-module, breaking/schema, security, "refactor/migrate/rewrite", public API.
3. **Confirm**: 3+ → apply; 2 → ask; mixed → normal. Fast: chat only; 2+ phases → write as normal unless `--auto` (always writes).
4. **`--model` vs resolved fast mode** — after explicit `--fast`/`--quick` or auto-detect: if `--model` was parsed and fast is active, print `> ⚠️ --model bị bỏ qua ở fast mode (Step 3 không dispatch cf-planner).` (skip if 1d already warned); do not pass the model at Step 3.

### Step 0.7: Check Memory

Recall memory with task keywords, or skip.

### Step 1: Discovery & Brainstorm

Keep Q&A for `brief.md`. Fast: skip to Step 2. If the user hasn't decided _whether_ to build, suggest `/cf-advise`. Ask the user each round; never batch. Read now: `modes/brainstorm.md` at Step 1 rounds. Skip if "just plan it".

### Step 1.5: Generate Task ID

**task-id** `YYYY-MM-DD-<short-descriptor>`; docsDir from `CF_CONFIG_FILE` (fallback `docs`); context `{docsDir}/context/{task-id}.json`.

### Step 2: Explore Codebase

> **Fast mode**: Inline Glob/Grep only — no agents.
> **Normal**: Launch cf-explorer once.
> **Hard**: Launch cf-explorer twice — standard, then blast-radius.

Dispatch `cf-explorer`. Read now: `templates/plan-templates.md` for Step 2/3 prompts AND when writing the plan file.

### Step 3: Brainstorm Approaches

> **Fast mode**: Skip — pick the most straightforward approach from Step 2, proceed to Step 4.

Dispatch `cf-planner`.
When a valid alias was parsed in 1d, call `invoke_subagent` with agent `cf-planner` and that explicit model (`inherit`, `flash`, or `pro`). If no `--model` was given, or the value was invalid/skipped (fast mode), omit an explicit spawn model so `cf-planner` inherits the session model.

> Plan: prompt in `templates/plan-templates.md` (Step 3).

### Step 4: Validate with User

> **Fast mode**: Skip — go to Step 5.

Present: key findings, approaches with pros/cons, recommended approach and why, open questions. Wait for approval or corrections.

### Step 5: Write the Plan

Agent-only: tasks, files, verify, phase markers, minimum Context/Assumptions/Approach. Narrative → human overview (Step 6). Group into **phases** (one session each). Per task: files, outcome, verify. Markers: `#### Phase N [parallel]` or `[sequential]`; no planner → one `[sequential]`. Autopilot: copy `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` from `modes/autopilot.md`. Hard: **Rollback** per task + `## Migration & Rollback`.

### Step 6: Save the Plan

> **No-file modes** (`--inline`, or `--fast` without `--auto`): skip the write; present the plan in chat; Track progress with one item per task; still create the context file. `--fast` with 2+ phases → announce `> ℹ️ Plan came out multi-phase — exceeded fast scope, switching to normal mode and writing it to disk.` and write the folder (no `brief.md`). `--fast --auto` always writes (no `brief.md`).

**Layout & human overview:** `{docsDir}/plans/YYYY-MM-DD-<slug>/`, entry `README.md` (small plan = README only; big plan = README + `phase-N-<name>.md`); `brief.md` normal/hard only. Icons `⬜ TODO` → `🔄 IN PROGRESS` → `✅ DONE` | `❌ FAILED`. Details and the overview doc rules: `templates/plan-templates.md`.

1. Track progress: one item per task.
2. Set `slug:` in `README.md` to the folder name (= task-id).
3. Native normal/hard only: write `brief.md` from the Brief skeleton.
4. Human overview unless humanDoc=false (`templates/plan-templates.md`).
5. Present path, phase/task counts, `README.md`, overview/`brief.md` if written. Suggest `/cf-plan-review <slug>`.
6. Autopilot: `auto: true` in README; copy `## AUTOPILOT` into every `phase-N-*.md`.

### Step 7: Offer Implementation

Ask **"Ready to start implementing?"** Yes + autopilot → `modes/autopilot.md` (checkpoints still apply). Else `modes/execute.md` (shared with `/cf-plan-resume`).

## Templates

Read `<plugin-root>/skills/cf-plan/templates/plan-templates.md` when writing the plan file (Small plan, Big plan, Brief, Layout, Human overview, Step 2/3 prompts; overview templates `overview-template.{html,md}` with `<!-- FILL: … -->` markers). Autopilot block: `modes/autopilot.md` (only with `--auto`).

## Completion Protocol

**DONE** — saved; show counts/risks/next. **DONE_WITH_CONCERNS** — saved with open questions. **BLOCKED** — missing info.

## Rules

- **Plan first** — never code before the plan is saved (or presented, if inline) and approved.
- **Brainstorm first** — challenge assumptions; Ask the user (relaxed in fast).
- **Delegate** — Dispatch `cf-explorer` / `cf-planner` / `cf-implementer`. After retry failure, load cf-tdd inline.
- **Respect the mode** — do not escalate without consent; pause and ask if it seems wrong.
- **Honor autopilot** — if `auto: true` in frontmatter, never prompt between phases.
- **Concrete, no placeholders** — exact paths, functions, test commands. Forbidden: `TBD`, `TODO`, "implement later", "similar to step N".
