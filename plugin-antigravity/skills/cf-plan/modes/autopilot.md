# Autopilot mode (`--auto`)

#### Autopilot Per-Phase Loop (`--auto` only)

When the plan was created with `--auto` (or has `auto: true` in frontmatter), each phase runs through this loop. The orchestrator MUST follow it exactly and MUST NOT ask the user for confirmation between phases.

1. **Dispatch tasks** — Run all tasks in the phase with the Sequential or Parallel phases protocol in `<plugin-root>/skills/cf-plan/modes/execute.md` (Read it now if you have not already), including its **Progress checkpoint rule** on every task (`⬜ TODO` → `🔄 IN PROGRESS` → `✅ DONE`; never skip `🔄 IN PROGRESS`) and normal retry (max 1 per task). A task ends ❌ FAILED after retry → STOP autopilot, mark the phase ❌ FAILED in the plan file, surface the failure, ask "Continue from next phase, retry this phase, or stop?". Do NOT silently skip.
   - **Commit-per-task mode** (`commitPerTask: true` in plan frontmatter; absent/false → skip this bullet) — **phaseBase**: phase has no ✅ DONE task yet (incl. ❌ FAILED / 🔄 IN PROGRESS with nothing committed) → record fresh `phaseBase=$(git rev-parse HEAD)` before its first task AND write `phaseBase: <sha>` to the README frontmatter (orchestrator edit; rides along in the first task commit). Phase already has a ✅ DONE task → reuse frontmatter `phaseBase`; missing → STOP autopilot and ask the user for the phase's base commit (never guess). `[parallel]` phases run their tasks **sequentially** here (a per-task `git add -A` would sweep in a sibling task's files), so the file-overlap guard is unnecessary. After each task's `🔄 IN PROGRESS` → `✅ DONE` flip (flip first so it rides along): `git add -A`, then commit `<type>(<scope>): phase <N>/<M> task <i>/<K> <task-title>` — `<i>` = 1-based task position in this phase, `<K>` = task count in this phase. Example: `feat(ui): phase 3/4 task 1/5 add toggle`. Commit rules: step 5 (task titles may contain backticks — use its quoted-heredoc form). Body optional and short.

