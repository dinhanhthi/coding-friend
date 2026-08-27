---
name: cf-review
description: >
  Dispatch code review to a subagent. Triggers: "review this", "review my changes", "check
  the code", "code review", "any issues with this?", "review before merge", "review the
  diff". Also for reviewing specific files, commits, or branches.
user-invocable: true
created: 2026-02-17
updated: 2026-08-27
model: opus
---

# /cf-review

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

> ✨ **CODING FRIEND** → /cf-review activated

Review the code changes for: **$ARGUMENTS**

## Auto-Triggered

Invoked by `/cf-plan` (after all tasks), `/cf-fix` (after verified fix), and `/cf-optimize` (after measured + verified).

## Workflow

### Step 0: Custom Guide

```!
bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review
```

If output is not empty: `## Before` → before first step, `## Rules` → throughout, `## After` → after final step.

### Step 1: Identify the target

- Empty `$ARGUMENTS` → all uncommitted changes (`git diff` + `git diff --staged`)
- File path → that file
- Commit range (e.g. `HEAD~3..HEAD`) → those commits
- Natural-language description (e.g. "the auth logic changes") → default uncommitted set, **focus** findings on that area
- `--deep` / `--quick` → force that mode (override auto-detection)

**Codex dual-review flag:**

- `--with-codex` (alias `--codex`) → `codex=true`; strip the flag before other parsing.
- Else read `review.withCodex` from config (`CF_CONFIG_FILE`, default `.coding-friend/config.json`). `true` → `codex=true` (how `/cf-plan`, `/cf-fix`, `/cf-optimize` opt in). Absent/`false` → `codex=false`.
- When `codex=true`, run Claude's own review (Steps 2–6) **and** Codex in parallel, then merge (Steps 6.5–7). `run-codex-review.sh` auto-scopes: feature branch → `codex review --base <base>`; base branch with unpushed commits → `--base <upstream>`; only uncommitted → `--uncommitted`; local-only → `--commit HEAD`. Covers committed-on-base work that `gather-diff.sh` misses. `--base`/`--commit` omit uncommitted/untracked files.
- **Target compatibility:** auto-scope matches the **default target** only (empty `$ARGUMENTS`, or natural-language that still reviews the default set). File path or commit range → do NOT run Codex. Print:

  > ⚠ `--with-codex` only applies to the default uncommitted-changes review; Codex does not support the target `<target>`. Running Claude-only review.

  Set `codex=false`; skip Steps 2.5/6.5.

**External headless-reviewer flags:**

- After the codex block, parse `--claude`, `--gemini`, `--cursor`, `--grok` (and `--with-<agent>` aliases) into `agents=[…]`; strip them.
- **Host-match no-op:** skip a matching flag only when a `HOST:` line exists **and** equals the flag. If `HOST:` is `claude` and `--claude` was passed, drop `claude` and print:

  > ⚠ `--claude` skipped: Claude is already the in-session reviewer.

  No `HOST:` line or a different value → do **NOT** skip. When in doubt, run it.

- When `agents` is non-empty, run Claude's own review (Steps 2–6) **and** each agent in parallel (Steps 2.5/6.5), then merge (Step 7). Each agent: `run-agent-review.sh` (read-only headless CLI) on the **exact `gather-diff.sh` diff** (same set as Claude, unlike Codex auto-scope).
- **Target compatibility:** same as Codex — default target only. File path or commit range → print:

  > ⚠ External reviewer flags only apply to the default uncommitted-changes review; they do not support the target `<target>`. Running Claude-only review.

  Clear `agents=[]`; skip agent Steps 2.5/6.5.

**`--out` flag (manual external-review round-trip):**

- `--out` → `out=true`; strip it.
- **Mutual exclusivity:** `--out` + any headless-agent flag (`--claude`/`--gemini`/`--cursor`/`--grok`/`--codex`) → print:

  > ⚠ `--out` (manual external review) can't combine with auto reviewer flags — ignoring the agent flags.

  Clear `agents=[]`, set `codex=false`.

