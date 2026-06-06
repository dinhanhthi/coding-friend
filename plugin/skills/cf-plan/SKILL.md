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
updated: 2026-06-06
---

# /cf-plan

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

Create an implementation plan for: **$ARGUMENTS**

## Modes

| Mode          | Flag                           | Steps skipped/added                                                                                                                                                                                        | When to use                                                                      |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Normal**    | (none)                         | Full workflow                                                                                                                                                                                              | Default — most tasks                                                             |
| **Fast**      | `--fast` (alias `--quick`)     | Skip discovery, inline exploration, skip planner agent. **No plan file** when the result is single-phase (plan stays in chat, tracked via TaskCreate). Falls back to writing the file if the plan turns out multi-phase (user mis-flagged it) or when combined with `--auto`. **No human overview doc in fast mode** (even with `--auto`). | Task is clear, single-module, additive                                           |
| **Hard**      | `--hard`                       | Extra discovery round, deeper exploration, rollback planning                                                                                                                                               | Breaking changes, migrations, multi-module refactors                             |
| **Autopilot** | `--auto`                       | Orthogonal — adds autopilot: after Step 7 approval, run all phases autonomously (auto review + fix Critical/Important + commit per phase, no confirmation prompts between phases). Combines with any mode. | Hands-off end-to-end execution after plan approval                               |
| **Inline**    | `--inline` (alias `--no-file`) | Orthogonal — skip Step 6 (no plan file written). Plan is presented in chat only; progress tracked via TaskCreate. Combines with `--fast`/`--hard`. Incompatible with `--auto` and `--resume`.              | Small one-off task where the user wants planning thought but no on-disk artifact |

Flags are parsed from `$ARGUMENTS`. Strip the flag before using the remaining text as the task description. Aliases (`--quick` → `--fast`, `--no-file` → `--inline`, `--tdd` → `--add-tests`, `--no-human` → `--no-gui`) are normalized to their canonical form. The user's single-dash `-no-gui` / `-no-human` are also normalized to `--no-gui`.

**Human overview doc:** every written plan also gets a concise, human-readable `overview.html` (or `overview.md`) alongside the agent plan — see Step 6. Disable it per-run with `--no-gui` (alias `--no-human`) or globally with the `disableGUIPlan` config key. Format is chosen by the `guiPlanFormat` config (`html` default, or `md`).

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan`

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 0.5: Determine Mode

1. **Resume flag** — if `--resume <path>` is present in `$ARGUMENTS`, extract the plan file path and jump immediately to the **Resume Protocol** in Step 7. Skip Steps 1–6 entirely. (If `--inline`/`--no-file` is also present, refuse: there is no file to resume from. Tell the user and stop.)
2. **Explicit flag** — normalize `--quick` → `--fast` first, then use `--fast` or `--hard` if present in `$ARGUMENTS`.
   2a. **Autopilot flag** — if `--auto` is present in `$ARGUMENTS`, set autopilot=true. This is orthogonal to fast/hard/normal — autopilot can combine with any. Strip `--auto` from the task description before using it. Announce: `> 🤖 Autopilot enabled — phases will run end-to-end without confirmation prompts.`
   2b. **Inline flag** — normalize `--no-file` → `--inline` first. If `--inline` is present, set inline=true. Strip `--inline` from the task description. If `--auto` is also set, refuse the combination: `> ⚠️ --inline cannot be combined with --auto (autopilot relies on the on-disk plan file for state). Pick one.` and stop. Otherwise announce: `> 📝 Inline mode — plan will be shown in chat only; no file will be written. Progress tracked via TaskCreate.`
   2c. **Human overview doc** — normalize `--no-human`/`-no-gui`/`-no-human` → `--no-gui`. If `--no-gui` is present, set humanDoc=false and strip it. Otherwise resolve `disableGUIPlan` and `guiPlanFormat` by merging the global config `~/.coding-friend/config.json` with the local `CF_CONFIG_FILE` (default `.coding-friend/config.json`), where **local overrides global** (the documented config precedence — `cf config`/`cf init` can save either key at global scope, so a global-only setting must still take effect). If the merged `disableGUIPlan` is `true` → humanDoc=false, else humanDoc=true. **Fast mode never generates the overview**: if fast mode is active (`--fast`/`--quick`, or auto-detected fast in steps 3–4), force humanDoc=false regardless of the above — even `--fast --auto` (which does write a plan file) gets no overview. When humanDoc=true, use the merged `guiPlanFormat` (default `html`). The overview is only produced when a plan file is written (Step 6); `--inline` writes no file, so it produces none regardless.
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
4. When autopilot=true, the plan body MUST include a `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. Copy the AUTOPILOT CONTRACT block verbatim — see Plan Templates section below.

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
2. Generate the human overview doc (see **Human overview doc** below) unless humanDoc=false.
3. Present the plan summary to the user.
4. When autopilot=true, add `auto: true` to the YAML frontmatter at the top of `README.md`. For **big plans**, the `## AUTOPILOT` section is ALSO copied into EVERY `phase-N-*.md` file (so any phase file Claude re-opens during a long conversation carries the rules).

