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
updated: 2026-09-17
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

- Empty `$ARGUMENTS` → all uncommitted changes (net `HEAD` → working tree; staged hunks counted once, not twice)
- File path → that file
- Commit range (e.g. `HEAD~3..HEAD`) → those commits
- Natural-language description (e.g. "the auth logic changes") → default uncommitted set, **focus** findings on that area
- `--deep` / `--quick` → force that mode (override auto-detection)

**Codex dual-review flag:**

- `--with-codex`/`--codex` → `codex=true`; else `review.withCodex` from config
- `--claude`/`--gemini`/`--cursor`/`--grok` → `agents=[…]`
- `--out` → `out=true` (exclusive with agent flags)
- Default target only — file path or commit range disables all external reviewers.
- Any of the three set → read `references/external-reviewers.md` now; it owns the target/host-match/exclusivity checks, Steps 2.5 and 6.5, and the `--out` pipeline. None set → skip that file entirely.

### Step 2: Gather the diff

Pass the Step 1 target explicitly and snapshot the scope once, so Step 3 and the reviewers reuse it (`<run-id>` = `<label>`-`<short-sha>`):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh" --snapshot-dir /tmp/coding-friend/review/<run-id>
```

Flags for the Step 1 target: default or natural-language → none (branch commits + uncommitted + untracked); file or directory path → `--uncommitted --path <path>` (repeatable); commit range → `--range <range>` (no untracked files). `--uncommitted` and `--range` are mutually exclusive.

**Exit `2` and exit `3` mean the same in Step 2 and Step 3.** Exit `2` = the scope is unusable (bad flag, invalid range, no git; or a missing, truncated, or mismatched snapshot) → stop, fix the scope, re-run: never continue as "no changes", never fall back to QUICK. Exit `3` = the scope is usable but incomplete (`SCOPE_COMPLETE=false`, i.e. something under `=== Excluded from review scope (NOT reviewed) ===` was unreadable) → continue, and carry that gap into the final report as uncovered scope, never as clean.

**Only you** write the snapshot (`diff.txt`, `metadata.txt`, `files.z`, `excluded.z`); reviewer agents only read it. If the script warns the snapshot dir is unusable, keep using this command's stdout and note the limitation in the Summary — a background reviewer must never request write permission.

**Flag parse:** `--out` → `out=true` (skip headless spawn/collect). `--claude`/`--gemini`/`--cursor`/`--grok` → `agents=[…]`. Skip a flag that matches `HOST` (do not spawn `--claude` when `HOST` is `claude`).

### Step 2.5: Spawn Codex review in the background (only when `codex=true`)

Skip unless `codex=true` or `agents` is non-empty, and always when `out=true`. Otherwise spawn each job in the background exactly as `references/external-reviewers.md` says (`## Codex scope`, `## Step 2.5 background`), hand over the Step 2 scope, do not inspect at spawn — go to Step 3 and collect in Step 6.5.

### Step 3: Assess change size

Measure the Step 2 snapshot — never a fresh `git diff`, or the depth could be decided on a scope the reviewers never see. Add `--quick` / `--deep` only when Step 1 saw that flag; if Step 2 warned the snapshot dir was unusable, pass the **same target flags** you gave `gather-diff.sh` instead:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh" --snapshot-dir /tmp/coding-friend/review/<run-id>
```

Script prints `KEY=value`: `FILES_CHANGED`, `LINES_CHANGED`, `SENSITIVE`, `CHANGED_FILES`, `SCOPE_COMPLETE`, `MODE_AUTO`, `MODE_FORCED`, `MODE`. Use `MODE` as-is and pass it on — the reviewer agents own what each mode means. Exit `2` / exit `3`: same rule as Step 2.

Auto-detection: **QUICK** ≤3 files AND ≤50 lines AND no sensitive paths · **STANDARD** 4–10 files OR 51–300 lines · **DEEP** >10 files OR >300 lines OR sensitive paths touched. `SENSITIVE > 0` → always DEEP. `--quick` on a sensitive change warns on stderr — repeat that limitation in the Summary and still apply the secrets/injection baseline.

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

In DEEP, send both dispatches in a **single message** so they run in parallel; `cf-reviewer-security` is a second perspective, not a handoff — `cf-reviewer` still owns security of the diff. Fold both reports into one set of four sections yourself, under `## Report contract`. A big diff never changes these counts: never dispatch one reviewer per file or per chunk.

