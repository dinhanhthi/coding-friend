---
name: cf-plan-review
description: >
  Review a saved /cf-plan folder with a fresh reviewer before implementing; triggers "review the plan", "plan review", "second opinion on the plan", "check the plan before implementing", "cf-plan-review"; does NOT review code (use /cf-review).
user-invocable: true
argument-hint: "[plan] [--codex|--gemini|--claude|--cursor|--grok]"
model: opus
created: 2026-09-05
updated: 2026-09-05
---

# /cf-plan-review

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. Reads the plan folder and writes `review.md` directly; optional external reviewers are headless CLIs already on PATH. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

Review the plan: **$ARGUMENTS**

## Purpose

Review a saved `/cf-plan` folder (not application code) with a fresh, clean-context subagent of the host that is running this skill. Optionally add external reviewers in parallel. Write `review.md` into the plan folder, then offer to apply Critical/Important findings.

- Unlike `/cf-review`: that skill reviews a code diff. This skill reviews the plan document before implementation.
- Unlike `cf-reviewer-plan`: that agent compares implemented code against the plan. This skill checks the plan itself before any code is written.

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan-review
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Resolve the plan and flags

Read `docsDir` from `.coding-friend/config.json` (default: `docs`). Prefer `CF_DOCS_ROOT` from bootstrap (`$MAIN_REPO_ROOT/{docsDir}`).

**External reviewer flags:**

- Parse `--codex`, `--gemini`, `--claude`, `--cursor`, `--grok` (and `--with-<agent>` aliases) into `agents=[…]`; strip them from `$ARGUMENTS`.
- **Host-match no-op:** skip a matching flag only when a `HOST:` line exists **and** equals the flag (the flag matching the current host is skipped). Drop that agent and print:

  > ⚠ `--<host>` skipped: <Host> is already the in-session reviewer.

  No `HOST:` line or a different value → do **NOT** skip. When in doubt, run it.

What remains is `<plan>`.

If `<plan>` is empty: list folders in `{docsDir}/plans/` newest first (`ls -t`) and ask which plan to review using AskUserQuestion.

**Resolve the plan entry file** (same rules as `/cf-plan-resume`):

1. **Resolve the plan entry file**:
   - Full path to a folder → use `<folder>/README.md`. Full path to a file → use it directly. Validate the target is within the current working directory or `{docsDir}`; report error and stop if outside.
   - Name only (`<slug>`) → first, reject the argument outright if it contains `/`, `\`, or `..` (report: "Invalid plan name — slugs cannot contain path separators or `..`." and stop). This must happen BEFORE constructing any candidate path, since the candidates below are built by directly interpolating `<slug>` — a slug containing `../` would otherwise escape `{docsDir}/plans/`. Once the slug passes this check, resolve in this order, using the first that exists: `{docsDir}/plans/<slug>/README.md` (current layout) → `{docsDir}/plans/<slug>.md` (legacy single-file) → `{docsDir}/plans/<slug>` (append `.md` if it is a bare file).
   - If none found → report error and stop.

Read `README.md`, every `phase-N-*.md`, and `brief.md` when present. If `brief.md` is missing, print:

> ℹ️ No brief.md — reviewing README.md and phase files only.

### Step 2: Build the review prompt

```bash
mkdir -p "${CF_DOCS_ROOT}/reviews" && \
  bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-plan-review/scripts/build-plan-review-prompt.sh" \
    <entry-file> <docsDir> \
  > "${CF_DOCS_ROOT}/reviews/<slug>-plan-prompt.md"
