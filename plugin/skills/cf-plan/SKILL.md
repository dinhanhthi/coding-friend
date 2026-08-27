---
name: cf-plan
description: >
  Brainstorm and write an implementation plan. Use when the user wants to plan, build,
  create, or implement something — e.g. "let's build", "let's create", "add feature",
  "implement", "set up", "design a solution", "architect", "scaffold", "plan out", "what's
  the best way to build". Also triggers on multi-step work needing planning.
created: 2026-02-17
updated: 2026-08-27
model: inherit
---

# /cf-plan

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

Create an implementation plan for: **$ARGUMENTS**

## Modes

| Mode          | Flag                       | Effect                                                                                                                                                                                                       | When to use                    |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| **Normal**    | (none)                     | Full workflow                                                                                                                                                                                                | Default                        |
| **Fast**      | `--fast` (alias `--quick`) | Skip discovery + planner. **Never writes a plan file** — stays in chat, tracked via TaskCreate. Multi-phase → switch to normal (writes file). With `--auto`, always write. No human overview unless `--gui`. | Clear, single-module, additive |
| **Hard**      | `--hard`                   | Extra discovery, deeper exploration, rollback planning                                                                                                                                                       | Breaking / multi-module        |
| **Autopilot** | `--auto`                   | Orthogonal — after Step 7 approval, run all phases (auto review + fix Critical/Important + commit per phase, no between-phase prompts). Combines with any mode.                                              | Hands-off after approval       |
| **Inline**    | `--inline` (`--no-file`)   | Orthogonal — skip Step 6 (no plan file). Plan in chat only; progress tracked via TaskCreate. Combines with `--fast`/`--hard`. Incompatible with `--auto`.                                                    | One-off, no on-disk artifact   |
| **Model**     | `--model <alias>`          | Orthogonal — pin **cf-planner** at Step 3. Does not affect cf-explorer, cf-implementer, or cf-plan.                                                                                                          | Stronger brainstorm model      |

