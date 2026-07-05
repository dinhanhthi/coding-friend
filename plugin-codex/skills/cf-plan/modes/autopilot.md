# Autopilot mode (`--auto`)

#### Autopilot Per-Phase Loop (`--auto` only)

When the plan was created with `--auto` (or has `auto: true` in frontmatter), each phase runs through this loop. The orchestrator MUST follow this exactly and MUST NOT ask the user for confirmation between phases.

1. **Dispatch tasks** — Run all tasks in the current phase using the standard Sequential or Parallel phases protocol in `${PLUGIN_ROOT}/skills/cf-plan/modes/execute.md` (Read it now if you have not already). **Apply the Progress checkpoint rule on every task** (`⬜ TODO` → `🔄 IN PROGRESS` before dispatch; `🔄 IN PROGRESS` → `✅ DONE` on success) — autopilot does NOT skip `🔄 IN PROGRESS`; never flip `⬜ TODO` directly to `✅ DONE`. Apply normal task retry (max 1 retry per task). If any task ends ❌ FAILED after retry → STOP autopilot, mark phase ❌ FAILED in plan file, surface failure to user, ask "Continue from next phase, retry this phase, or stop?". Do NOT silently skip.

2. **Run review** — Once all tasks in the phase reach ✅ DONE, invoke the cf-review skill on uncommitted changes (load `$cf-review`, no extra args). The uncommitted diff is this phase's work (prior phases are already committed). (If `review.withCodex: true` is set in the config, cf-review automatically adds a Codex second-opinion review and merges both — no flag needed here.)

3. **Parse findings** — cf-review returns bullets under 4 emoji headers. Treat each:
   - 🚨 **Critical** → must fix
   - ⚠️ **Important** → must fix
   - 💡 **Suggestions** → log only, do NOT block
   - 📋 **Summary** → informational
     If you cannot reliably parse the review output (unexpected format), STOP autopilot and surface to user — do NOT default to "looks clean".

4. **Fix loop (max 1 fix round = 2 reviews total)** — If Critical or Important findings exist:
   - Dispatch ONE cf-implementer call with task: "Fix these review findings: <verbatim Critical + Important bullets>". Files: union of files referenced by the findings.
   - **Fix-task failure path** — If the fix cf-implementer returns `[CF-RESULT: failure]`, STOP autopilot immediately. Do NOT consume the second review round. Mark phase ❌ FAILED (revert README phase row from ✅ DONE → ❌ FAILED for big plans if already flipped). Surface the failure to user.
   - Otherwise, re-run `$cf-review` (round 2).
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

6. **Advance** — Now that commit succeeded, finalize plan bookkeeping. For small plans: per-task ✅ DONE flips already happened at task-checkpoint time; nothing extra here. For **big plans under autopilot**: flip the phase row in `README.md` to ✅ DONE in THIS step (after commit succeeded), NOT at the last-task-DONE checkpoint — see the "Autopilot override" in the Big plan phase sync section of `${PLUGIN_ROOT}/skills/cf-plan/modes/execute.md`. Then IMMEDIATELY proceed to the next phase. Do NOT ask "Continue? (y/n)". Do NOT prompt for anything.

**Stop conditions (only these end autopilot)**:

- Task fails after its 1 retry.
- Review round 2 still has Critical or Important findings.
- Review output cannot be parsed.
- `git commit` fails repeatedly after fix attempts.
- User explicitly interrupts.
- All phases reach ✅ DONE in plan file.

**Drift guard**: if Claude finds itself about to ask the user "should I commit?" or "should I continue to the next phase?" while running an autopilot plan, that is a drift bug. Re-read the `## AUTOPILOT` section in the plan file and proceed per the contract.

### AUTOPILOT CONTRACT block

Only when `--auto`. Copy this entire block **verbatim** into each generated plan file that needs it — see Step 5 / Step 6 for which files (small plan: `README.md`; big plan: `README.md` AND every `phase-N-*.md`). The templates below mark its position with a placeholder; replace that placeholder with this exact text. Omit the whole section when `auto: false`.

```markdown
## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

This plan was created with `--auto`. When resuming or continuing this plan, follow this contract exactly. Do NOT ask the user for confirmation between phases.

**Per-phase loop:**

1. Dispatch all tasks in the current phase using the standard cf-implementer protocol (sequential or parallel as marked). **Progress checkpoints are mandatory:** before each dispatch, edit the Progress table `⬜ TODO` → `🔄 IN PROGRESS`; on `[CF-RESULT: success]`, edit `🔄 IN PROGRESS` → `✅ DONE` — never skip `🔄 IN PROGRESS`, even under autopilot. Apply normal retry rules. If a task ends ❌ FAILED after retry → STOP autopilot, mark the failing task ❌ FAILED in the plan file (and revert the phase row in `README.md` from ✅ DONE to ❌ FAILED for big plans if it was already flipped), report to user.
2. After all tasks in the phase reach ✅ DONE, run `$cf-review` on the uncommitted changes (no extra arguments — reviews everything that has not been committed yet, which is this phase's work).
3. Parse review findings:
   - 🚨 **Critical** and ⚠️ **Important** → must be fixed.
   - 💡 **Suggestions** → log them in the upcoming commit body, do NOT block.
4. If Critical/Important findings exist:
   - Dispatch one cf-implementer call with a fix task that lists the findings verbatim. Files: union of files referenced by the findings.
   - If the fix cf-implementer returns `[CF-RESULT: failure]`, STOP autopilot immediately (do NOT consume the second review round). Mark the phase ❌ FAILED (and revert the README phase row from ✅ DONE to ❌ FAILED if applicable). Surface the failure to user.
   - Otherwise, re-run `$cf-review`.
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
- Review output from `$cf-review` cannot be reliably parsed.
- `git commit` fails repeatedly after attempted hook fixes.
- User explicitly interrupts (Ctrl+C, message).
- Plan file shows all phases ✅ DONE.

**Drift guard:** if Claude finds itself about to ask the user "should I commit?" or "should I continue to the next phase?" while running an `auto: true` plan, that is a drift bug. Re-read this section and proceed.
```
