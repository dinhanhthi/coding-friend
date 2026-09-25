---
name: cf-plan-resume
description: >
  Resume an existing /cf-plan from where execution last stopped. Triggers: "resume the
  plan", "continue the plan", "pick up where we left off", "finish the plan", "resume
  <slug>". Requires a plan under docs/plans/. Does NOT create new plans (use /cf-plan).
created: 2026-07-04
updated: 2026-09-25
---

# /cf-plan-resume

Resume the implementation plan at: **$ARGUMENTS** (a plan folder path, an entry file path, or a bare `<slug>`).

## Workflow

### Step 0: Custom Guide

```!
bash "<plugin-root>/lib/load-custom-guide.sh" cf-plan-resume
```

If the block above printed anything, apply only the `## Before`, `## Rules`, and `## After` sections; if it shows the raw command instead of output, re-run that exact `load-custom-guide.sh` fence now.

### Resume Protocol

0. **Parse flags** — if `$ARGUMENTS` contains both `--commit-per-task` and `--no-commit-per-task` → print `> ⚠️ --commit-per-task cannot be combined with --no-commit-per-task. Pick one.` and stop. Otherwise remember which one (if any) was given and strip it from `$ARGUMENTS` before step 1. Resume does NOT read config (`planAuto` / `planCommitPerTask`) — only plan frontmatter and these flags.
1. **Resolve the plan entry file**:
   - Full path to a folder → use `<folder>/README.md`. Full path to a file → use it directly. Validate the target is within the current working directory or `{docsDir}`; report error and stop if outside.
   - Name only (`<slug>`) → first, reject the argument outright if it contains `/`, `\`, or `..` (report: "Invalid plan name — slugs cannot contain path separators or `..`." and stop). This must happen BEFORE constructing any candidate path, since the candidates below are built by directly interpolating `<slug>` — a slug containing `../` would otherwise escape `{docsDir}/plans/`. Once the slug passes this check, resolve in this order, using the first that exists: `{docsDir}/plans/<slug>/README.md` (current layout) → `{docsDir}/plans/<slug>.md` (legacy single-file) → `{docsDir}/plans/<slug>` (append `.md` if it is a bare file).
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
7. If confirmed → first set the plan entry file's frontmatter `status:` field to `in-progress` (a resumed plan is active again — this clears any prior `failed` value; leave it `in-progress` if already so). Then execute pending tasks using the shared execution protocol in `<plugin-root>/skills/cf-plan/modes/execute.md` (Read it now and follow the Sequential/Parallel phases protocols), passing the context file loaded in step 3 to each cf-implementer dispatch. Completion re-sets `status:` to `done`/`failed` per the "Plan done" rule in `execute.md`.
   - **Autopilot gating** — Before honoring `auto: true` in frontmatter, verify the plan body (`README.md` for small plans; README.md and every phase file for big plans) actually contains a `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. If the section is missing in any file that should have it, do NOT autopilot — warn the user: `> ⚠️ Plan has \`auto: true\` in frontmatter but the \`## AUTOPILOT\` section is missing in <path>. Refusing to autopilot. Re-run \`/cf-plan --auto\` to regenerate the section, or remove \`auto: true\` to resume normally.` Stop.
   - Otherwise (frontmatter has `auto: true` AND section is present): **Read the full Autopilot Per-Phase Loop in `<plugin-root>/skills/cf-plan/modes/autopilot.md` now** (it holds Step 6's big-plan README phase-row ✅ finalization, which the embedded CONTRACT block in the plan's README omits), then run the remaining phases under it instead of the standard protocol. Announce to user when resuming: `> 🤖 This plan has \`auto: true\` — continuing in autopilot mode.`
   - **Commit per task** (autopilot branch only, after gating passes) — if a flag was parsed in step 0 and it would CHANGE frontmatter `commitPerTask` (absent = `false`) while the first pending phase already has a ✅ DONE task → print `> ⚠️ Cannot switch commit-per-task mid-phase (phase N has completed tasks). Resume without the flag, or switch after this phase.` and stop. A flag equal to the current value is a no-op. Otherwise set the README frontmatter `commitPerTask:` to `true` (`--commit-per-task`) or `false` (`--no-commit-per-task`) before resuming; add the key if missing. The autopilot loop then follows frontmatter `commitPerTask`; resuming a phase with a ✅ DONE task reuses frontmatter `phaseBase` (missing → autopilot stops and asks; see autopilot.md step 1) so the range review covers the earlier task commits. When it is effectively `true`, announce: `> 🧩 Commit per task on — each task commits as "phase N/M task i/K"; review runs once per phase over its commits.`
   - Flag parsed in step 0 but the plan is not autopilot (no `auto: true`, or gating refused) → print `> ⚠️ --commit-per-task only applies under autopilot (only autopilot commits). Ignored.` and leave frontmatter untouched.
