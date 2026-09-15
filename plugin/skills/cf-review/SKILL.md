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
| **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | Layers L0/L2/L3/L4 — no plan alignment, no data-flow tracing.  |
| **STANDARD** | 4–10 files OR 51–300 lines                         | Full 5-layer review. All security phases, concise.             |
| **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | Full 5-layer + extended security. Data-flow tracing. Exploits. |

`SENSITIVE > 0` → always **DEEP**.

### Step 4: Gather context (conditional — based on review mode)

- **QUICK mode**: Skip.
- **STANDARD / DEEP mode**: If `memory_search` is available, call `{ "query": "<area — e.g. auth, API, database>", "limit": 5 }`. Hints only.

Memory results are **hints** — verify against code. Do **not** dispatch a separate context-gathering agent: each reviewer runs in isolated context and reads the callers, deps, and tests it actually needs.

### Step 5: List changed files

Collect the changed file paths from Step 2, including untracked ones (the `--- new file:` entries) — tag those `(new, untracked)`. Do **not** read or paste their contents — the reviewers read what they need themselves.

### Step 6: Dispatch the reviewer(s)

You dispatch every reviewer yourself, from this conversation. The graph is flat — one level, no grandchildren: a reviewer never dispatches anything, and there is no merge agent.

| Mode         | Dispatches | Agents                                 |
| ------------ | ---------- | -------------------------------------- |
| **QUICK**    | 1          | `cf-reviewer`                          |
| **STANDARD** | 1          | `cf-reviewer`                          |
| **DEEP**     | 2          | `cf-reviewer` + `cf-reviewer-security` |

In DEEP, send both dispatches in a **single message** so they run in parallel; `cf-reviewer-security` is a second perspective, not a handoff — `cf-reviewer` still owns security of the diff. Fold the two reports into one set of four sections yourself, under the rules in `## Report contract` below. A big diff never changes these counts: never dispatch one reviewer per file or per chunk.

Pass exactly this payload — nothing more:

> **Review mode:** [QUICK | STANDARD | DEEP]
>
> **Diff:** read `/tmp/coding-friend/review/<run-id>/diff.txt` (the Step 2 snapshot — covers committed, staged, unstaged, and untracked files, each hunk exactly once). If that file is missing, re-run `bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"` with the same flags. Read-only: do not write into the snapshot directory.
>
> **Changed files:**
> [paths from Step 5 — paths only]
>
> **Plan:** [plan path — include this line only if the caller explicitly supplied a plan; otherwise omit it entirely]
>
> **Verification:** [test / typecheck / lint results you already have; omit if none]
>
> **Context:** [Step 4 memory hints, if any]
>
> **Deadline:** return your report within 5 minutes. Nothing can cancel you once you start, so budget yourself: when the time is gone, report what you covered and name what you did not reach.
>
> **How to read:** start from the changed hunks — they are the scope. Open surrounding context, callers, or tests only to confirm or kill a specific hypothesis. For a large diff, group the changed files by module and work the groups in order inside this one review, then list covered vs remaining groups in the Summary. Do not skip test files, config, or generated sources when they carry a behavior change; check a generated mirror against its source or the build evidence instead of re-reading it line by line.
>
> Run the review now. Return the unified report in the 🚨/⚠️/💡/📋 format, and end the 📋 Summary with `Review status: COMPLETE` when you covered the whole scope you were given, or `Review status: PARTIAL — <what you did not reach>` when you did not.

Never paste the whole conversation or a full file tree into the prompt — the payload above is the whole context a reviewer gets, and it reads the snapshot itself.

Wait for the report(s).

### Step 6.5: Collect & normalize the Codex review (only when `codex=true`)

Skip when no Codex/agent job applies, or when `out=true`. Wait for each spawned background job (no poll/sleep). Collect `CF_CODEX` only when a Codex job was spawned; collect `CF_AGENT` only when agent jobs were spawned. On stderr: `ok <file>` → keep (normalize Codex with `bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/normalize-codex-review.sh" <file>`; agents are already CF-format); any other status → print the matching `> ⚠ …` warning from `references/external-reviewers.md` and drop that source. Never block — failures degrade to the in-session review.

### Step 6.7: Emit `--out` prompt file (only when `out=true`)

Write the in-session report to a temp file, then run the build-prompt pipeline (sets `CF_EMBED_CONTEXT_FILE` on the build stage). Show the report, then the "📝 Review Prompt Ready" panel and `> When all external agents finish, run /cf-review-in <label> to collect all results.`; skip Steps 7 and 10's banner.

### Step 7: Collect the report

Skip when `out=true`. In DEEP, fold the security reviewer's findings into the same four sections first. No surviving externals → that is the final report (🚨/⚠️/💡/📋); still apply `## Report contract` to its Summary — a reviewer knows nothing about Step 2/3's exit `3` or a scope that moved, so you set the aggregate status, native coverage, and uncovered scope. Else merge inline: Source 1 — in-session review; each surviving external = Source K (normalized Codex; raw file for agents). Tag `[<Agent>]`. Merge, status, and staleness rules: `## Report contract`. A dropped external is a warning line in the Summary — never a status downgrade, never a stand-in for a missing native reviewer. Use the merge in Step 10.