**Resolve the per-job budget first.** `<N>` is `review.nativeTimeout` in seconds (default `600`), read local-over-global by the resolver the external runners use:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-with-timeout.sh" --config-timeout "${CF_CONFIG_FILE:-.coding-friend/config.json}" 600 nativeTimeout
```

stdout is `<N>`; `CF_TIMEOUT=warn` on stderr is informational (exit 0, `<N>` = 600). Exit `2` = the configured value is unusable → use `600` and say in the Summary that `review.nativeTimeout` was ignored. Never dispatch without a number.

Pass exactly this payload — data only. How to review, how to read a diff and how to budget itself are in the reviewer's own agent file; never restate them here:

> **Review mode:** [QUICK | STANDARD | DEEP]
>
> **Diff:** read `/tmp/coding-friend/review/<run-id>/diff.txt` (the Step 2 snapshot — every hunk exactly once, read-only). Missing → re-run `bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"` with the same flags.
>
> **Changed files:** [paths from Step 5 — paths only]
>
> **Plan:** [plan path — include this line only if the caller explicitly supplied a plan; otherwise omit it entirely]
>
> **Verification:** [test / typecheck / lint results you already have; omit if none]
>
> **Context:** [Step 4 memory hints, if any]
>
> **Large diff:** group the changed files by module, work the groups in order inside this one review, and list covered vs remaining groups in the Summary. Do not skip test files, config, or generated sources that carry a behavior change; check a generated mirror against its source or the build evidence instead of re-reading it line by line.
>
> **Deadline:** return your report within [`<N>` seconds — the number resolved above]. End the 📋 Summary with `Review status: COMPLETE` when you covered the whole scope you were given, or `Review status: PARTIAL — <what you did not reach>` when you did not.

Never paste the whole conversation or a full file tree into the prompt: the payload above is the whole context a reviewer gets, and it reads the snapshot itself.

#### Job lifecycle (bounded wait)

Before you dispatch, check what this host gives you: a **timed wait** (one you can bound, that returns control to you when the bound expires) and a **cancel** for a job still running. With neither, take the fallback below instead of dispatching.

Each dispatch is one job: `pending` → `running` → `complete` | `failed` | `timed_out`. Track per job, in this conversation — **job id** (reviewer name + dispatch order, e.g. `cf-reviewer#1`), **start time** (`date +%s` at dispatch), **deadline** (start time + `<N>` seconds, absolute, set once), **last result** (a report, a fragment, or nothing) and **coverage**, which is what the Summary's **Native coverage** reports: `complete` → that reviewer's own `COMPLETE` / `PARTIAL` self-report; `timed_out` → timed out, plus whatever it did cover before the deadline; `failed` → missing (nothing arrived) or unparseable (quote the raw fragment).

- **Wait in steps** of **at most 60s** when the host supports a timed wait; after every step compare elapsed time (`date +%s`) against the deadline and update the job's state. A host with a cancel but no timed wait: wait once, cancel at the deadline.
- **The deadline never moves.** A heartbeat, a progress message, a partial answer, or a re-dispatch **never resets the deadline** — it stays absolute from that job's first dispatch.
- **Budget spent** (still `running` at the deadline): ask that job for whatever it has as partial output, cancel it if this host can, mark it `timed_out`, and merge what arrived under `## Report contract`.
- **Never auto-respawn** a `timed_out` or `failed` job, and never retry in a way that can run forever: at most one re-dispatch per job, only when the first attempt returned nothing at all, and only inside the same deadline.
- **Never call shell `timeout` on a native dispatch.** `timeout` kills an external subprocess, which only applies to the external reviewers; a reviewer running inside this host is not a subprocess, so shell `timeout` would leave it running and the report wrong.

