---
name: cf-review
description: >
  Dispatch code review to a subagent. Use when the user wants code reviewed — e.g.
  "review this", "review my changes", "check the code", "look over this", "code review",
  "any issues with this?", "is this code ok?", "review before merge", "review the diff",
  "what do you think of these changes?". Also triggers on requests to review specific files,
  commits, or branches.
user-invocable: true
created: 2026-02-17
updated: 2026-07-05
model: opus
---

# /cf-review

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

> ✨ **CODING FRIEND** → /cf-review activated

Review the code changes for: **$ARGUMENTS**

## Auto-Triggered

This skill is automatically invoked by other skills — you don't always need to run it manually:

- **`/cf-plan`** — runs `/cf-review` after all implementation tasks complete
- **`/cf-fix`** — runs `/cf-review` after the fix is verified
- **`/cf-optimize`** — runs `/cf-review` after the optimization is measured and verified

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Identify the target

- If `$ARGUMENTS` is empty, review all uncommitted changes (`git diff` + `git diff --staged`)
- If `$ARGUMENTS` is a file path, review that file
- If `$ARGUMENTS` is a commit range (e.g., `HEAD~3..HEAD`), review those commits
- If `$ARGUMENTS` is a natural language description (e.g., "the auth logic changes"), review all uncommitted changes but **focus the review** on the described area — filter findings to only report issues relevant to that description
- If `$ARGUMENTS` contains `--deep` or `--quick`, use that mode (override auto-detection)

**Codex dual-review flag:**

- If `$ARGUMENTS` contains `--with-codex` (or its alias `--codex`), set `codex=true` and strip the flag from `$ARGUMENTS` before any other parsing.
- Otherwise, read `review.withCodex` from the config file (`CF_CONFIG_FILE`, default `.coding-friend/config.json`). If it is `true`, set `codex=true` (config-gated default; this is how auto-invokers like `/cf-plan`, `/cf-fix`, `/cf-optimize` opt in without passing the flag). If absent or `false`, `codex=false`.
- When `codex=true`, the workflow runs Claude's own review (Steps 2–6) **and** a Codex review in parallel, then merges both (Steps 6.5–7). The Codex script (`run-codex-review.sh`) **auto-selects its scope** from git state so it covers committed work, not just the working tree: feature branch → `codex review --base <base>` (committed branch changes); on the base branch with unpushed commits → `--base <upstream>` (local commits not yet pushed); only uncommitted changes → `--uncommitted`; local-only repo → `--commit HEAD`. This lets Codex see a phase's changes even after they are committed — including on the base branch, where `gather-diff.sh` only reports uncommitted work (its committed-vs-base section is gated on being on a feature branch), so Codex covers committed-on-base work that Claude's own review would otherwise miss. Trade-off: a `--base`/`--commit` scope omits uncommitted/untracked files, and when Codex is unavailable that committed-on-base work degrades to a Claude-only review that may see nothing.
- **Target compatibility:** the auto-scope above only matches the **default target** (empty `$ARGUMENTS`, or a natural-language description that still reviews the default change set). If `$ARGUMENTS` (after stripping flags) is a **file path** or a **commit range** (e.g. `HEAD~3..HEAD`), Claude reviews that specific target but Codex would review the unrelated default change set. In that case do NOT run Codex — print:

  > ⚠ `--with-codex` only applies to the default uncommitted-changes review; Codex does not support the target `<target>`. Running Claude-only review.

  Set `codex=false` and skip Steps 2.5/6.5.

**External headless-reviewer flags:**

- After the codex block, parse `--claude`, `--gemini`, `--cursor`, `--grok` (and `--with-<agent>` aliases). Collect matched ones into an `agents=[…]` list; strip the flags from `$ARGUMENTS`.
- **Host-match no-op:** read `HOST` from the session bootstrap context; if `HOST=claude` and `--claude` was passed, drop `claude` from the list and print:

  > ⚠ `--claude` skipped: Claude is already the in-session reviewer.