### Step 8: Mark review complete and display status

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

### Step 9: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns**, call `memory_store` with type `"fact"`, importance `3`, source `"auto-capture"`, plus title/description/tags/content. Skip routine reviews.

### Step 10: Final output

Display the cf-reviewer's report first, then append the appropriate banner. When any external source contributed, add a `· Reviewed by: <in-session> + …` suffix (e.g. `· Reviewed by: Claude + Codex + Gemini`). Label from `HOST` (capitalized); if no `HOST:` line, use `In-session AI` — do NOT hardcode `Claude`. Omit the suffix when only the in-session reviewer ran.

MUST: display the full report and the status banner in **one message**; do NOT split them.

Show `✅ Code Review Complete` only when the Summary says `Review status: COMPLETE`. PARTIAL or FAILED → use the ⚠️ banner and name the missing coverage; incomplete coverage is never reported as clean.

Skip when `out=true`. One banner: `[✅ Code Review Complete | ⚠️ Review Complete — Action Needed]`

> Mode: **[QUICK|STANDARD|DEEP]** · No blocking issues found. `/cf-commit` when ready.

> Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** — resolve before commit. Fix now?

> Mode: **[QUICK|STANDARD|DEEP]** · **Review status: [PARTIAL|FAILED]** — [missing coverage]. Re-run `/cf-review` on that scope before you commit.

## Report contract

Every report you emit — one reviewer, two, or merged with external sources — uses the same four headings in this order: `### 🚨 Critical Issues`, `### ⚠️ Important Issues`, `### 💡 Suggestions`, `### 📋 Summary`. Empty finding sections show `None.` — zero findings is a valid result and a complete review.

### Summary fields

`### 📋 Summary` carries, in this order:

- **Scope reviewed** — target, mode, and the `<run-id>` snapshot the reviewers read.
- **Native coverage** — every reviewer Step 6 dispatched for the mode (DEEP = both) and how each one ended: complete, partial, timed out, missing, or unparseable.
- **External sources** — one line per external source: kept, or the warning that dropped it. Omit the field when none ran.
- **Uncovered scope** — what the reviewers did not reach, plus anything Step 2/3 excluded. `None.` when nothing is missing.
- A last line, exactly `Review status: COMPLETE | PARTIAL | FAILED` — one value, optionally followed by ` — <what is missing>`. Consumers read this line before they count findings: never reword it, never omit it, never put it anywhere but the Summary.

A report carries **exactly one `Review status:` line** — your aggregate. A reviewer's own status line and an external source's, if any, are folded into **Native coverage** / external sources and deleted from the merged Summary, so a consumer reading the first match cannot pick up a single reviewer's self-report.

### Status

| Status       | When                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **COMPLETE** | Every native reviewer dispatched for the mode returned a parseable report and self-reported `COMPLETE`, the snapshot was complete, and the scope is not stale. **COMPLETE means the required native coverage finished — it does not mean there were no findings.**    |
| **PARTIAL**  | At least one valid native report arrived, but coverage is short: a dispatched native reviewer self-reported `PARTIAL`, timed out, returned nothing, or returned an unparseable report while another one finished; or the scope was incomplete; or the scope is stale. |
| **FAILED**   | No valid native report at all — the only dispatched reviewer went missing, timed out with nothing in hand, or returned an unparseable report.                                                                                                                         |

- **Keep what arrived.** Findings a reviewer returned before it ran out of time stay in the report; a later timeout downgrades the status, never the findings already in hand.
- **Never drop unparseable output.** Quote the raw fragment in the Summary and mark it `(unverified)`. Unverified fragments are never promoted into Critical / Important / Suggestions, and they never count as coverage.
- **An external source can never substitute for a missing native reviewer.** One that is unavailable, errored, empty, or timed out is a warning line under external sources and leaves the status unchanged when native coverage is otherwise sufficient — an optional external failure never downgrades sufficient native coverage.
- **Uncovered scope is never clean.** `scope_complete=false` — Step 2's or Step 3's exit `3` — surfaces as uncovered scope and a PARTIAL status.

### Scope staleness

Before emitting, compare `git rev-parse HEAD` and `git status --porcelain` for the changed files against `head_sha` and the file list in the snapshot `metadata.txt`. Moved during the review → the scope is stale: report `PARTIAL` and name the paths that changed. Re-review **at most once**, only those paths, and only after you have identified what changed — never loop while the tree keeps moving.

### Merge rules

**You** merge, inline, in this conversation: there is no merge agent on this path. The same rules apply to a second native reviewer in DEEP and to every external source:

- **Deduplicate only on the same `file:line` AND the same root cause.** Two different issues on the same line stay two findings.
- A merged finding keeps the **highest severity** any source gave it.
- **Record provenance** — tag each contributing source on the merged finding (`[Codex]`, `[Gemini]`, …); the in-session review needs no tag unless another source contributed.
- **Repetition is not evidence.** Several sources repeating the same speculation does not raise its confidence — keep the original score and still drop anything below 0.8.