2. **Run review** — Once all tasks in the phase reach ✅ DONE, Load `/cf-review` (no extra args). The uncommitted diff is this phase's work (prior phases are already committed). (On Google Antigravity, cf-review uses the native Coding Friend multi-agent review and ignores the Claude-only `review.withCodex` setting.) Count this as review round 1.
   - **Commit-per-task mode** — the work is already committed, so run `/cf-review <phaseBase>..HEAD` (the phase's commit range) instead. Never pass `--fix`/`--commit` with a range. External reviewers (`review.with*`, e.g. `review.withCodex`) do NOT run on a range target — only the native review covers the phase.

3. **Read the review status, then parse findings** — cf-review returns bullets under 4 emoji headers plus one status line in 📋 Summary.

   **Status gate — run this before you count anything.** Find the single `Review status:` line in the 📋 Summary and match it against `^Review status: (COMPLETE|PARTIAL|FAILED)( — .*)?$`:
   - `COMPLETE` → the required coverage happened; continue to the severity count below.
   - `PARTIAL` or `FAILED` → the review did not cover this phase. STOP autopilot before the commit step: mark the phase ❌ FAILED in the plan file (revert the README phase row for big plans if already flipped), surface the status line and the coverage it names as missing, ask the user. Do NOT commit and do NOT auto-re-run the review.
   - Line missing, present more than once, or holding any other value (unparseable) — or the review output itself cannot be reliably parsed → STOP autopilot exactly the same way.
   - **Never infer a clean review from an absence of findings.** Zero 🚨/⚠️ findings only means clean when the status line says `COMPLETE`.

   Only on `COMPLETE`, count the findings:
   - 🚨 **Critical** → must fix
   - ⚠️ **Important** → must fix
   - 💡 **Suggestions** → log only, do NOT block
   - 📋 **Summary** → coverage, uncovered scope, and the status line you just read

4. **Fix loop** — If Critical or Important findings exist:
   - Read `review.maxRounds` from merged config: `~/.coding-friend/config.json` + `CF_CONFIG_FILE` (default `.coding-friend/config.json`); **local field overrides global**. Absent, non-integer, or `< 1` → **5**. This is the maximum number of `/cf-review` runs per phase (the initial review in step 2 counts as round 1).
   - Repeat while Critical/Important remain **and** review rounds used `< maxRounds`:
     - Dispatch ONE cf-implementer call with task: "Fix these review findings: <verbatim Critical + Important bullets from the latest review>". Files: union of files referenced by those findings.
     - **Fix-task failure path** — fix cf-implementer returns `[CF-RESULT: failure]` → STOP autopilot immediately, without consuming another review round. Mark phase ❌ FAILED (big plans: revert README phase row ✅ DONE → ❌ FAILED if already flipped). Surface the failure to user.
     - Otherwise, re-run `/cf-review` (next round).
       - **Commit-per-task mode** — first, if `git status --porcelain` is non-empty, `git add -A` and commit `<type>(<scope>): phase <N>/<M> review fixes` (commit rules: step 5). Then re-review the same range: `/cf-review <phaseBase>..HEAD`.
     - Apply the status gate to that review too, before counting: `PARTIAL`, `FAILED`, missing, or unparseable → STOP autopilot (no commit).
     - Passed the gate with `Review status: COMPLETE` and no Critical/Important left (Suggestions may remain) → exit the fix loop and continue to commit.
   - Critical or Important still remain after `maxRounds` reviews → STOP autopilot, mark phase ❌ FAILED (revert README phase row for big plans), surface ALL review outputs and fix attempts, ask user.
   - Hard cap: never more than `maxRounds` reviews per phase. Do not start a fix after the last allowed review — that review is the gate.

5. **Commit the phase** — Only after a review passed the status gate (`Review status: COMPLETE`) with no Critical/Important remaining (Suggestions may remain):
   - `git add -A`
   - Message: `<type>(<scope>): phase <N>/<M> <phase-name>` — `<type>` = dominant change (feat/fix/refactor/docs/chore/test), `<scope>` = inferred from the changed files' directory, `<N>` = this phase's number, `<M>` = total phase count (small plan → `1/1`), `<phase-name>` = phase title. Example: `feat(cli): phase 2/4 add config loader`. Never omit the `phase N/M` marker — it ties each commit to its plan phase.
   - Commit body: bulleted list of completed tasks + any Suggestion-level findings logged as follow-ups.
   - `git commit -m "$(cat <<'EOF'
<message>
EOF
)"`
   - **Commit rules** (every commit in this loop — task, review-fix, bookkeeping, phase): NEVER use `--no-verify`. NEVER include AI/Claude co-author lines (project rule #6). `git commit` fails (pre-commit hook) → do NOT amend — fix, re-stage, create a NEW commit; repeated failure → STOP and surface to user.
   - **Commit-per-task mode** — No phase commit (tasks and review fixes are already committed). First apply step 6's plan bookkeeping flips (big-plan README phase row ✅ DONE; final phase → `status: done`) so they land here. Then, if the working tree still has changes (e.g. plan-file edits), `git add -A` and commit `chore(plan): phase <N>/<M> bookkeeping`; otherwise commit nothing.

6. **Advance** — Now that the commit succeeded, finalize plan bookkeeping (commit-per-task mode: already done in step 5 — skip to the next phase). Small plans: per-task ✅ DONE flips already happened at checkpoint time; nothing extra. **Big plans**: flip the phase row in `README.md` to ✅ DONE in THIS step, NOT at the last-task-DONE checkpoint (see "Autopilot override" in `<plugin-root>/skills/cf-plan/modes/execute.md`). **Final phase** (all task/phase rows now ✅ DONE) → also apply execute.md's "Plan done (frontmatter `status:`)" flip: `status: done` (and body `**Status:** ✅ DONE` for big plans). Then IMMEDIATELY proceed to the next phase. Do NOT ask "Continue? (y/n)". Do NOT prompt for anything.

**Stop conditions (only these end autopilot)**:

- Task fails after its 1 retry.
- The fix cf-implementer returns `[CF-RESULT: failure]`.
- Review still has Critical or Important after `review.maxRounds` reviews (default 5).
- `Review status:` is `PARTIAL` or `FAILED`, or that line is missing or unparseable — incomplete coverage never commits.
- Review output cannot be parsed.
- `git commit` (task, review-fix, bookkeeping, or phase commit) fails repeatedly after fix attempts.
- User explicitly interrupts.
- All phases reach ✅ DONE in plan file.

**Drift guard**: about to ask the user "should I commit?" or "should I continue to the next phase?" while running an autopilot plan → that is a drift bug. Re-read the `## AUTOPILOT` section in the plan file and proceed per the contract.

### AUTOPILOT CONTRACT block

Only when `--auto`. Copy this entire block **verbatim** into `README.md` only (small and big plans), replacing the template placeholder. Big-plan `phase-N-*.md` files get the short pointer from the phase template instead — never a second copy of this block. Omit the whole section when `auto: false`.

```markdown
## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

This plan was created with `--auto`. When resuming or continuing this plan, follow this contract exactly. Do NOT ask the user for confirmation between phases.

**Per-phase loop:**

1. Dispatch all tasks in the current phase using the standard cf-implementer protocol (sequential or parallel as marked). **Progress checkpoints are mandatory:** before each dispatch flip the task `⬜ TODO` → `🔄 IN PROGRESS`; on `[CF-RESULT: success]` flip `🔄 IN PROGRESS` → `✅ DONE` — never skip `🔄 IN PROGRESS`, even under autopilot. Apply normal retry rules. A task ends ❌ FAILED after retry → STOP autopilot, mark it ❌ FAILED in the plan file (big plans: revert the `README.md` phase row from ✅ DONE to ❌ FAILED if already flipped), report to user.
   - **Commit-per-task mode** (only when frontmatter has `commitPerTask: true`): phase has no ✅ DONE task yet → record fresh `phaseBase=$(git rev-parse HEAD)` before its first task and write `phaseBase: <sha>` to the README frontmatter (rides along in the first task commit); phase already has a ✅ DONE task → reuse frontmatter `phaseBase` (missing → STOP and ask the user for the phase's base commit; never guess). Run `[parallel]` phases sequentially. After each task's `🔄 IN PROGRESS` → `✅ DONE` flip, `git add -A` and commit `<type>(<scope>): phase <N>/<M> task <i>/<K> <task-title>` (`<i>` = task position in this phase, `<K>` = task count in this phase, e.g. `feat(ui): phase 3/4 task 1/5 add toggle`), using the quoted-heredoc form `git commit -m "$(cat <<'EOF' ... EOF)"` (titles may contain backticks). Commit rules: step 5.
2. After all tasks in the phase reach ✅ DONE, run `/cf-review` with no extra arguments — it reviews everything not yet committed, which is this phase's work. This is review round 1.
   - **Commit-per-task mode:** run `/cf-review <phaseBase>..HEAD` instead (never with `--fix`/`--commit`). External reviewers (`review.with*`) do not run on a range target.
3. Read the review status **before** counting findings. Find the single `Review status:` line in the 📋 Summary:
   - `PARTIAL`, `FAILED`, missing, or unparseable → STOP autopilot, mark the phase ❌ FAILED (and revert the README phase row if applicable), report the coverage the status line names as missing. Do NOT commit. Never infer a clean review from an absence of findings — zero findings only counts when the status says `COMPLETE`.
   - `Review status: COMPLETE` → parse review findings:
     - 🚨 **Critical** and ⚠️ **Important** → must be fixed.
     - 💡 **Suggestions** → log them in the upcoming commit body, do NOT block.
4. If Critical/Important findings exist:
   - Read `review.maxRounds` from config (local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json` at the field; default **5**) — the maximum `/cf-review` runs per phase (initial + fix re-reviews).
   - Repeat while Critical/Important remain and review rounds used < `maxRounds`:
     - Dispatch one cf-implementer call with a fix task that lists the latest findings verbatim. Files: union of files referenced by the findings.
     - Fix cf-implementer returns `[CF-RESULT: failure]` → STOP autopilot immediately (do NOT consume another review round), mark the phase ❌ FAILED (and revert the README phase row if applicable), surface the failure to user.
     - Otherwise, re-run `/cf-review`.
       - **Commit-per-task mode:** first, if `git status --porcelain` is non-empty, `git add -A` and commit `<type>(<scope>): phase <N>/<M> review fixes`; then re-review `/cf-review <phaseBase>..HEAD`.
     - Apply the same status gate to that review; `PARTIAL`, `FAILED`, missing, or unparseable → STOP autopilot without committing.
     - `Review status: COMPLETE` with no Critical/Important → continue to commit.
   - Critical/Important still present after `maxRounds` reviews → STOP autopilot, mark phase ❌ FAILED (and revert the README phase row if applicable), report all review outputs to user.
   - Never exceed `review.maxRounds` reviews per phase. Do not start a fix after the last allowed review.
5. Once a review passed the status gate (`Review status: COMPLETE`) and has no Critical/Important:
   - `git add -A`
   - `git commit -m "<type>(<scope>): phase <N>/<M> <phase-name>"` (conventional commit; `<N>` = this phase's number, `<M>` = total phases, e.g. `feat(cli): phase 2/4 add config loader`). Body lists tasks completed + any Suggestion-level findings intentionally left as follow-ups.
   - Commit rules (every commit): NEVER use `--no-verify`. NEVER include AI/Claude co-author lines (project rule #6). On hook failure fix, re-stage, NEW commit (never amend).
   - **Commit-per-task mode:** no phase commit. First do the plan bookkeeping flips (big-plan README phase row ✅ DONE; final phase → `status: done`) so they land here. Then, if the working tree still has changes (e.g. plan-file edits), `git add -A` and commit `chore(plan): phase <N>/<M> bookkeeping`; otherwise nothing.
6. Immediately proceed to the next phase. Do NOT ask "Continue? (y/n)". The user already authorized autopilot at plan approval.

**Stop conditions (only these):**

- Task fails after its 1 retry.
- The fix cf-implementer returns `[CF-RESULT: failure]` (do not consume another review round).
- Review still has Critical or Important after `review.maxRounds` reviews (default 5).
- `/cf-review` reports `Review status:` `PARTIAL` or `FAILED`, or that line is missing, duplicated, or unparseable.
- Review output from `/cf-review` cannot be reliably parsed.
- `git commit` (task, review-fix, bookkeeping, or phase commit) fails repeatedly after attempted hook fixes.
- User explicitly interrupts (Ctrl+C, message).
- Plan file shows all phases ✅ DONE.

**Drift guard:** about to ask the user "should I commit?" or "should I continue to the next phase?" while running an `auto: true` plan → that is a drift bug. Re-read this section and proceed.
```
