# Autopilot Post-Implementation Loop

## Autopilot Post-Implementation Loop (`--auto` only)

This section activates **iff `--auto` is present in the current cf-tdd invocation's arguments**.

That single check is sufficient — Claude does NOT need to introspect whether cf-tdd was loaded transitively. Why: cf-plan owns the autopilot loop when a plan has `auto: true`, and cf-plan's contract explicitly forbids propagating `--auto` to cf-implementer (see "Autopilot note" in the Subagent Dispatch section above). So a transitively-loaded cf-tdd (e.g. cf-plan falling back to inline TDD when cf-implementer fails) will never see `--auto` in its own arguments, and this section will not fire. Direct user invocations like `/cf-tdd --auto …` always carry the flag and correctly activate this loop.

When active, after implementation completes its own verification (existing tests pass + typecheck/lint clean), run this loop instead of the standard Review Reminder:

1. **Run review** — invoke the cf-review skill (Skill tool, `coding-friend:cf-review`, no extra args). cf-review will analyze uncommitted changes.

2. **Parse findings** — cf-review returns bullets under 4 emoji headers:
   - 🚨 **Critical** → must fix
   - ⚠️ **Important** → must fix
   - 💡 **Suggestions** → log only, do NOT block
   - 📋 **Summary** → informational
     If output is unparseable, STOP autopilot and surface to user.

3. **Fix loop (max 1 fix round = 2 reviews total)** — If Critical or Important findings exist:
   - Dispatch ONE cf-implementer with task "Fix these review findings: <verbatim Critical + Important bullets>". Files: union of files referenced.
   - **Fix-task failure path** — If the fix cf-implementer returns `[CF-RESULT: failure]`, STOP autopilot immediately. Do NOT consume the second review round. Surface the failure to user.
   - Otherwise, re-run `/cf-review` (round 2).
   - If round 2 still has Critical or Important → STOP autopilot, surface both review outputs and the fix attempt, ask user.
   - Hard cap: 2 reviews total, 1 fix attempt.

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
- The fix cf-implementer returns `[CF-RESULT: failure]` (do not consume the second review round).
- Review round 2 still has Critical or Important findings.
- Review output cannot be parsed.
- `git commit` fails repeatedly.
- User explicitly interrupts.

**Drift guard**: if you find yourself about to ask the user "should I commit?" or "should I run review?" while autopilot is active, that is a drift bug. Re-read this section and proceed per the loop.

**Note on propagation from cf-plan**: When cf-plan dispatches cf-implementer for an `auto: true` plan, cf-plan owns the review/fix/commit loop. cf-implementer does NOT run this loop. This Autopilot Post-Implementation Loop only fires when cf-tdd itself is the top-level skill handling the user's request.