Parse flags from `$ARGUMENTS`; strip them (and `--model`'s value) before using the rest as the task. Normalize: `--quick` → `--fast`, `--no-file` → `--inline`, `--tdd` → `--add-tests`, `--human`/`-gui`/`-human` → `--gui`. `--model` is `--model <alias>` or `--model=<alias>`.

**Human overview doc:** off by default. `--gui` (or config `disableGUIPlan: false`) generates `overview.html`/`overview.md` at Step 6. Format: `guiPlanFormat` (`html` default, or `md`). Fast: no overview unless `--gui`. `--inline`: never (no plan file).

## Workflow

### Step 0: Custom Guide

```!
bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan
```

If output is not empty: `## Before` → before first step, `## Rules` → throughout, `## After` → after final step.

### Step 0.5: Determine Mode

0. **Legacy resume guard** — bare `--resume` in `$ARGUMENTS` → do NOT plan. Print `> ℹ️ Resuming a plan is now \`/cf-plan-resume <plan>\` (not \`/cf-plan --resume\`).` and stop.
1. **Explicit flag** — normalize `--quick` → `--fast`, then honor `--fast` or `--hard`.
   1a. **Autopilot flag** — `--auto` → autopilot=true (orthogonal). Strip it. Announce: `> 🤖 Autopilot enabled — phases will run end-to-end without confirmation prompts.`
   1b. **Inline flag** — normalize `--no-file` → `--inline`. If present, inline=true and strip. Combined with `--auto` → refuse: `> ⚠️ --inline cannot be combined with --auto (autopilot relies on the on-disk plan file for state). Pick one.` and stop. Else announce: `> 📝 Inline mode — plan will be shown in chat only; no file will be written. Progress tracked via TaskCreate.`
   1c. **Human overview doc** — normalize `--human`/`-gui`/`-human` → `--gui`. Precedence: `--gui` present → humanDoc=true and strip (overrides fast + config). Else if fast (`--fast`/`--quick` or auto-detected in steps 2–3) → humanDoc=false. Else merge `~/.coding-friend/config.json` with `CF_CONFIG_FILE` (default `.coding-friend/config.json`); **local overrides global**. humanDoc=true only when merged `disableGUIPlan` is **explicitly `false`** (unset = disabled). When true, use merged `guiPlanFormat` (default `html`). Overview only when a plan file is written (Step 6); `--inline` produces none even with `--gui`.
   1d. **`--model` flag** <!-- cf-plan-model-flag -->
   Accept `--model <alias>` (two tokens) AND `--model=<alias>` (one token). **Strip both the flag and the value** from the task description. Example: `/cf-plan --model opus Add a healthz endpoint` → remaining task description is exactly `Add a healthz endpoint`. Valid aliases: `opus`, `sonnet`, `haiku`, `fable`. Do not accept full model IDs or `inherit`. Invalid → print this exact warning then CONTINUE (do NOT stop): `> ⚠️ --model <value> không hợp lệ (chỉ opus/sonnet/haiku/fable). Bỏ qua, cf-planner chạy theo model đang active.` If `--fast`/`--quick` is already in `$ARGUMENTS`, print this exact warning then CONTINUE: `> ⚠️ --model bị bỏ qua ở fast mode (Step 3 không dispatch cf-planner).` Auto-detected fast is not known yet — item 4 re-checks after mode is resolved (steps 2–3). `--hard` still dispatches cf-planner. When a valid alias is parsed, pass it as the Agent tool `model` param when launching cf-planner at Step 3 unless skipped as fast.
2. **Auto-detect** — need 2+ signals:
   - **Fast**: existing pattern, single module/file, no external deps, additive-only, user says "just/simple/quick/same as"
   - **Hard**: multi-module, breaking/migrations/schema, security-sensitive, "refactor/migrate/rewrite/across all", external deps, public API changes
3. **Confirm**: 3+ signals → apply (announce reasons); 2 → propose and ask; mixed/unclear → normal. Fast (flag or auto): announce plan stays in chat with no file; multi-phase → switch to normal and write — unless `--auto`, which always writes (Step 6).
4. **`--model` vs resolved fast mode** — after mode is resolved (explicit `--fast`/`--quick` **or** auto-detect in steps 2–3): if a `--model` value was parsed and fast is active, print `> ⚠️ --model bị bỏ qua ở fast mode (Step 3 không dispatch cf-planner).` (do not print twice if 1d already warned) and do not pass the model at Step 3.

### Step 0.7: Check Memory

If `memory_search` is available, search task keywords. Use hits as starting context; otherwise skip.

### Step 1: Discovery & Brainstorm

> **Fast mode**: Skip — proceed to Step 2.

> If discovery shows the user hasn't decided _whether_ to build — pause and suggest `/cf-advise`. `cf-plan` plans _how_, not _whether_.

Use `AskUserQuestion` for each round. Do NOT batch questions.

**Round 1 — Understand:** List ambiguities and assumptions; ask about objectives, constraints, success criteria, preferred libraries/APIs — never guess.

**Official solutions first:** (1) framework built-ins, (2) official patterns/guides, (3) ecosystem standards. Official solution = **Option 1**; recommend custom only if official is insufficient for this case.

**Round 2 — Challenge:** Question the path (user/dev/ops/business). YAGNI, KISS, DRY. Attack the recommended approach:

| Attack             | Question                                                         |
| ------------------ | ---------------------------------------------------------------- |
| Dependency failure | If an external API/service/tool goes down, can the plan degrade? |
| Scale explosion    | At 10x load, which step breaks first?                            |
| Rollback cost      | If the direction is wrong after launch, what can we return to?   |
| Premise collapse   | Which assumption is most fragile? What if it fails?              |

If an attack holds, deform the design. If it shatters the approach, discard it and say why. Do not present a failed attack without disclosing it.

**Round 3 — Converge** (if needed): 2–3 approaches with pros/cons; ask which. Skip if already clear.

> **Hard mode** — **Round 4: Risk & Rollback**: failure modes, blast radius, rollback, feature flags / gradual rollout, incremental vs all-or-nothing.

If the user says "just plan it", skip brainstorming.

### Step 1.5: Generate Task ID

1. **task-id**: `YYYY-MM-DD-<short-descriptor>` (e.g. `2026-05-03-add-auth-middleware`)
2. **docsDir**: from `CF_CONFIG_FILE` (`$MAIN_REPO_ROOT/.coding-friend/config.json`, fallback `.coding-friend/config.json`) or default `docs`. `CF_DOCS_ROOT` is the absolute docs base.
3. **Context file**: `{docsDir}/context/{task-id}.json`

### Step 2: Explore Codebase

> **Fast mode**: Inline Glob/Grep only — no agents.
> **Normal**: Launch cf-explorer once.
> **Hard**: Launch cf-explorer twice — standard, then blast-radius.

Launch **cf-explorer** (`subagent_type: "coding-friend:cf-explorer"`):

> Explore the codebase for: [user request]
> Context file: [docsDir/context/<task-id>.json]
> Confirmed assumptions: [from Step 1] | Scope: [from Step 1]
> Answer: (1) structure & modules, (2) affected files/functions, (3) patterns/conventions/deps, (4) existing tests/configs/docs

> **Hard mode** — second call:
> Blast-radius for [files from first call]: (1) importers/dependents, (2) what breaks, (3) public API consumers, (4) test coverage gaps

### Step 3: Brainstorm Approaches

> **Fast mode**: Skip — pick the most straightforward approach from Step 2, proceed to Step 4.

Launch **cf-planner** (`subagent_type: "coding-friend:cf-planner"`). <!-- cf-plan-model-spawn --> When a valid alias was parsed in 1d, also pass `model: <alias>` on the same call. If no `--model` was given, or the value was invalid/skipped (fast mode), omit the `model` param so cf-planner inherits. Dispatched with `subagent_type`, not `context: fork` (`model` is ignored on `"fork"`).

> Plan: [user request]
> Context file: [docsDir/context/<task-id>.json] (cf-explorer findings already written; read it, then update with plan findings)
> Confirmed assumptions: [from Step 1] | User preferences: [from Step 1]
> Codebase context: [full cf-explorer report]
> Generate 2-3 approaches with pros, cons, effort, risk, confidence. Recommend one with rationale.

> **Hard mode**: 3–4 approaches; each needs migration path, rollback, incremental deploy. Include blast-radius findings.

### Step 4: Validate with User

> **Fast mode**: Skip — go to Step 5.

Present: key findings, approaches with pros/cons, recommended approach and why, open questions. Wait for approval or corrections.

### Step 5: Write the Plan

> **Keep the agent plan agent-only.** Only what cf-implementer needs: tasks, files, verify steps, phase markers, minimum Context/Assumptions/Approach. Narrative and "why" belong in the **human overview doc** (Step 6).

1. Break the approach into tasks grouped into **phases**; each task completable in one session.
2. Per task: what to do (files, functions, tests), expected outcome, how to verify.
3. Phase markers: `#### Phase N [parallel]` (no shared files) or `#### Phase N [sequential]`. No planner / flat list → one `[sequential]` phase.
4. When autopilot=true, the plan body MUST include `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)`. Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now and copy its fenced block exactly.

> **Hard mode**: Each task adds a **Rollback** field; add `## Migration & Rollback` with overall strategy.

### Step 6: Save the Plan

> **Inline mode** (`--inline`): Skip the file write entirely. Use TaskCreate to register every task from the plan (one task per implementation task, in phase order). Present the full plan body (Context, Approach, Tasks per phase, Risks) inline in chat. Do NOT create any file under `{docsDir}/plans/`. Skip the rest of this step and proceed to Step 7. Progress tracking in Step 7 uses TaskUpdate instead of editing a plan file; all "edit the plan file" / "Progress table" instructions in Step 7 become "call TaskUpdate on the corresponding task". The context file at `{docsDir}/context/<task-id>.json` is still created (cf-implementer needs it).

> **Fast mode** (`--fast`, no `--auto`, no `--inline`): **Never write a plan file.** Follow the **Inline mode** path above (present the plan in chat, register tasks via TaskCreate, still create the context file). Because no file is written, the whole rest of the workflow tracks this plan inline: in Step 7, use TaskUpdate on the corresponding task instead of editing a plan file — the "small plan → edit `README.md`" instructions do NOT apply. If the plan turns out to have **2+ phases**, announce `> ℹ️ Plan came out multi-phase — exceeded fast scope, switching to normal mode and writing it to disk.`, treat as **normal mode**, and write the plan folder per Layout below. When `--fast` is combined with `--auto`, always write the file (autopilot reads `auto: true` from the on-disk plan), regardless of phase count.

**Layout** — written plans live in `{docsDir}/plans/YYYY-MM-DD-<slug>/`; entry point is always `README.md`:

- **Small plan** (exactly 1 phase) → `README.md` holds the full plan (Small plan template). No separate phase files.
- **Big plan** (2+ phases) → `README.md` (overview + Progress) + one `phase-N-<name>.md` per phase.

Progress icons: `⬜ TODO` → `🔄 IN PROGRESS` → `✅ DONE` | `❌ FAILED` (permanent after max retries)

After saving, present: folder path, phase count, task count, entry point (`README.md`), overview path (if generated).

1. Use TaskCreate to create a task list.
2. Set `slug:` in `README.md` to the plan folder name (`YYYY-MM-DD-<slug>` = task-id from Step 1.5). Include it in the post-save summary.
3. Generate the human overview doc (see **Human overview doc** below) unless humanDoc=false.
4. Present the plan summary.
5. When autopilot=true, add `auto: true` to `README.md` frontmatter. For **big plans**, also copy `## AUTOPILOT` into EVERY `phase-N-*.md`.

#### Human overview doc

When humanDoc=true AND a plan file was written:

- **Output**: `{plan-folder}/overview.html` (`guiPlanFormat` = `html`, default) or `overview.md` (`md`).
- **Generator**: dispatch **cf-writer-deep** (`subagent_type: "coding-friend:cf-writer-deep"`). Give it the just-written plan (`README.md` + any `phase-N-*.md`), the matching template at `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.{html,md}`, and the output path. Fill `<!-- FILL: … -->` markers. HTML-escape injected prose (`<`, `&`, `Foo<T>`).
- **Content**: SHORT, decision-focused — **Plan at a Glance** (Phases + Tasks counts from the plan), problem/intent, solution big picture, key decisions (one line each), ASCII diagram in `<pre>`/code fence (no Mermaid). Write Problem & Intent and Solution as bullet lists (`<ul class="bullets">` / `-`), not paragraphs. Do NOT copy the task list.
- **Point-in-time**: generated once; not updated with Progress.
- **Skip** when humanDoc=false — default, fast without `--gui`, or `--inline`.

### Step 7: Offer Implementation

Ask: **"Ready to start implementing?"** If yes, execute phase by phase. If user approves AND autopilot=true → Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now. **Progress checkpoints (`⬜` → `🔄` → `✅`) still apply under autopilot** — see `modes/execute.md`. If autopilot=false → follow Sequential/Parallel protocols in `modes/execute.md`.

→ For Sequential/Parallel phases (cf-implementer dispatch, result-signal parsing, retry, big-plan phase sync, out-of-scope capture, phase order, post-implementation), Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/execute.md` now and follow it. (Shared with `/cf-plan-resume`.)

## Plan Templates

Read `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/plan-templates.md` now when writing the plan file. Use those skeletons exactly.

### AUTOPILOT CONTRACT block

Only when `--auto`: lives in `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` (Step 5 #4). Skip in normal runs.

### Small plan (1 phase — written as `README.md` inside the plan folder)

Skeleton in `templates/plan-templates.md` → **Small plan**.

### Big plan (subfolder)

Skeletons in `templates/plan-templates.md` → **Big plan** (`README.md` + `phase-N-<name>.md`).

### Human overview doc templates

Do not inline. Use:

- `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.html`
- `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.md`

Both have `<!-- FILL: … -->` markers for Problem & Intent, Solution, Key Decisions, diagram(s), Not Building.

## Completion Protocol

- **DONE** — Plan saved. Show: task count, risk summary, next step.
- **DONE_WITH_CONCERNS** — Plan saved with open questions or high-risk items. Show what needs user decision.
- **BLOCKED** — Cannot plan. Show what information is missing.

## Rules

- **Plan first, implement second** — never start coding before the plan is saved and user approves. (Inline: never start before the plan is **presented** in chat and user approves.)
- **Brainstorm first, plan second** — challenge assumptions, explore alternatives. Use `AskUserQuestion`. (Relaxed in fast mode.)
- **Delegate exploration** — cf-explorer for codebase, cf-planner for approaches. (Fast: inline search only.)
- **Delegate implementation** — cf-implementer. After retry failure, fall back to inline TDD (load cf-tdd).
- **Respect the mode** — do not escalate without consent. If mode seems wrong mid-workflow, pause and ask.
- **Honor autopilot** — if `auto: true` is in plan frontmatter, never prompt between phases. Re-read `## AUTOPILOT` when uncertain.
- When uncertain, say so and ask.
- Do NOT assume libraries, APIs, or tools — ask.
- Plans must be concrete: exact file paths, function names, test commands.
- **No placeholders in approved plans.** Forbidden: `TBD`, `TODO`, `"implement later"`, `"similar to step N"`, `"details to be determined"`.
