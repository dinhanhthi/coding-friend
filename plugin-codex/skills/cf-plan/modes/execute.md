# Execution protocol (shared by cf-plan Step 7 and cf-plan-resume)

Execute the plan phase by phase. Read by `$cf-plan` (after approval at Step 7) and `$cf-plan-resume` (after the user confirms resuming).

> **No-file mode guard** — no plan file was written (cf-plan `--inline`, or single-phase `--fast` without `--auto`) → replace every plan-file / Progress-table edit below with an update to the matching progress item (Track progress). Never applies to `$cf-plan-resume` (it always has a plan file).

**Progress checkpoint rule (MANDATORY — autopilot does NOT skip this):** every task goes `⬜ TODO` → `🔄 IN PROGRESS` (before dispatching cf-implementer) → `✅ DONE` | `❌ FAILED` (right after its result). Each flip is its **own** file edit in the file holding the task's row — `README.md` for small plans, the phase file (`phase-N-<name>.md`) for big plans. Never batch flips, never jump `⬜ TODO` → `✅ DONE`. The `## AUTOPILOT` section does not override this. Big plans also sync the README phase row (see "Big plan phase sync").

#### Sequential phases

Dispatch `cf-implementer` per task:

> Task: [description] | Context file: [path] | Context: [overall plan] | Files: [list] | Verify: [criteria] | Test patterns: [framework, locations — only if --add-tests] | Constraints: [risks/edge cases]
> If `--add-tests` was passed to `$cf-plan`, include `--add-tests` in this prompt. Otherwise implement directly without writing new tests.

**Checkpoint before dispatch**: flip the task to `🔄 IN PROGRESS`.

Parse the **last non-empty line** for the result signal — strict regex `^\[CF-RESULT: (success|failure)( .*)?\]$`:

- `[CF-RESULT: success]` → flip to `✅ DONE`, advance to the next task.
- `[CF-RESULT: failure] <reason>` → retry once
- Missing/malformed/not-on-last-line → treat as failure (`empty-output`). Never assume silent success.

**Retry protocol** (max 1 per task):

1. Notify: `> ⟳ Task N attempt 1 failed (<reason>). Retrying...`
2. Add `previous_failure` key to context file (reason, error summary, attempt number).
3. Re-dispatch cf-implementer.
4. Second failure → flip to `❌ FAILED` (big plan: README phase row too). Report both failures, ask: "Continue to next task or stop?"

**Big plan phase sync** — each flip is its own file edit, applied **immediately**, never batched at the end:

- **Phase start** — first task of a phase flips to `🔄 IN PROGRESS` → flip the phase's README row to `🔄 IN PROGRESS`.
- **Task done** — after each `✅ DONE`, if ALL tasks in the phase file are `✅ DONE` → flip the phase's README row to `✅ DONE`.
- **Phase failed** — any task in the phase file becomes `❌ FAILED` (after retry) → flip the phase's README row to `❌ FAILED` (overrides `🔄 IN PROGRESS`).
- **Plan done (frontmatter `status:`)** — `cf clean` reads `status:` to decide which plans are sweepable, so set it at **true terminal completion only**.
  - **Big plan** — all README phase rows `✅ DONE` → frontmatter `status: done` AND body `**Status:** ✅ DONE`. Any row `❌ FAILED` → `status: failed` and `**Status:** ❌ FAILED`.
  - **Small plan** (single phase, no phase rows, no body `**Status:**` line) — all Progress task rows `✅ DONE` → `status: done`. Any task row `❌ FAILED` → `status: failed`.
- **Parallel phases** — results returning near-simultaneously → **serialize** the edits (apply one, wait for success, then the next). Concurrent edits to the same Markdown table lose updates.
- **Autopilot override** — with `auto: true`, the README phase-row flip to ✅ DONE and the `status: done` flip are DEFERRED to Step 6 of the Per-Phase Loop in `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` (after `$cf-review` clean + commit success), never at last-task-DONE time — review may still fail. If autopilot then stops at review or commit, the row stays `🔄 IN PROGRESS` until the stop path flips it to `❌ FAILED`.