```

### Step 3: Spawn external reviewers (only when agents non-empty)

Skip when `agents=[]`.

For each agent, spawn one background Bash. Do **not** wait; the harness reports when each finishes. No poll/sleep.

```
run_in_background: true
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-agent-review.sh" <agent> "${CF_DOCS_ROOT}/reviews/<slug>-plan-result-<agent>.md" "${CF_DOCS_ROOT}/reviews/<slug>-plan-prompt.md"
```

Proceed immediately to Step 4.

### Step 4: In-session review

Use the **Agent tool** with a fresh subagent. Do **not** set `context: fork`. Do **not** pass a `subagent_type`. A fresh default-type subagent inherits this skill's model.

Prompt = the contents of `${CF_DOCS_ROOT}/reviews/<slug>-plan-prompt.md`, plus:

- Spot-check the repo read-only (Read / Glob / Grep). Do not run verify steps. Do not edit files.
- Return exactly the four sections: 🚨 Critical Issues / ⚠️ Important Issues / 💡 Suggestions / 📋 Summary.

Call this result **Source 1**.

### Step 5: Collect external results

Skip when `agents=[]` at spawn time.

Wait for each agent (harness notify — no polling). Read the `CF_AGENT=` line on stderr:

- `ok` → keep the result file.
- `unavailable` → print `> ⚠ <Agent> CLI not found — proceeding without it.` Drop it.
- `timeout` → print `> ⚠ <Agent> review timed out (>Ns) — proceeding without it.` Drop it. (N = `review.agentTimeout`, default 300.)
- `error` → print `> ⚠ <Agent> review failed — proceeding without it.` Drop it.
- `empty` → print `> ⚠ <Agent> returned empty output — proceeding without it.` Drop it.

Never block on an external reviewer — failures degrade gracefully.

### Step 6: Merge

**When no external source survived:** use Source 1 as-is. Do not reformat.

**When any external source survived:** merge via **cf-reviewer-reducer** (Agent tool, `subagent_type: "coding-friend:cf-reviewer-reducer"`). Source 1 is the in-session report; each surviving external review is a numbered source:

> Merge these review reports into one unified, deduplicated, severity-ranked report.
>
> **Source 1 — in-session plan review:**
> [the full report from Step 4]
>
> **Source K — \<Agent\> review:** (for each surviving external source)
> [raw result file]
>
> Tag each external finding with `[\<Agent\>]` (codex → `[Codex]`, gemini → `[Gemini]`, etc.). Same file:line + same issue → one finding (highest severity) and note agreement. Output 🚨/⚠️/💡/📋.

End the merged report with a banner suffix when any external source contributed:

`· Reviewed by: <in-session label from HOST> + <Agents>`

Label from `HOST` (capitalized); if no `HOST:` line, use `In-session AI`. Omit the suffix when only the in-session reviewer ran.

### Step 7: Save review.md

Write (overwrite on re-run) `{plan-folder}/review.md` with frontmatter `slug`, `date`, `type: plan-review`, `reviewed_by`, then the 4-section report.

Legacy single-file plan → `{docsDir}/plans/<slug>-review.md`.

Delete `${CF_DOCS_ROOT}/reviews/<slug>-plan-prompt.md`. Keep `*-plan-result-*.md` and `.log` sidecars.

### Step 8: Offer to apply findings

If any 🚨 or ⚠️ findings exist, ask with AskUserQuestion: "Apply Critical/Important findings to the plan?"

If the user agrees, edit `README.md` / `phase-N-*.md` yourself (do **not** dispatch cf-implementer). For a legacy single-file plan, edit `<slug>.md`.

**MUST guardrails:**

- Apply only 🚨 Critical and ⚠️ Important findings.
- Never touch `✅ DONE` rows.
- Never touch frontmatter (`slug` / `auto` / `status`).
- Never touch the `## AUTOPILOT` block.
- New tasks are added as `⬜ TODO` rows in Progress **and** numbered entries in Tasks.
- If a finding adds or changes files and `{docsDir}/context/<slug>.json` exists, update its `relevant_files`.

💡 Suggestions are listed only — do not apply them.

After applying (or if the user declines / nothing to apply), print a short summary and:

- Plan already has progress → `> Next: /cf-plan-resume <slug>`
- Plan not yet in execution → remind the user to return to `/cf-plan` Step 7.

## Completion Protocol

- **DONE** — Review saved to `review.md`. Show the 4-section report.
- **DONE_WITH_CONCERNS** — Review saved but 🚨 findings remain unapplied.
- **BLOCKED** — Could not resolve the plan (invalid slug, path outside cwd/`{docsDir}`, or no matching plan).

## Rules

- Do not edit application code. This skill reviews plans, not diffs.
- Do not run verify steps. Reviewers spot-check existence only (files / functions / commands named in tasks).
- Do not review a code diff — send the user to `/cf-review`.
- External reviewers always run sandboxed read-only.
- Never block because an external reviewer is unavailable, timed out, errored, or empty.
- Keep wording host-neutral: the flag matching the current host is skipped; the in-session label comes from `HOST:`.