**Fallback — no timed wait and no cancel.** A dispatch is then a single call that never returns control until the reviewer itself stops, and a job like that **cannot be interrupted** by any instruction you write. Do not promise a hard deadline the prompt cannot enforce: skip the dispatch and run an **inline budgeted review** in this conversation from the start — same mode, same depth, same `## Report contract`, and in DEEP the security pass runs inline too, so the table above is unchanged as a graph and only its execution differs. Say so in the Summary: `Native coverage: inline budgeted review — this host has no timed wait and no cancel`.

This whole subsection is prompt-level: contract tests verify the instruction is present, while only a live run verifies that the host actually enforces the bound.

Wait for the report(s) under the lifecycle above.

### Step 6.5: Collect & normalize the Codex review (only when `codex=true`)

Skip when no Codex/agent job was spawned, or when `out=true`. Otherwise collect each one exactly as `references/external-reviewers.md` says (`## Step 6.5 Codex status`, `## Normalize mapping`, `## Step 6.5 agent status`): a bounded wait that each runner's own deadline ends, the result file read only after that job exited, `ok` kept and every other status dropped with that reference's `> ⚠ …` warning. Never block: failures degrade to the in-session review.

### Step 6.7: Emit `--out` prompt file (only when `out=true`)

Write the in-session report to a temp file, then run the build-prompt pipeline exactly as the external-reviewer reference gives it (`CF_EMBED_CONTEXT_FILE` belongs on the build stage, not as a pipeline-leading prefix). Show the report, then the "📝 Review Prompt Ready" panel and `> When all external agents finish, run /cf-review-in <label> to collect all results.`; skip Steps 7 and 10's banner.

The build stage caps the embedded diff at 5000 lines. When it prints `CF_PROMPT_SCOPE=subset` on stderr — the prompt frontmatter then carries `diff_truncated: true` — say so in the panel and in the Summary's **Uncovered scope**: whoever reviews that file sees a subset of this target, so it never counts toward native coverage.

### Step 7: Collect the report

Skip when `out=true`. In DEEP, fold the security reviewer's findings into the same four sections first, then apply `## Report contract` to the Summary: a reviewer knows nothing about Step 2/3's exit `3` or a scope that moved, so you set the aggregate status, native coverage, and uncovered scope. Any surviving external source merges in under the same contract — Source 1 is the in-session review, each external is Source K tagged `[<Agent>]` (normalized Codex; raw file for agents) — and a dropped one is a warning line in the Summary, never a status downgrade and never a stand-in for a missing native reviewer. Use the merge in Step 10.

### Step 8: Mark review complete and display status

The aggregate `Review status:` line in the 📋 Summary **is** the completion record — there is no marker file, and no consumer reads one. Before you display anything, check it once more: exactly one `Review status: COMPLETE | PARTIAL | FAILED` in the Summary, every Step 6 job accounted for under **Native coverage**. Missing, duplicated, or any other value → fix the report first, because `/cf-plan` and `/cf-tdd` autopilot stop on a status they cannot parse.

### Step 9: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns**, call `memory_store` with type `"fact"`, importance `3`, source `"auto-capture"`, plus title/description/tags/content. Skip routine reviews.

### Step 10: Final output

Display the cf-reviewer's report first, then append the appropriate banner. When any external source contributed, add a `· Reviewed by: <in-session> + …` suffix (e.g. `· Reviewed by: Claude + Codex + Gemini`). Label from `HOST` (capitalized); if no `HOST:` line, use `In-session AI` — do NOT hardcode `Claude`. Omit the suffix when only the in-session reviewer ran.

MUST: display the full report and the status banner in **one message**; do NOT split them.

Skip when `out=true`. Show `✅ Code Review Complete` only when the Summary says `Review status: COMPLETE`; PARTIAL or FAILED → the ⚠️ banner, naming the missing coverage — incomplete coverage is never reported as clean. One banner, one template:

