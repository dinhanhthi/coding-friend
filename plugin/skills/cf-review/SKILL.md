---
name: cf-review
description: >
  Dispatch a multi-agent code review of the current changes and report Critical /
  Important / Suggestions / Summary. TRIGGER — "review this", "review my changes",
  "check the code", "code review", "any issues with this?", "review before merge",
  "review the diff"; reviewing specific files, commits, or branches;
  automatically after cf-plan, cf-fix, and cf-optimize complete. SKIP — reviewing
  a plan document (use /cf-plan-review), quick questions about how code works
  (use /cf-ask), and formatting-only changes.
user-invocable: true
created: 2026-02-17
updated: 2026-09-15
model: opus
---

# /cf-review

> ✨ **CODING FRIEND** → /cf-review activated

Review the code changes for: **$ARGUMENTS**

## Auto-Triggered

Invoked by `/cf-plan` (after all tasks), `/cf-fix` (after verified fix), and `/cf-optimize` (after measured + verified).

## Workflow

### Step 0: Custom Guide

```!
bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review
```

If the block above printed anything, apply only the `## Before`, `## Rules`, and `## After` sections; if it shows the raw command instead of output, re-run that exact `load-custom-guide.sh` fence now.

### Step 1: Identify the target

- Empty `$ARGUMENTS` → all uncommitted changes (net `HEAD` → working tree; staged hunks are included once, not twice)
- File path → that file
- Commit range (e.g. `HEAD~3..HEAD`) → those commits
- Natural-language description (e.g. "the auth logic changes") → default uncommitted set, **focus** findings on that area
- `--deep` / `--quick` → force that mode (override auto-detection)

**Codex dual-review flag:**

- `--with-codex`/`--codex` → `codex=true`; else `review.withCodex` from config
- `--claude`/`--gemini`/`--cursor`/`--grok` → `agents=[…]`
- `--out` → `out=true` (exclusive with agent flags)
- Default target only — file path or commit range disables all external reviewers.
- Read now: `references/external-reviewers.md` before parsing flags / before spawn if needed.

### Step 2: Gather the diff

Pass the Step 1 target explicitly and snapshot the scope once so Step 3 and the reviewers reuse it (`<run-id>` = `<label>`-`<short-sha>`):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh" --snapshot-dir /tmp/coding-friend/review/<run-id>
```

| Step 1 target                          | Flags to add                                        |
| -------------------------------------- | --------------------------------------------------- |
| default / natural-language description | _(none)_ — branch commits + uncommitted + untracked |
| file or directory path                 | `--uncommitted --path <path>` (repeatable)          |
| commit range                           | `--range <range>` (no untracked files)              |

`--uncommitted` and `--range` are mutually exclusive. Exit `2` = the scope could **not** be collected (bad flag, invalid range, no git) → stop and report the error; never continue as "no changes". Exit `3` = scope collected but something under `=== Excluded from review scope (NOT reviewed) ===` was unreadable → continue, and carry that gap into the final report as uncovered scope, never as clean.

**Only you** write the snapshot (`diff.txt`, `metadata.txt`, `files.z`, `excluded.z`); reviewer agents read it. If the script warns the snapshot dir is unusable, keep using this command's stdout and note the limitation in the Summary — a background reviewer must never request write permission.

**Flag parse:** `--out` → `out=true` (skip headless spawn/collect). `--claude`/`--gemini`/`--cursor`/`--grok` → `agents=[…]`. Skip a flag that matches `HOST` (do not spawn `--claude` when `HOST` is `claude`).

### Step 2.5: Spawn Codex review in the background (only when `codex=true`)

Skip when no Codex/agent job applies, or when `out=true`. Label `YYYY-MM-DD-review`; `CF_DOCS_ROOT`. Background (do not wait; harness notifies). Run `run-codex-review.sh` only when `codex=true` and `out=false` (`--gemini` alone must NOT spawn Codex). Run `run-agent-review.sh` only when `agents` is non-empty and `out=false` (`--with-codex` alone must NOT run `run-agent-review.sh` with literal `<agent>`):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-codex-review.sh" ${CF_DOCS_ROOT}/reviews/<label>-result-codex.md
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-agent-review.sh" <agent> ${CF_DOCS_ROOT}/reviews/<label>-result-<agent>.md
```

### Step 3: Assess change size