- When `agents` is non-empty, the workflow runs Claude's own review (Steps 2–6) **and** each requested agent review in parallel (Steps 2.5/6.5), then merges all surviving sources (Step 7). Each agent is invoked via `run-agent-review.sh`, which feeds `gather-diff.sh` output through `build-review-prompt.sh` and runs the headless CLI in read-only mode. The four agents review the **exact diff `gather-diff.sh` produces** — the same change set Claude's own review sees (deliberately different from Codex's auto-scope).
- **Target compatibility:** same restriction as codex — only the **default target** (empty `$ARGUMENTS`, or a natural-language description). If `$ARGUMENTS` (after stripping flags) is a **file path** or **commit range**, print:

  > ⚠ External reviewer flags only apply to the default uncommitted-changes review; they do not support the target `<target>`. Running Claude-only review.

  Clear `agents=[]` and skip agent Steps 2.5/6.5.

**`--out` flag (manual external-review round-trip):**

- If `$ARGUMENTS` contains `--out`, set `out=true` and strip the flag.
- **Mutual exclusivity:** if `--out` is combined with any headless-agent flag (`--claude`/`--gemini`/`--cursor`/`--grok`/`--codex`), print:

  > ⚠ `--out` (manual external review) can't combine with auto reviewer flags — ignoring the agent flags.

  Clear `agents=[]`, set `codex=false`.

- `--out` implies the default target only (same restriction as codex); on a file-path/commit-range target, print the analogous warning and ignore `--out` (set `out=false`).
- When `out=true`: run Claude's own review (Steps 2–6), then emit a `/cf-review-out`-style prompt file with Claude's findings embedded (see **Step 6.7**). Skip codex/agent Steps 2.5/6.5 and Step 7 merge. Display Claude's report to the user, then show the "📝 Review Prompt Ready" panel.

### Step 2: Gather the diff

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
```

### Step 2.5: Spawn Codex review in the background (only when `codex=true`)

Skip this step entirely when `codex=false`.

Resolve the docs root and a label `YYYY-MM-DD-review`. Use `CF_DOCS_ROOT` (the absolute docs base dir from the session bootstrap context) so the result file lands in the project docs folder even when Claude is launched from a subdirectory — do NOT use the bare `docsDir` name with a cwd-relative path. Fallback: if `CF_DOCS_ROOT` is unset, use `$MAIN_REPO_ROOT/<docsDir>`. Spawn the Codex review as a **background Bash process** (`run_in_background: true`) so Claude's own review (Steps 3–6) runs concurrently:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md"
```

**Do NOT wait for or inspect the Codex result here.** Immediately proceed to Step 3 and run Claude's own review (Steps 3–6) while Codex runs in the background — that concurrency is the whole point. The harness automatically notifies Claude when the background process exits (do NOT poll, sleep, or check `/tasks` — per the Bash tool contract: "you'll be notified when it finishes"). The Codex exit status and result are checked later, in Step 6.5.

**Spawn external agent reviews in the background (only when `agents` is non-empty):**

Skip when `agents=[]` or `out=true`.

For each agent in `agents`, spawn a background Bash process (`run_in_background: true`):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-agent-review.sh" <agent> "${CF_DOCS_ROOT}/reviews/<label>-result-<agent>.md"
```

Use the same `${CF_DOCS_ROOT}` and `<label>` as Codex. **Do NOT wait** — proceed immediately to Step 3.

### Step 3: Assess change size

Determine review depth. Run the bundled script (one permission prompt instead of many):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh"
```

The script prints `KEY=value` lines: `FILES_CHANGED`, `LINES_CHANGED`, `SENSITIVE`, `CHANGED_FILES`, and `MODE`.
Use the `MODE` value directly — no further calculation needed.

| Mode         | Condition                                          | Behavior                                                                |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
| **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | Layer 3: secrets + obvious injection only. Skip context research.       |
| **STANDARD** | 4–10 files OR 51–300 lines                         | Full 5-layer review. All security phases, concise.                      |
| **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | Full 5-layer + extended security. Data flow tracing. Exploit scenarios. |

If `SENSITIVE > 0`, always escalate to **DEEP** regardless of size.

### Step 4: Gather context (conditional — based on review mode)

- **QUICK mode**: Skip this step entirely.
- **STANDARD mode**: Search memory only (if `memory_search` tool is available). Call `memory_search` with: `{ "query": "<area being reviewed — e.g. auth, API, database>", "limit": 5 }`. Use results as context hints for the review.
- **DEEP mode**: Launch the **cf-explorer agent** to understand callers, dependencies, and data flows around the changed files. Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass:

  > Explore the codebase context around these changed files: [list changed files]
  >
  > Questions to answer:
  >
  > 1. What calls these files/functions? (callers, entry points)
  > 2. What do these files depend on? (downstream effects)
  > 3. What conventions and patterns exist in the surrounding code?
  > 4. Are there related tests that should be checked?

  **Note:** cf-explorer already checks memory internally — do NOT call `memory_search` separately when using cf-explorer.

Memory and explorer results are **hints** — always verify against actual code.

### Step 5: Read changed files

Read changed files in full — do not review only the diff, understand the context.

### Step 6: Dispatch the cf-reviewer agent

Use the **Agent tool** with `subagent_type: "coding-friend:cf-reviewer"`. Pass the full context:

> **Review mode:** [QUICK | STANDARD | DEEP]
>
> **Diff:**
> [full diff from Step 2]
>
> **Changed files (full content):**
> [full content of each changed file from Step 5]
>
> **Context (if gathered in Step 4):**
> [memory search results or cf-explorer findings, if any]
>
> Run the review now. Return the unified report in the 🚨/⚠️/💡/📋 format.

Wait for the agent to return its report.

### Step 6.5: Collect & normalize the Codex review (only when `codex=true`)

Skip this step entirely when `codex=false`.

1. **Wait for the Codex background process to finish.** By the time the cf-reviewer agent (Step 6) returns, the harness has likely already delivered the Codex completion notification. If it has not yet arrived, wait for it — do NOT poll or sleep. Only read the result file after the process has exited.
2. **Check the Codex exit status** (from the background process — its `CF_CODEX=...` stderr line and exit code):
   - `CF_CODEX=unavailable` (exit 127) → Codex not installed. Print:

     > ⚠ Codex unavailable (not on PATH) — proceeding without it.

     Set `codex=false` and skip the rest of this step (Step 7 will use the cf-reviewer report as-is).

   - `CF_CODEX=error` (non-zero exit) → Codex failed (e.g. not logged in). Print:

     > ⚠ Codex review failed (<reason from stderr>) — proceeding with Claude-only review.

     Set `codex=false` and skip the rest of this step.

   - `CF_CODEX=empty` (exit 0, no result file) → nothing committed or uncommitted to review. Print:

     > ⚠ Codex found no changes to review — proceeding with Claude-only review.

     Set `codex=false` and skip the rest of this step.

   - `CF_CODEX=ok <file>` (exit 0) → the review was written to the result file; continue. (An optional `CF_CODEX_SCOPE=...` line on stderr records which scope was used.)

3. Normalize the raw Codex result into the standard 4-section format:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/normalize-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md"
   ```

   (Use the same `${CF_DOCS_ROOT}`-based path the result was written to in Step 2.5.) This emits a `## 🔍 Codex Review` block with findings tagged `**[Codex]**` and severities mapped (`[P2]`→⚠️, `[P3]`→💡, anything else incl. `[P1]`/`[P0]`→🚨 so a top severity never fails silent). It never drops content — unparseable output is folded into the Summary section.

Never block the workflow on Codex — any failure degrades gracefully to a Claude-only review.

**Collect external agent reviews (only when `agents` was non-empty at spawn time):**

Skip when `agents=[]` or `out=true`.

1. **Wait for each agent's background process to finish** (same wait contract as Codex — harness notification, no polling).
2. **Check each agent's exit status** (`CF_AGENT=…` stderr line and exit code):
   - `CF_AGENT=unavailable` (exit 127) → print:

     > ⚠ \<Agent\> unavailable (not on PATH) — proceeding without it.

     Drop that agent.

   - `CF_AGENT=error` (non-zero exit) → print:

     > ⚠ \<Agent\> review failed (\<reason from stderr\>) — proceeding without it.

     Drop that agent.

   - `CF_AGENT=empty` (exit 0) → print:

     > ⚠ \<Agent\> found no changes to review — proceeding without it.

     Drop that agent.

   - `CF_AGENT=timeout` (exit 124) → print:

     > ⚠ \<Agent\> review timed out (\>Ns) — proceeding without it.

     Drop that agent. (N = `review.agentTimeout` from config, default 300.)

   - `CF_AGENT=ok <file>` (exit 0) → keep its result file. **No normalize step** — stdout is already CF-format.

Never block the workflow on any external agent — failures degrade gracefully.

### Step 6.7: Emit `--out` prompt file (only when `out=true`)

Skip when `out=false`.

After Step 6 returns Claude's report, emit a `/cf-review-out`-style prompt with Claude's findings embedded:

1. Write Claude's Step 6 report to a temp file.
2. Build the prompt file:

   ```bash
   # CF_EMBED_CONTEXT_FILE must be set on the build-review-prompt.sh stage (it reads
   # the var) — NOT as a pipeline-leading prefix, which would only reach gather-diff.sh.
   mkdir -p "${CF_DOCS_ROOT}/reviews" && \
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh" | \
   CF_EMBED_CONTEXT_FILE="$tmp_report" \
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review-out/scripts/build-review-prompt.sh" \
     "<label>" "<docsDir>" \
   > "${CF_DOCS_ROOT}/reviews/<label>-prompt.md"
   ```

3. Show the same "📝 Review Prompt Ready" panel, copy-paste external-agent instruction, and the `> When all external agents finish, run /cf-review-in <label> to collect all results.` reminder that `cf-review-out` Step 4 shows.
4. Display Claude's own report to the user **before** the panel so they see the findings that were embedded.
5. Skip Steps 7–10's normal completion banner — the review was exported, not completed in-session. Proceed to Step 8 (mark reviewed) if appropriate, then stop.

### Step 7: Collect the report

Skip when `out=true` (Step 6.7 handles output).

**When no external sources survived** (`codex=false` and all agents dropped): the result of Step 6 is the final formatted report (🚨 Critical / ⚠️ Important / 💡 Suggestions / 📋 Summary). Do NOT reformat or restructure it — use it as-is in Step 10.

**When any external source survived** (codex and/or one or more agents): merge all reviews through the reducer. Dispatch the **cf-reviewer-reducer** agent (Agent tool, `subagent_type: "coding-friend:cf-reviewer-reducer"`) with Claude's report as Source 1 and each surviving external review as an additional numbered source:

> Merge these review reports into one unified, deduplicated, severity-ranked report.
>
> **Source 1 — Claude multi-agent review:**
> [the full report from Step 6]
>
> **Source K — \<Agent\> review:** (for each surviving external source)
> [the review content — normalized Codex block for Codex; raw result file for claude/gemini/cursor/grok agents]
>
> Tag each external source's findings with `[\<Agent\>]` provenance (Codex → `[Codex]`, gemini → `[Gemini]`, etc.). Where multiple sources flag the same file:line for the same issue, merge into one finding (keep highest severity) and note agreement (raises confidence). Output the standard 🚨/⚠️/💡/📋 format.

Use the reducer's merged output as the report in Step 10.

### Step 8: Mark review complete and display status

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

### Step 9: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns** worth preserving, call `memory_store` with:

- type: "fact"
- importance: 3
- source: "auto-capture"
- title/description/tags/content summarizing the insight

Skip if the review was routine with no notable findings.

### Step 10: Final output

Display the full report followed by the status banner in a **single message**.

**IMPORTANT**: The structured report from step 8 and the banner below MUST appear together in the same final response. Do NOT split them across separate messages. This ensures the complete review is visible in the last message.

Display the cf-reviewer's report first, then append the appropriate banner. When any external source contributed, add a `· Reviewed by: Claude + …` suffix listing Claude plus each external agent/codex that actually contributed (e.g. `· Reviewed by: Claude + Codex + Gemini`). Omit the suffix when only Claude ran.

Skip this step's banner when `out=true` — Step 6.7 already showed the export panel.

**If NO critical issues were found:**

```
╔══════════════════════════════════════════════════╗
║  ✅  Code Review Complete                        ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · No blocking issues found.
>
> You're clear to commit. Run `/cf-commit` when ready.

**If critical issues were found** — show the banner, then wait for the user's answer:

```
╔══════════════════════════════════════════════════╗
║  ⚠️  Review Complete — Action Needed             ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** must be resolved before committing.
>
> Resolve the critical issues listed above. Shall I help fix them now?
