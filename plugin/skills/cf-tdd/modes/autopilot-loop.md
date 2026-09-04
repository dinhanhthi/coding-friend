# Autopilot Post-Implementation Loop

## Autopilot Post-Implementation Loop (`--auto` only)

This section activates **iff `--auto` is present in the current cf-tdd invocation's arguments**.

That single check is sufficient — Claude does NOT need to introspect whether cf-tdd was loaded transitively. Why: cf-plan owns the autopilot loop when a plan has `auto: true`, and cf-plan's contract explicitly forbids propagating `--auto` to cf-implementer (see "Autopilot note" in the Subagent Dispatch section above). So a transitively-loaded cf-tdd (e.g. cf-plan falling back to inline TDD when cf-implementer fails) will never see `--auto` in its own arguments, and this section will not fire. Direct user invocations like `/cf-tdd --auto …` always carry the flag and correctly activate this loop.

When active, after implementation completes its own verification (existing tests pass + typecheck/lint clean), run this loop instead of the standard Review Reminder:

1. **Run review** — invoke the cf-review skill (use the Skill tool with skill name `coding-friend:cf-review`, no extra args). cf-review will analyze uncommitted changes. Count this as review round 1.

2. **Parse findings** — cf-review returns bullets under 4 emoji headers:
   - 🚨 **Critical** → must fix
   - ⚠️ **Important** → must fix
   - 💡 **Suggestions** → log only, do NOT block
   - 📋 **Summary** → informational
     If output is unparseable, STOP autopilot and surface to user.

3. **Fix loop** — If Critical or Important findings exist:
   - Read `review.maxRounds` from merged config: `~/.coding-friend/config.json` + local `.coding-friend/config.json`; **local field overrides global**. Absent, non-integer, or `< 1` → **5**. This is the maximum number of `/cf-review` runs (the initial review in step 1 counts as round 1).
   - Repeat while Critical/Important remain **and** review rounds used `< maxRounds`:
     - Dispatch ONE cf-implementer with task "Fix these review findings: <verbatim Critical + Important bullets from the latest review>". Files: union of files referenced.
     - **Fix-task failure path** — If the fix cf-implementer returns `[CF-RESULT: failure]`, STOP autopilot immediately. Do NOT consume another review round. Surface the failure to user.
     - Otherwise, re-run `/cf-review` (next round).
     - If that review is clean (only Suggestions/Summary) → exit the fix loop and continue to commit.
   - If Critical or Important still remain after `maxRounds` reviews → STOP autopilot, surface all review outputs and fix attempts, ask user.
   - Hard cap: never more than `maxRounds` reviews. Do not start a fix after the last allowed review.

4. **Commit** — On clean review (or only Suggestions):
   - `git add -A`
   - Generate conventional commit message: `<type>(<scope>): <task summary>` where `<type>` is feat/fix/refactor/docs/chore/test based on the dominant change, `<scope>` is inferred from the changed files' directory.
   - Commit body: brief summary + any Suggestion findings logged as follow-ups.
   - `git commit -m "$(cat <<'EOF'
<message>
EOF
)"`
   - NEVER use `--no-verify`. NEVER include AI/Claude co-author lines (project rule #6).
   - If `git commit` fails (pre-commit hook), do NOT amend — fix the issue, re-stage, create a NEW commit. Repeated failure → STOP and surface to user.

5. **Report** — Print a brief summary of what was implemented, reviewed, fixed, and committed.

**Stop conditions (only these end autopilot)**:

- Implementation fails its own verification (typecheck/test failure that cannot be auto-fixed).
- The fix cf-implementer returns `[CF-RESULT: failure]` (do not consume another review round).
- Review still has Critical or Important after `review.maxRounds` reviews (default 5).
- Review output cannot be parsed.
- `git commit` fails repeatedly.
- User explicitly interrupts.

**Drift guard**: if you find yourself about to ask the user "should I commit?" or "should I run review?" while autopilot is active, that is a drift bug. Re-read this section and proceed per the loop.

**Note on propagation from cf-plan**: When cf-plan dispatches cf-implementer for an `auto: true` plan, cf-plan owns the review/fix/commit loop. cf-implementer does NOT run this loop. This Autopilot Post-Implementation Loop only fires when cf-tdd itself is the top-level skill handling the user's request.
