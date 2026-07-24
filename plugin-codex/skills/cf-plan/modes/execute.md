# Execution protocol (shared by cf-plan Step 7 and cf-plan-resume)

Execute the plan phase by phase using the protocols below. Both `$cf-plan` (after the user approves at Step 7) and `$cf-plan-resume` (after the user confirms resuming) read this file.

> **No-file mode guard** — if no plan file was written (cf-plan `--inline`, or single-phase `--fast` without `--auto`), there is no `README.md`/phase file to edit: replace every "Edit the plan file / Progress table" checkpoint below with a `TaskUpdate` on the matching task. `$cf-plan-resume` always has a plan file, so this never applies when resuming.

**Progress checkpoint rule (MANDATORY — autopilot does NOT skip this):** Every task MUST pass through `🔄 IN PROGRESS` before `✅ DONE`. Apply each icon flip as its **own** Edit tool call **before** dispatching cf-implementer and **immediately after** each result — never batch flips, never jump `⬜ TODO` → `✅ DONE` directly. This applies under `--auto`/autopilot the same as manual execution; the `## AUTOPILOT` section in the plan file does not override it.

#### Sequential phases

Dispatch **cf-implementer** (`cf-implementer` custom agent) per task:

> Task: [description] | Context file: [path] | Context: [overall plan] | Files: [list] | Verify: [criteria] | Test patterns: [framework, locations — only if --add-tests] | Constraints: [risks/edge cases]
> If `--add-tests` was passed to `$cf-plan`, include `--add-tests` in this prompt. Otherwise implement directly without writing new tests.

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
- **Plan done (frontmatter `status:`)** — This flip sets the machine-readable `status:` frontmatter field that `cf clean` reads to decide which completed plans are sweepable, so set it at **true terminal completion only**.
  - **Big plan** — when all phase rows in `README.md` are `✅ DONE`, set the frontmatter `status:` field to `done` AND update the body `**Status:**` field to `✅ DONE`. If any row is `❌ FAILED`, set frontmatter `status: failed` and body `**Status:** ❌ FAILED` instead.
  - **Small plan** (single phase, no phase rows and no body `**Status:**` line) — when all Progress **task** rows in `README.md` are `✅ DONE`, set frontmatter `status: done`. If any task row is `❌ FAILED`, set frontmatter `status: failed` instead.
  - **Under autopilot** this flip is DEFERRED exactly like the README phase-row flip (see the Autopilot override below and autopilot.md Step 6): set `status: done` only once the final phase is committed, never at last-task-DONE checkpoint time.
- **Parallel phases** — when multiple cf-implementer dispatches in a parallel phase return near-simultaneously, **serialize** the Edit calls: apply one Edit, wait for it to succeed, then apply the next. Concurrent edits to the same Markdown table will lose updates.
- **Autopilot override** — when the plan has `auto: true`, the README phase-row flip to ✅ DONE is DEFERRED until Step 6 of the Per-Phase Loop in `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` (after `$cf-review` clean + commit success). Do NOT flip the README row to ✅ DONE at last-task-DONE checkpoint time under autopilot — that would mislabel a phase as DONE while review may still fail. If autopilot subsequently stops at review or commit failure, the README row remains in `🔄 IN PROGRESS` and gets flipped to `❌ FAILED` by the stop-handling code paths.

**Rule**: Only the cf-plan / cf-plan-resume orchestrator edits plan files (`README.md` for small plans; the README and phase files for big plans). cf-implementer must NOT modify any plan file.

**Cleanup**: Delete the context file ONLY after all phases are `✅ DONE`. On session interrupt, quota limit, or user Ctrl+C — keep the context file so `$cf-plan-resume` can read it later.

**Capturing out-of-scope side-effects:** If, while executing a phase, an unrelated problem surfaces that is non-trivial (fixing it would expand beyond the approved plan), do NOT fix it now and do NOT silently grow scope. Record it for later, then continue the plan:

```bash
bash "${PLUGIN_ROOT}/lib/capture-later.sh" \
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

1. **Checkpoint before dispatch** — For each task, edit the Progress table: `⬜ TODO` → `🔄 IN PROGRESS` (one Edit per task). **Big plan only** — if this is the first task of the phase to leave `⬜ TODO`, also edit `README.md` and flip that phase's row to `🔄 IN PROGRESS`.
2. Spawn one cf-implementer **per task** with `run_in_background: true` — all in a **single message block**.
3. Each agent prompt must be fully self-contained.
4. As each agent returns, edit the Progress table: `🔄 IN PROGRESS` → `✅ DONE` on `[CF-RESULT: success]`, or follow the retry protocol on failure. Serialize concurrent edits to the same table.
5. All passed → proceed to next phase automatically. Any failed → warn, show details, ask: **"Proceed? (y/n)"** (autopilot: STOP per stop conditions in `autopilot.md`).

#### Phase execution order

Phase 1 → Phase 2 → … A phase must complete before the next starts.

→ When autopilot=true, Read `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now — it holds the Per-Phase Loop and the AUTOPILOT CONTRACT block.

#### Post-implementation

1. **Hard mode**: run `$cf-review` after every phase; only continue if review passes.
2. After all phases, automatically invoke `$cf-review` (load `$cf-review`) (the per-phase reviews under autopilot already covered the changes; this final review is optional in autopilot mode but harmless).
3. If plan involved performance-critical features, suggest `$cf-optimize` as optional next step — do NOT auto-run.
4. **Offer to remove the plan doc** — once every phase is `✅ DONE`, if a plan file was written (i.e. a `{docsDir}/plans/<slug>/` folder exists — skip this for inline/single-phase-fast runs that have no plan doc), ask the user: `> 🗑️ Plan is complete. Remove the plan doc \`{docsDir}/plans/<slug>/\`? (y/n)`. On **y**, delete the whole plan folder (`README.md`, any `phase-N-*.md`, and `overview.*`). On **n** or no answer, leave it in place. Ask this even under autopilot — it is the terminal step, not a between-phase gate, so it does not violate the no-prompt-between-phases contract.
