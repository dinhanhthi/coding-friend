# Resume mode (`--resume <path>`)

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
   - **Autopilot gating** — Before honoring `auto: true` in frontmatter, verify the plan body (`README.md` for small plans; README.md and every phase file for big plans) actually contains a `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. If the section is missing in any file that should have it, do NOT autopilot — warn the user: `> ⚠️ Plan has \`auto: true\` in frontmatter but the \`## AUTOPILOT\` section is missing in <path>. Refusing to autopilot. Re-run \`{{cf:slash cf-plan}} --auto\` to regenerate the section, or remove \`auto: true\` to resume normally.` Stop.
   - Otherwise (frontmatter has `auto: true` AND section is present): **Read the full Autopilot Per-Phase Loop in `autopilot.md` (in the same folder as this file) now** (it holds Step 6's big-plan README phase-row ✅ finalization, which the embedded CONTRACT block in the plan's README omits), then run the remaining phases under it instead of the standard protocol. Announce to user when resuming: `> 🤖 This plan has \`auto: true\` — continuing in autopilot mode.`