> [✅ Code Review Complete | ⚠️ Review Complete — Action Needed]
>
> Mode: **[QUICK|STANDARD|DEEP]** · [No blocking issues found. `/cf-commit` when ready. | **[N] critical issue(s)** — resolve before commit. Fix now? | **Review status: [PARTIAL|FAILED]** — [missing coverage]. Re-run `/cf-review` on that scope before you commit.]

## Report contract

Every report you emit — one reviewer, two, or merged with external sources — uses the same four headings in this order: `### 🚨 Critical Issues`, `### ⚠️ Important Issues`, `### 💡 Suggestions`, `### 📋 Summary`. Empty finding sections show `None.` — zero findings is a valid result and a complete review.

### Summary fields

`### 📋 Summary` carries, in this order:

- **Scope reviewed** — target, mode, and the `<run-id>` snapshot the reviewers read.
- **Native coverage** — every reviewer Step 6 dispatched for the mode (DEEP = both) and how each one ended: complete, partial, timed out, missing, or unparseable.
- **External sources** — one line per external source: kept, or the warning that dropped it. Omit the field when none ran.
- **Uncovered scope** — what the reviewers did not reach, plus anything Step 2/3 excluded. `None.` when nothing is missing.
- A last line, exactly `Review status: COMPLETE | PARTIAL | FAILED` — one value, optionally followed by ` — <what is missing>`. Consumers read this line before they count findings: never reword it, never omit it, never put it anywhere but the Summary.

A report carries **exactly one `Review status:` line** — your aggregate. A reviewer's own status line, and an external source's, are folded into **Native coverage** / external sources and deleted from the merged Summary, so a consumer reading the first match cannot pick up a single reviewer's self-report.

### Status

- **COMPLETE** — every native reviewer dispatched for the mode returned a parseable report and self-reported `COMPLETE`, the snapshot was complete, the scope is not stale. **COMPLETE means the required native coverage finished — it does not mean there were no findings.**
- **PARTIAL** — a valid native report arrived but coverage is short: a dispatched reviewer self-reported `PARTIAL`, timed out, returned nothing or returned an unparseable report while another finished; or the scope was incomplete or stale.
- **FAILED** — no valid native report at all: the only dispatched reviewer went missing, timed out with nothing in hand, or returned an unparseable report.
- **Keep what arrived.** Findings a reviewer returned before it ran out of time stay in the report; a later timeout downgrades the status, never the findings already in hand.
- **Never drop unparseable output.** Quote the raw fragment in the Summary and mark it `(unverified)`. Unverified fragments are never promoted into Critical / Important / Suggestions, and never count as coverage.
- **An external source can never substitute for a missing native reviewer.** One that is unavailable, errored, empty or timed out is a warning line under external sources, and leaves the status unchanged when native coverage is otherwise sufficient.
- **Uncovered scope is never clean.** `scope_complete=false` — Step 2's or Step 3's exit `3` — surfaces as uncovered scope and a PARTIAL status.

### Scope staleness

Before emitting, compare `git rev-parse HEAD` and `git status --porcelain` for the changed files against `head_sha` and the file list in the snapshot `metadata.txt`. Moved during the review → the scope is stale: report `PARTIAL` and name the paths that changed. Re-review **at most once**, only those paths, and only after you have identified what changed — never loop while the tree keeps moving.

### Merge rules

**You** merge, inline, in this conversation: there is no merge agent on this path. The same rules apply to a second native reviewer in DEEP and to every external source:

- **Deduplicate only on the same `file:line` AND the same root cause.** Two different issues on the same line stay two findings.
- A merged finding keeps the **highest severity** any source gave it.
- **Record provenance** — tag each contributing source on the merged finding (`[Codex]`, `[Gemini]`, …); the in-session review needs no tag unless another source contributed.
- **Repetition is not evidence.** Several sources repeating the same speculation does not raise its confidence — keep the original score and still drop anything below 0.8.