#### Human overview doc

When humanDoc=true AND a plan file was written, generate a concise human-readable overview next to `README.md`. (humanDoc is already false in fast mode and when `--no-gui`/`disableGUIPlan` apply; `--inline` writes no plan file at all — so none of those reach this step.):

- **Output**: `{plan-folder}/overview.html` when `guiPlanFormat` = `html` (default), or `{plan-folder}/overview.md` when `guiPlanFormat` = `md`.
- **Generator**: dispatch **cf-writer-deep** (`subagent_type: "coding-friend:cf-writer-deep"`). Give it: the just-written plan (the `README.md` + any `phase-N-*.md`), the matching template at `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.{html,md}`, and the output path. Instruct it to fill the template's `<!-- FILL: … -->` markers from the plan and replace the placeholder content. For HTML output, it must HTML-escape prose values it injects (so `<`, `&`, and generic types like `Foo<T>` render correctly). **Mermaid diagram labels derived from plan text must also be sanitized** — strip or escape `<`, `>`, `"`, `&` in node/edge labels and wrap labels in quotes. The `<div class="mermaid">` body is parsed by the browser as HTML *before* Mermaid runs, so an unsanitized label like `</div><img onerror=…>` would break out of the container and execute (Mermaid's `securityLevel` only sanitizes what Mermaid itself renders — too late to stop browser-level DOM injection).
- **Content rules**: SHORT and decision-focused — the original problem/intent, the solution big picture, the key decisions (one concise line each), and Mermaid diagrams for any structure/flow/state-machine/algorithm where a picture beats prose. Do NOT copy the step-by-step task list — that lives in the agent plan.
- **Point-in-time**: generated once here; NOT updated as the Progress table changes during implementation.
- **Skip** entirely when humanDoc=false — `--no-gui`/`--no-human`, `disableGUIPlan: true`, or **fast mode** (`--fast`/`--quick`/auto-detected fast, including `--fast --auto`) — or in `--inline` mode (no plan file at all).

### Step 7: Offer Implementation

Ask: **"Ready to start implementing?"** If yes, execute phase by phase. If user approves AND autopilot=true → enter the **Autopilot Per-Phase Loop** (see new section below). If autopilot=false → use the existing Sequential/Parallel phases protocols unchanged.

#### Resume Protocol (`--resume <path>`)

1. **Resolve the plan entry file**:
   - Full path to a folder → use `<folder>/README.md`. Full path to a file → use it directly. Validate the target is within the current working directory or `{docsDir}`; report error and stop if outside.
   - Name only (`<slug>`) → resolve in this order, using the first that exists: `{docsDir}/plans/<slug>/README.md` (current layout) → `{docsDir}/plans/<slug>.md` (legacy single-file) → `{docsDir}/plans/<slug>` (append `.md` if it is a bare file).
   - If none found → report error and stop.
2. Read the plan entry file at the resolved path.
3. Derive the task-id from the containing folder name (current layout: entry is `<slug>/README.md` → task-id = `<slug>`) or the filename stem (legacy single-file `<slug>.md`), or from a `task-id:` frontmatter field if present. The stem/folder name IS the task-id (e.g. `2026-05-03-my-plan` → task-id = `2026-05-03-my-plan`). Look up the context file at `{docsDir}/context/<task-id>.json`. If not found, strip the leading `YYYY-MM-DD-` prefix from the stem (the first 11 characters if the stem starts with a date pattern) to get the bare name, then glob `{docsDir}/context/*<bare-name>*.json` for backward compat with the old unix-timestamp format (e.g. `1717500000-my-plan.json`). Load the context file now, before dispatching any tasks.
4. Scan the Progress table. Classify each task:
   - `✅ DONE` → skip.
   - `🔄 IN PROGRESS` → Edit the file containing this task's row (`README.md` for **small plans**; the relevant phase file `phase-N-<name>.md` for **big plans**): reset to `⬜ TODO`, treat as pending. (Session ended mid-task; completion status is unreliable.)
   - `❌ FAILED` → ask user: "Task N previously failed. Re-run it? (y/n)"
   - `⬜ TODO` → pending, run as normal.
