---
name: cf-plan-resume
description: >
  Resume an existing implementation plan created by $cf-plan, continuing from where execution
  last stopped. Use when the user wants to continue, resume, pick up, or finish a previously
  saved plan — e.g. "resume the plan", "continue the plan", "pick up where we left off",
  "finish the plan", "continue implementing the plan", "resume <slug>". Requires an existing
  plan file under docs/plans/. Does NOT create new plans — use $cf-plan for that.
created: 2026-07-04
updated: 2026-07-04
---

# $cf-plan-resume

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. Reads the plan file and its context file directly and dispatches cf-implementer; no CLI features are required. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

Resume the implementation plan at: **$ARGUMENTS** (a plan folder path, an entry file path, or a bare `<slug>`).

## Workflow

### Step 0: Custom Guide

Run: `bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan-resume`

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Resume Protocol

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
7. If confirmed → execute pending tasks using the shared execution protocol in `${PLUGIN_ROOT}/skills/cf-plan/modes/execute.md` (Read it now and follow the Sequential/Parallel phases protocols), passing the context file loaded in step 3 to each cf-implementer dispatch.
   - **Autopilot gating** — Before honoring `auto: true` in frontmatter, verify the plan body (`README.md` for small plans; README.md and every phase file for big plans) actually contains a `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. If the section is missing in any file that should have it, do NOT autopilot — warn the user: `> ⚠️ Plan has \`auto: true\` in frontmatter but the \`## AUTOPILOT\` section is missing in <path>. Refusing to autopilot. Re-run \`$cf-plan --auto\` to regenerate the section, or remove \`auto: true\` to resume normally.` Stop.
   - Otherwise (frontmatter has `auto: true` AND section is present): **Read the full Autopilot Per-Phase Loop in `${PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md` now** (it holds Step 6's big-plan README phase-row ✅ finalization, which the embedded CONTRACT block in the plan's README omits), then run the remaining phases under it instead of the standard protocol. Announce to user when resuming: `> 🤖 This plan has \`auto: true\` — continuing in autopilot mode.`