- `--out` is default-target only; file-path/commit-range → warn, set `out=false`.
- When `out=true`: Claude's own review (Steps 2–6), then a `/cf-review-out`-style prompt (Step 6.7). Skip Steps 2.5/6.5 and Step 7. Show Claude's report, then the "📝 Review Prompt Ready" panel.

### Step 2: Gather the diff

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
```

### Step 2.5: Spawn Codex review in the background (only when `codex=true`)

Skip when `codex=false`.

Docs root + label `YYYY-MM-DD-review`. Use `CF_DOCS_ROOT` (absolute, from bootstrap) — not cwd-relative `docsDir`. Fallback: `$MAIN_REPO_ROOT/<docsDir>`. Background Bash (`run_in_background: true`) so Steps 3–6 run concurrently:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md"
```

**Do NOT wait or inspect here.** Proceed to Step 3. Harness notifies on exit — no poll/sleep/`/tasks`. Check Codex in Step 6.5.

**Spawn external agent reviews in the background (only when `agents` is non-empty):**

Skip when `agents=[]` or `out=true`.

For each agent, spawn background Bash (`run_in_background: true`):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-agent-review.sh" <agent> "${CF_DOCS_ROOT}/reviews/<label>-result-<agent>.md"
```

Same `${CF_DOCS_ROOT}` and `<label>` as Codex. **Do NOT wait** — proceed to Step 3.

### Step 3: Assess change size

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh"
```

Script prints `KEY=value`: `FILES_CHANGED`, `LINES_CHANGED`, `SENSITIVE`, `CHANGED_FILES`, `MODE`. Use `MODE` as-is.

| Mode         | Condition                                          | Behavior                                                       |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------- |
| **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | Layer 3: secrets + obvious injection. Skip context research.   |
| **STANDARD** | 4–10 files OR 51–300 lines                         | Full 5-layer review. All security phases, concise.             |
| **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | Full 5-layer + extended security. Data-flow tracing. Exploits. |

`SENSITIVE > 0` → always **DEEP**.

### Step 4: Gather context (conditional — based on review mode)

- **QUICK mode**: Skip.
- **STANDARD mode**: If `memory_search` is available, call `{ "query": "<area — e.g. auth, API, database>", "limit": 5 }`. Hints only.
- **DEEP mode**: Launch **cf-explorer**. Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass changed files; ask callers, deps, nearby conventions, related tests. cf-explorer searches memory itself — do NOT also call `memory_search`.

Memory and explorer results are **hints** — verify against code.

### Step 5: Read changed files

Read each changed file in full — not just the diff.

### Step 6: Dispatch the cf-reviewer agent

Use the **Agent tool** with `subagent_type: "coding-friend:cf-reviewer"`. Pass:

> **Review mode:** [QUICK | STANDARD | DEEP]
>
> **Diff:**
> [full diff from Step 2]
>
> **Changed files (full content):**
> [full content from Step 5]
>
> **Context (if gathered in Step 4):**
> [memory or cf-explorer findings]
>
> Run the review now. Return the unified report in the 🚨/⚠️/💡/📋 format.

Wait for the report.

### Step 6.5: Collect & normalize the Codex review (only when `codex=true`)

Skip when `codex=false`.

1. **Wait for Codex.** After Step 6 the harness has usually notified. If not, wait — no poll/sleep. Read the result file only after exit.
2. **Check Codex exit** (`CF_CODEX=...` stderr + exit code):
   - `CF_CODEX=unavailable` (exit 127) → Codex not installed. Print:

     > ⚠ Codex unavailable (not on PATH) — proceeding without it.

     Set `codex=false`; skip the rest (Step 7 uses the cf-reviewer report as-is).

   - `CF_CODEX=error` (non-zero) → print:

     > ⚠ Codex review failed (<reason from stderr>) — proceeding with Claude-only review.

     Set `codex=false`; skip the rest.

   - `CF_CODEX=empty` (exit 0, no result file) → print:

     > ⚠ Codex found no changes to review — proceeding with Claude-only review.

     Set `codex=false`; skip the rest.

   - `CF_CODEX=ok <file>` (exit 0) → continue. Optional `CF_CODEX_SCOPE=...` on stderr records the scope.