**Rule**: Only the cf-plan / cf-plan-resume orchestrator and the `$cf-plan-review` apply-findings step edit plan files (`README.md`, phase files, `brief.md`, `review.md`). cf-implementer must NOT modify any plan file.

**Cleanup**: Delete the context file ONLY after all phases are `✅ DONE`. On session interrupt, quota limit, or user Ctrl+C — keep it so `$cf-plan-resume` can read it later. Do NOT Follow `${PLUGIN_ROOT}/lib/protocols/implementer-result.md` here (resume needs the context file).

> **No-file mode exception (`--inline` / single-phase `--fast`)** — nothing can resume these, so delete the context file when the run ends **for any reason** — completion, failure, or user cancel — mirroring cf-fix/cf-tdd.

**Capturing out-of-scope side-effects:** an unrelated, non-trivial problem surfaces mid-phase (fixing it would expand beyond the approved plan) → do NOT fix it now and do NOT silently grow scope. Record it, then continue the plan:

```bash
bash "${PLUGIN_ROOT}/lib/capture-later.sh" \
  --name "<short title>" --description "<what & where — enough to act on cold>" \
  --source cf-plan --slug <this plan's slug> [--problem "<the phase/task in progress>"]
```

This writes `<docsDir>/later/YYYY-MM-DD-<name>.md` with frontmatter (slug, problem, conversation_id) — an in-repo audit trail, independent of the `spawn_task` tool.

#### Parallel phases

**File-overlap guard** (MANDATORY before spawning):

1. Collect declared file lists from each task's `files:` field.
2. Normalize all paths (absolute, no trailing slashes).
3. If any path appears in 2+ tasks → STOP. Report duplicates and tasks involved.
4. Ask: _"Phase N has a file-overlap conflict. (a) Convert to sequential, (b) reorganize so files don't overlap, or (c) abort?"_
5. Only proceed after user resolves. Do NOT auto-serialize.

After overlap check passes:

1. **Checkpoint before dispatch** — flip every task to `🔄 IN PROGRESS` (one file edit per task).
2. Dispatch `cf-implementer` once per task, all in one message; wait for all results.
3. Each agent prompt must be fully self-contained.
4. As each agent returns: `[CF-RESULT: success]` → flip to `✅ DONE`; failure → retry protocol. Serialize concurrent edits to the same table.
5. All passed → proceed to next phase automatically. Any failed → warn, show details, ask: **"Proceed? (y/n)"** (autopilot: STOP per stop conditions in `autopilot.md`).

#### Phase execution order

Phase 1 → Phase 2 → … A phase must complete before the next starts.

→ When autopilot=true, Read `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now — it holds the Per-Phase Loop and the AUTOPILOT CONTRACT block.

#### Post-implementation

1. **Hard mode**: run `$cf-review` after every phase; only continue if review passes. **A review passes only when its 📋 Summary carries `Review status: COMPLETE`** and no 🚨 Critical / ⚠️ Important findings remain — read that line before you count findings. `PARTIAL`, `FAILED`, a missing line, or an unparseable one → STOP, report the coverage it names as missing, and do not commit; never infer a clean review from an absence of findings (autopilot: STOP per the stop conditions in `autopilot.md`).
2. After all phases, Load `$cf-review` (optional under autopilot — per-phase reviews already covered the changes — but harmless).
3. If plan involved performance-critical features, suggest `$cf-optimize` as optional next step — do NOT auto-run.
4. **Offer to remove the plan doc** — once every phase is `✅ DONE` and a `{docsDir}/plans/<slug>/` folder exists (skip for inline/single-phase-fast runs), ask: `> 🗑️ Plan is complete. Remove the plan doc \`{docsDir}/plans/<slug>/\`? (y/n)`. **y** → delete the whole plan folder (`README.md`, any `phase-N-_.md`, `brief.md`, `review.md`, and `overview._`). **n** or no answer → leave it. Ask even under autopilot — it is the terminal step, not a between-phase gate.