5. If ALL tasks are `✅ DONE` → inform user: "Plan is already complete. Nothing to resume." Stop.
6. Show user: list of pending tasks and estimated phases remaining. Ask: "Resume from the first pending task? (y/n)"
7. If confirmed → execute pending tasks using the same Sequential phases protocol below, passing the context file loaded in step 3 to each cf-implementer dispatch.
   - **Autopilot gating** — Before honoring `auto: true` in frontmatter, verify the plan body (`README.md` for small plans; README.md and every phase file for big plans) actually contains a `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. If the section is missing in any file that should have it, do NOT autopilot — warn the user: `> ⚠️ Plan has \`auto: true\` in frontmatter but the \`## AUTOPILOT\` section is missing in <path>. Refusing to autopilot. Re-run \`/cf-plan --auto\` to regenerate the section, or remove \`auto: true\` to resume normally.` Stop.
   - Otherwise (frontmatter has `auto: true` AND section is present): the remaining phases run under the Autopilot Per-Phase Loop instead of the standard protocol. Announce to user when resuming: `> 🤖 This plan has \`auto: true\` — continuing in autopilot mode.`

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
- **Autopilot override** — when the plan has `auto: true`, the README phase-row flip to ✅ DONE is DEFERRED until the Autopilot Per-Phase Loop's Step 6 (after `/cf-review` clean + commit success). Do NOT flip the README row to ✅ DONE at last-task-DONE checkpoint time under autopilot — that would mislabel a phase as DONE while review may still fail. If autopilot subsequently stops at review or commit failure, the README row remains in `🔄 IN PROGRESS` and gets flipped to `❌ FAILED` by the stop-handling code paths.

**Rule**: Only the cf-plan orchestrator edits plan files (`README.md` for small plans; the README and phase files for big plans). cf-implementer must NOT modify any plan file.

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

#### Autopilot Per-Phase Loop (`--auto` only)

When the plan was created with `--auto` (or has `auto: true` in frontmatter), each phase runs through this loop. The orchestrator MUST follow this exactly and MUST NOT ask the user for confirmation between phases.

1. **Dispatch tasks** — Run all tasks in the current phase using the standard Sequential or Parallel phases protocol above. Apply normal task retry (max 1 retry per task). If any task ends ❌ FAILED after retry → STOP autopilot, mark phase ❌ FAILED in plan file, surface failure to user, ask "Continue from next phase, retry this phase, or stop?". Do NOT silently skip.

2. **Run review** — Once all tasks in the phase reach ✅ DONE, invoke the cf-review skill on uncommitted changes (Skill tool, `coding-friend:cf-review`, no extra args). The uncommitted diff is this phase's work (prior phases are already committed). (If `review.withCodex: true` is set in the config, cf-review automatically adds a Codex second-opinion review and merges both — no flag needed here.)

3. **Parse findings** — cf-review returns bullets under 4 emoji headers. Treat each:
   - 🚨 **Critical** → must fix
   - ⚠️ **Important** → must fix
   - 💡 **Suggestions** → log only, do NOT block
   - 📋 **Summary** → informational
     If you cannot reliably parse the review output (unexpected format), STOP autopilot and surface to user — do NOT default to "looks clean".

4. **Fix loop (max 1 fix round = 2 reviews total)** — If Critical or Important findings exist:
   - Dispatch ONE cf-implementer call with task: "Fix these review findings: <verbatim Critical + Important bullets>". Files: union of files referenced by the findings.
   - **Fix-task failure path** — If the fix cf-implementer returns `[CF-RESULT: failure]`, STOP autopilot immediately. Do NOT consume the second review round. Mark phase ❌ FAILED (revert README phase row from ✅ DONE → ❌ FAILED for big plans if already flipped). Surface the failure to user.
   - Otherwise, re-run `/cf-review` (round 2).
   - If round 2 still has Critical or Important → STOP autopilot, mark phase ❌ FAILED (revert README phase row for big plans), surface BOTH review outputs and the fix attempt, ask user.
   - Hard cap: never more than 2 reviews per phase. Never more than 1 fix attempt per phase.