3. Normalize to the standard 4-section format:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/normalize-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md"
   ```

   Same `${CF_DOCS_ROOT}` path as Step 2.5. Emits `## 🔍 Codex Review` tagged `**[Codex]**`; map `[P2]`→⚠️, `[P3]`→💡, else (incl. `[P1]`/`[P0]`)→🚨. Unparseable output goes into Summary — never drop content.

Never block on Codex — failure degrades to a Claude-only review.

**Collect external agent reviews (only when `agents` was non-empty at spawn time):**

Skip when `agents=[]` or `out=true`.

1. **Wait for each agent** (same contract as Codex — harness notify, no polling).
2. **Check each** (`CF_AGENT=…` stderr + exit code):
   - `unavailable` (127) → `> ⚠ \<Agent\> unavailable (not on PATH) — proceeding without it.` Drop it.
   - `error` (non-zero) → `> ⚠ \<Agent\> review failed (\<reason from stderr\>) — proceeding without it.` Drop it.
   - `empty` (0) → `> ⚠ \<Agent\> found no changes to review — proceeding without it.` Drop it.
   - `timeout` (124) → `> ⚠ \<Agent\> review timed out (\>Ns) — proceeding without it.` Drop it. (N = `review.agentTimeout`, default 300.)
   - `ok <file>` (0) → keep the result file. **No normalize** — already CF-format.

Never block on any external agent — failures degrade gracefully.

### Step 6.7: Emit `--out` prompt file (only when `out=true`)

Skip when `out=false`.

After Step 6, emit a `/cf-review-out`-style prompt with Claude's findings:

1. Write Claude's Step 6 report to a temp file.
2. Build the prompt:

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

3. Show the "📝 Review Prompt Ready" panel and `> When all external agents finish, run /cf-review-in <label> to collect all results.`
4. Display Claude's report **before** the panel.
5. Skip Steps 7–10's completion banner. Step 8 if appropriate, then stop.

### Step 7: Collect the report

Skip when `out=true` (Step 6.7 handles output).

**When no external sources survived** (`codex=false` and all agents dropped): Step 6 is the final report (🚨 Critical / ⚠️ Important / 💡 Suggestions / 📋 Summary). Do NOT reformat — use as-is in Step 10.

**When any external source survived** (codex and/or agents): merge via **cf-reviewer-reducer** (Agent tool, `subagent_type: "coding-friend:cf-reviewer-reducer"`). Claude's report = Source 1; each surviving external review = a numbered source:

> Merge these review reports into one unified, deduplicated, severity-ranked report.
>
> **Source 1 — Claude multi-agent review:**
> [the full report from Step 6]
>
> **Source K — \<Agent\> review:** (for each surviving external source)
> [normalized Codex block for Codex; raw result file for claude/gemini/cursor/grok]
>
> Tag each external finding with `[\<Agent\>]` (Codex → `[Codex]`, gemini → `[Gemini]`, etc.). Same file:line + same issue → one finding (highest severity) and note agreement. Output 🚨/⚠️/💡/📋.

Use the reducer's merge in Step 10.

### Step 8: Mark review complete and display status

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

### Step 9: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns**, call `memory_store` with type `"fact"`, importance `3`, source `"auto-capture"`, plus title/description/tags/content. Skip routine reviews.

### Step 10: Final output

Display the full report and the status banner in one message. Do NOT split them.

Display the cf-reviewer's report first, then append the appropriate banner. When any external source contributed, add a `· Reviewed by: <in-session> + …` suffix (e.g. `· Reviewed by: Claude + Codex + Gemini`). Label from `HOST` (capitalized); if no `HOST:` line, use `In-session AI` — do NOT hardcode `Claude`. Omit the suffix when only the in-session reviewer ran.

Skip this banner when `out=true` — Step 6.7 already showed the export panel.

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
