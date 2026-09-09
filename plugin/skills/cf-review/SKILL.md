---
name: cf-review
description: >
  Dispatch code review to a subagent. Triggers: "review this", "review my changes", "check
  the code", "code review", "any issues with this?", "review before merge", "review the
  diff". Also for reviewing specific files, commits, or branches.
user-invocable: true
created: 2026-02-17
updated: 2026-09-09
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

- Empty `$ARGUMENTS` → all uncommitted changes (`git diff` + `git diff --staged`)
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

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
```

**Flag parse:** `--out` → `out=true` (skip headless spawn/collect). `--claude`/`--gemini`/`--cursor`/`--grok` → `agents=[…]`. Skip a flag that matches `HOST` (do not spawn `--claude` when `HOST` is `claude`).

### Step 2.5: Spawn Codex review in the background (only when `codex=true`)

Skip when no Codex/agent job applies, or when `out=true`. Label `YYYY-MM-DD-review`; `CF_DOCS_ROOT`. Background (do not wait; harness notifies). Run `run-codex-review.sh` only when `codex=true` and `out=false` (`--gemini` alone must NOT spawn Codex). Run `run-agent-review.sh` only when `agents` is non-empty and `out=false` (`--with-codex` alone must NOT run `run-agent-review.sh` with literal `<agent>`):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-codex-review.sh" ${CF_DOCS_ROOT}/reviews/<label>-result-codex.md
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-agent-review.sh" <agent> ${CF_DOCS_ROOT}/reviews/<label>-result-<agent>.md
```

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
- **DEEP mode**: Dispatch `cf-explorer`. Pass changed files; ask callers, deps, nearby conventions, related tests. cf-explorer searches memory itself — do NOT also call `memory_search`.

Memory and explorer results are **hints** — verify against code.

### Step 5: Read changed files

Read each changed file in full — not just the diff.

### Step 6: Dispatch the cf-reviewer agent

Dispatch `cf-reviewer`. Pass:

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