Measure the Step 2 snapshot — never a fresh `git diff`, or the depth could be decided on a scope the reviewers never see. Add `--quick` / `--deep` only when Step 1 saw that flag:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh" --snapshot-dir /tmp/coding-friend/review/<run-id>
```

If Step 2 warned the snapshot dir was unusable, run the script with the **same target flags** you passed to `gather-diff.sh` instead.

Script prints `KEY=value`: `FILES_CHANGED`, `LINES_CHANGED`, `SENSITIVE`, `CHANGED_FILES`, `SCOPE_COMPLETE`, `MODE_AUTO`, `MODE_FORCED`, `MODE`. Use `MODE` as-is.

- Exit `2` = the snapshot was missing, truncated, or a different version → fix the scope and re-run; never fall back to QUICK.
- Exit `3` = the metrics are valid (use `MODE`), but `SCOPE_COMPLETE=false` → carry the same uncovered scope into the Summary as Step 2's exit `3`.
- `--quick` on a sensitive change warns on stderr — repeat that limitation in the Summary and still apply the secrets/injection baseline.

| Mode         | Condition                                          | Behavior                                                       |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------- |
| **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | Layer 3: secrets + obvious injection. Skip context research.   |
| **STANDARD** | 4–10 files OR 51–300 lines                         | Full 5-layer review. All security phases, concise.             |
| **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | Full 5-layer + extended security. Data-flow tracing. Exploits. |

`SENSITIVE > 0` → always **DEEP**.

### Step 4: Gather context (conditional — based on review mode)

- **QUICK mode**: Skip.
- **STANDARD mode**: If `memory_search` is available, call `{ "query": "<area — e.g. auth, API, database>", "limit": 5 }`. Hints only.
- **DEEP mode**: Dispatch `cf-explorer`. Pass changed files; ask callers, deps, nearby conventions, related tests. cf-explorer searches memory itself — do NOT also call `memory_search`.

Memory and explorer results are **hints** — verify against code.

### Step 5: List changed files

Collect the changed file paths from Step 2, including untracked ones (the `--- new file:` entries) — tag those `(new, untracked)`. Do **not** read or paste their contents — the specialists read what they need themselves.

### Step 6: Dispatch the cf-reviewer agent

Dispatch `cf-reviewer`. Pass:

> **Review mode:** [QUICK | STANDARD | DEEP]
>
> **Diff:** read `/tmp/coding-friend/review/<run-id>/diff.txt` (the Step 2 snapshot — covers committed, staged, unstaged, and untracked files, each hunk exactly once). If that file is missing, re-run `bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"` with the same flags. Read-only: do not write into the snapshot directory.
>
> **Changed files:**
> [paths from Step 5]
>
> **Context (if gathered in Step 4):**
> [memory or cf-explorer findings]
>
> Run the review now. Return the unified report in the 🚨/⚠️/💡/📋 format.

Wait for the report.

### Step 6.5: Collect & normalize the Codex review (only when `codex=true`)

Skip when no Codex/agent job applies, or when `out=true`. Wait for each spawned background job (no poll/sleep). Collect `CF_CODEX` only when a Codex job was spawned; collect `CF_AGENT` only when agent jobs were spawned. On stderr: `ok <file>` → keep (normalize Codex with `bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/normalize-codex-review.sh" <file>`; agents are already CF-format); any other status → print the matching `> ⚠ …` warning from `references/external-reviewers.md` and drop that source. Never block — failures degrade to the in-session review.

### Step 6.7: Emit `--out` prompt file (only when `out=true`)

Write the in-session report to a temp file, then run the build-prompt pipeline (sets `CF_EMBED_CONTEXT_FILE` on the build stage). Show the report, then the "📝 Review Prompt Ready" panel and `> When all external agents finish, run /cf-review-in <label> to collect all results.`; skip Steps 7 and 10's banner.

### Step 7: Collect the report

Skip when `out=true`. No surviving externals → Step 6 is the final report (🚨/⚠️/💡/📋); use as-is. Else merge via Dispatch `cf-reviewer-reducer`. Source 1 — in-session review; each surviving external = Source K (normalized Codex; raw file for agents). Tag `[<Agent>]`. Same file:line + issue → one finding (highest severity). Use the merge in Step 10.

### Step 8: Mark review complete and display status

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

### Step 9: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns**, call `memory_store` with type `"fact"`, importance `3`, source `"auto-capture"`, plus title/description/tags/content. Skip routine reviews.

### Step 10: Final output

Display the cf-reviewer's report first, then append the appropriate banner. When any external source contributed, add a `· Reviewed by: <in-session> + …` suffix (e.g. `· Reviewed by: Claude + Codex + Gemini`). Label from `HOST` (capitalized); if no `HOST:` line, use `In-session AI` — do NOT hardcode `Claude`. Omit the suffix when only the in-session reviewer ran.

MUST: display the full report and the status banner in **one message**; do NOT split them.

Skip when `out=true`. One banner: `[✅ Code Review Complete | ⚠️ Review Complete — Action Needed]`

> Mode: **[QUICK|STANDARD|DEEP]** · No blocking issues found. `/cf-commit` when ready.

> Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** — resolve before commit. Fix now?
