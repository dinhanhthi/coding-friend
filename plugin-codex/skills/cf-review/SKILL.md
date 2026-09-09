---
name: cf-review
description: >
  Dispatch a multi-agent code review of the current changes and report Critical /
  Important / Suggestions / Summary. TRIGGER — "review this", "review my changes",
  "check the code", "code review", "any issues with this?", "review before merge",
  "review the diff"; reviewing specific files, commits, or branches;
  automatically after cf-plan, cf-fix, and cf-optimize complete. SKIP — reviewing
  a plan document (use $cf-plan-review), quick questions about how code works
  (use $cf-ask), and formatting-only changes.
created: 2026-02-17
updated: 2026-09-09
---

# $cf-review

> ✨ **CODING FRIEND** → $cf-review activated

Review the code changes for: **$ARGUMENTS**

## Auto-Triggered

Invoked by `$cf-plan` (after all tasks), `$cf-fix` (after verified fix), and `$cf-optimize` (after measured + verified).

## Workflow

### Step 0: Custom Guide

```!
bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review
```

If the block above printed anything, apply only the `## Before`, `## Rules`, and `## After` sections; if it shows the raw command instead of output, re-run that exact `load-custom-guide.sh` fence now.

### Step 1: Identify the target

- Empty `$ARGUMENTS` → all uncommitted changes (`git diff` + `git diff --staged`)
- File path → that file
- Commit range (e.g. `HEAD~3..HEAD`) → those commits
- Natural-language description (e.g. "the auth logic changes") → default uncommitted set, **focus** findings on that area
- `--deep` / `--quick` → force that mode (override auto-detection)

**Codex host behavior:**

- This skill already runs inside Codex. Ignore `--with-codex`, its `--codex` alias, and `review.withCodex`; do not launch a nested `codex review` subprocess.
- Run the Coding Friend multi-agent review below.

### Step 2: Gather the diff

```bash
bash "${PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
```

**Flag parse:** `--out` → `out=true` (skip headless spawn/collect). `--claude`/`--gemini`/`--cursor`/`--grok` → `agents=[…]`. Skip a flag that matches `HOST` (do not spawn `--claude` when `HOST` is `claude`).

### Step 3: Assess change size

```bash
bash "${PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh"
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

### Step 6.7: Emit `--out` prompt file (only when `out=true`)

Write the in-session report to a temp file, then run the build-prompt pipeline (sets `CF_EMBED_CONTEXT_FILE` on the build stage). Show the report, then the "📝 Review Prompt Ready" panel and `> When all external agents finish, run $cf-review-in <label> to collect all results.`; skip Steps 7 and 10's banner.

### Step 7: Collect the report

The result of Step 6 is the final formatted report (Critical / Important / Suggestions / Summary). Do not reformat or restructure it; use it as-is in Step 10.

### Step 8: Mark review complete and display status

```bash
bash "${PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

### Step 9: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns**, call `memory_store` with type `"fact"`, importance `3`, source `"auto-capture"`, plus title/description/tags/content. Skip routine reviews.

### Step 10: Final output

Display the cf-reviewer's report first, then append the appropriate banner.

MUST: display the full report and the status banner in **one message**; do NOT split them.

Skip when `out=true`. One banner: `[✅ Code Review Complete | ⚠️ Review Complete — Action Needed]`

> Mode: **[QUICK|STANDARD|DEEP]** · No blocking issues found. `$cf-commit` when ready.

> Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** — resolve before commit. Fix now?