5. **Commit the phase** — On clean review (or only Suggestions remaining):
   - `git add -A`
   - Generate a conventional commit message: `<type>(<scope>): <phase-name>` where `<type>` matches the dominant change (feat/fix/refactor/docs/chore/test), `<scope>` is inferred from the directory of changed files, and `<phase-name>` is the phase title.
   - Commit body: bulleted list of completed tasks + any Suggestion-level findings logged as follow-ups.
   - `git commit -m "$(cat <<'EOF'
<message>
EOF
)"`
   - NEVER use `--no-verify`. NEVER include AI/Claude co-author lines (project rule #6).
   - If `git commit` fails (pre-commit hook), do NOT amend — fix the issue, re-stage, create a NEW commit. If repeated failure → STOP and surface to user.

6. **Advance** — Now that commit succeeded, finalize plan bookkeeping. For small plans: per-task ✅ DONE flips already happened at task-checkpoint time; nothing extra here. For **big plans under autopilot**: flip the phase row in `README.md` to ✅ DONE in THIS step (after commit succeeded), NOT at the last-task-DONE checkpoint — see the "Autopilot override" added to Big plan phase sync below. Then IMMEDIATELY proceed to the next phase. Do NOT ask "Continue? (y/n)". Do NOT prompt for anything.

**Stop conditions (only these end autopilot)**:

- Task fails after its 1 retry.
- Review round 2 still has Critical or Important findings.
- Review output cannot be parsed.
- `git commit` fails repeatedly after fix attempts.
- User explicitly interrupts.
- All phases reach ✅ DONE in plan file.

**Drift guard**: if Claude finds itself about to ask the user "should I commit?" or "should I continue to the next phase?" while running an autopilot plan, that is a drift bug. Re-read the `## AUTOPILOT` section in the plan file and proceed per the contract.

#### Post-implementation

1. **Hard mode**: run `/cf-review` after every phase; only continue if review passes.
2. After all phases, automatically invoke `/cf-review` (Skill tool, `coding-friend:cf-review`) (the per-phase reviews under autopilot already covered the changes; this final review is optional in autopilot mode but harmless).
3. If plan involved performance-critical features, suggest `/cf-optimize` as optional next step — do NOT auto-run.

## Plan Templates

### AUTOPILOT CONTRACT block

Only when `--auto`. Copy this entire block **verbatim** into each generated plan file that needs it — see Step 5 / Step 6 for which files (small plan: `README.md`; big plan: `README.md` AND every `phase-N-*.md`). The templates below mark its position with a placeholder; replace that placeholder with this exact text. Omit the whole section when `auto: false`.

```markdown
## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

This plan was created with `--auto`. When resuming or continuing this plan, follow this contract exactly. Do NOT ask the user for confirmation between phases.

**Per-phase loop:**

1. Dispatch all tasks in the current phase using the standard cf-implementer protocol (sequential or parallel as marked). Apply normal retry rules. If a task ends ❌ FAILED after retry → STOP autopilot, mark the failing task ❌ FAILED in the plan file (and revert the phase row in `README.md` from ✅ DONE to ❌ FAILED for big plans if it was already flipped), report to user.
2. After all tasks in the phase reach ✅ DONE, run `/cf-review` on the uncommitted changes (no extra arguments — reviews everything that has not been committed yet, which is this phase's work).
3. Parse review findings:
   - 🚨 **Critical** and ⚠️ **Important** → must be fixed.
   - 💡 **Suggestions** → log them in the upcoming commit body, do NOT block.
4. If Critical/Important findings exist:
   - Dispatch one cf-implementer call with a fix task that lists the findings verbatim. Files: union of files referenced by the findings.
   - If the fix cf-implementer returns `[CF-RESULT: failure]`, STOP autopilot immediately (do NOT consume the second review round). Mark the phase ❌ FAILED (and revert the README phase row from ✅ DONE to ❌ FAILED if applicable). Surface the failure to user.
   - Otherwise, re-run `/cf-review`.
   - If Critical/Important still present after this 2nd review → STOP autopilot, mark phase ❌ FAILED (and revert the README phase row if applicable), report both review outputs to user.
   - Maximum 2 review rounds per phase total (initial + 1 fix attempt).
5. Once review is clean (no Critical/Important):
   - `git add -A`
   - `git commit -m "<type>(<scope>): <phase-name>` (conventional commit). Body lists tasks completed + any Suggestion-level findings that were intentionally left as follow-ups.
   - NEVER use `--no-verify`. NEVER include AI/Claude co-author lines (project rule #6).
6. Immediately proceed to the next phase. Do NOT ask "Continue? (y/n)". The user already authorized autopilot at plan approval.

**Stop conditions (only these):**

- Task fails after its 1 retry.
- The fix cf-implementer returns `[CF-RESULT: failure]` (do not consume the second review round).
- Review round 2 still has Critical or Important findings.
- Review output from `/cf-review` cannot be reliably parsed.
- `git commit` fails repeatedly after attempted hook fixes.
- User explicitly interrupts (Ctrl+C, message).
- Plan file shows all phases ✅ DONE.

**Drift guard:** if Claude finds itself about to ask the user "should I commit?" or "should I continue to the next phase?" while running an `auto: true` plan, that is a drift bug. Re-read this section and proceed.
```

### Small plan (1 phase — written as `README.md` inside the plan folder)

```markdown
---
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
