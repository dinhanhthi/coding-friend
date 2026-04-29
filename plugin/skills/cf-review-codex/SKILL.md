---
name: cf-review-codex
description: >
  Dispatch code review to the Codex (GPT) agent — a Codex-only variant of /cf-review.
  Use when the user wants Codex/GPT to review code instead of Claude — e.g.
  "review with codex", "codex review", "gpt review", "review this with codex",
  "cf-review-codex", "second-opinion review with codex", "ask codex to review",
  "let codex check this", "review my changes with codex", "run a codex code review".
  Requires the official Codex plugin for Claude Code and the `codex` CLI to be installed.
  Same input and output format as /cf-review (🚨 Critical / ⚠️ Important / 💡 Suggestions
  / 📋 Summary), but the actual review is run by GPT via Codex rather than by Claude
  specialist agents.
user-invocable: true
argument-hint: "[optional: file path, commit range, or focus description]"
---

# /cf-review-codex

> ✨ **CODING FRIEND** → /cf-review-codex activated

Review the code changes using **Codex (GPT)** for: **$ARGUMENTS**

## Purpose

`/cf-review` runs the review through Claude specialist agents. `/cf-review-codex` runs the
**same review workflow** but the actual reviewer is **GPT via the Codex plugin**. Use this
when you want a cross-engine perspective from a different model family — Codex often catches
issues Claude misses (and vice versa).

This is a **read-only review** — Codex does NOT write, edit, or apply patches.

The official Codex plugin lives at https://github.com/openai/codex-plugin-cc.

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review-codex`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Verify Codex availability

Run the bundled probe — it emits parseable `KEY=value` lines (same convention as
`assess-changes.sh`) and exits 0 even on failure so the workflow controls the branching:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review-codex/scripts/check-codex.sh"
```

Expected output:

```
CODEX_CLI=ok|missing
CODEX_AGENT=ok|missing
CODEX_READY=true|false
```

`CODEX_READY` is the single boolean to branch on:

- `CODEX_READY=true` → both the `codex` CLI and the `codex:codex-rescue` agent are
  reachable. Continue to Step 2.
- `CODEX_READY=false` → **stop the workflow** and emit the install banner from the
  "Codex unavailable" template at the bottom of this file. Use the specific
  `CODEX_CLI` / `CODEX_AGENT` fields to tell the user _which_ piece is missing.
  Do NOT fall back to Claude review — the user explicitly asked for Codex; if they
  want Claude, they should run `/cf-review`.

The probe checks the agent indirectly (well-known plugin paths plus `codex doctor`
when available). It is best-effort — Step 8's dispatch is the **authoritative** check.
If the probe says `ok` but Step 8's `Agent(subagent_type = "codex:codex-rescue", …)`
call still fails, treat it the same as `CODEX_READY=false` (use the failure banner).

### Step 2: Identify the target

- If `$ARGUMENTS` is empty, review all uncommitted changes (`git diff` + `git diff --staged`)
- If `$ARGUMENTS` is a file path, review that file
- If `$ARGUMENTS` is a commit range (e.g., `HEAD~3..HEAD`), review those commits
- If `$ARGUMENTS` is a natural language description (e.g., "the auth logic changes"), review all uncommitted changes but **focus the review** on the described area
- If `$ARGUMENTS` contains `--deep` or `--quick`, use that mode (override auto-detection)

### Step 3: Gather the diff

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
```

(Reuse the cf-review script — same diff-gathering logic.)

### Step 4: Assess change size + resolve effort

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh"
```

The script prints `KEY=value` lines: `FILES_CHANGED`, `LINES_CHANGED`, `SENSITIVE`, `CHANGED_FILES`, and `MODE`.

Mode-derived effort defaults:

| Mode         | Condition                                          | Default Codex effort | Behavior                                  |
| ------------ | -------------------------------------------------- | -------------------- | ----------------------------------------- |
| **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | `low`                | Skip context research                     |
| **STANDARD** | 4–10 files OR 51–300 lines                         | `medium`             | Full review                               |
| **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | `high`               | Data flow tracing, edge case walkthroughs |

If `SENSITIVE > 0`, always escalate to **DEEP**.

**Resolve effective effort** with config layering — local overrides global, same shape
as `cf-reviewer.md`'s Codex Dispatch:

```bash
LOCAL_CONFIG=".coding-friend/config.json"
GLOBAL_CONFIG="$HOME/.coding-friend/config.json"
EFFORT_OVERRIDE=""
if [ -f "$LOCAL_CONFIG" ]; then
  EFFORT_OVERRIDE=$(jq -r '.codex.effort // empty' "$LOCAL_CONFIG" 2>/dev/null)
fi
if [ -z "$EFFORT_OVERRIDE" ] && [ -f "$GLOBAL_CONFIG" ]; then
  EFFORT_OVERRIDE=$(jq -r '.codex.effort // empty' "$GLOBAL_CONFIG" 2>/dev/null)
fi
echo "EFFORT_OVERRIDE=${EFFORT_OVERRIDE}"
```

Final `EFFORT` = `EFFORT_OVERRIDE` if non-empty, else the mode default. Valid values:
`minimal`, `low`, `medium`, `high`, `xhigh`.

### Step 5: Gather context (conditional — based on review mode)

- **QUICK mode**: Skip this step entirely.
- **STANDARD mode**: Search memory only (if `memory_search` tool is available). Call `memory_search` with: `{ "query": "<area being reviewed>", "limit": 5 }`. Pass results as context hints.
- **DEEP mode**: Launch the **cf-explorer agent** (`subagent_type: "coding-friend:cf-explorer"`) to understand callers, dependencies, and data flows around the changed files.

Memory and explorer results are **hints** — Codex will verify against actual code.

### Step 6: Read changed files

Read changed files in full. Codex will receive both the diff and the full file content.

### Step 7: Build the Codex review prompt

Read the prompt template from `${CLAUDE_PLUGIN_ROOT}/agents/cf-reviewer-codex.md`. The
template body starts at the first `## Prompt Template` heading and runs to the end of
that file — the heading text is **load-bearing**; do not rename it.

Substitute placeholders:

- `{{MODE}}` → current review mode (QUICK / STANDARD / DEEP)
- `{{EFFORT}}` → the resolved effort from Step 4
- `{{DIFF}}` → the diff from Step 3
- `{{FILES}}` → full content of changed files from Step 6

The prompt template enforces:

- Read-only review (no writes, no patches)
- 4-section format (🚨 Critical / ⚠️ Important / 💡 Suggestions / 📋 Summary)
- `[L5: Codex]` layer tag on every finding
- File:line references and confidence scores
- Bullet lists only — never tables

### Step 8: Dispatch the codex:codex-rescue agent

`codex-rescue` is a thin forwarder that strips routing flags (`--effort`, `--model`,
`--write`, `--background`/`--wait`, `--resume`/`--fresh`) from the task text and only
applies them when the **user-visible request** explicitly says so. To actually move
the reasoning-effort knob, prepend an explicit instruction line **outside** the prompt
template body:

```
Use --effort {{EFFORT}}. This is a read-only review; do not enable --write.

<rendered prompt template body from Step 7>
```

Then dispatch via the **Agent tool**:

```
Agent(
  subagent_type = "codex:codex-rescue",
  prompt        = <the full text above — instruction line + rendered template>,
  run_in_background = false
)
```

Do NOT include `--background` or `--wait` in the prompt — let codex-rescue pick foreground
for bounded review work. The "do not enable --write" phrase routes codex-rescue's read-only
behavior; the prompt template's "Do NOT write, edit, or create any files" line is a
defense-in-depth instruction to GPT itself.

If the Codex agent call fails or times out:

- **Do not silently swallow the failure** — emit the failure banner (Step 12) with the
  error text from the agent.
- Do not retry automatically.
- Do not fall back to Claude review.

### Step 9: Collect the report

The result of Step 8 is the final review report from Codex. Use it as-is — the prompt
template already enforces the standard 4-section format with `[L5: Codex]` tags.

Do NOT reformat, reword, or add findings of your own.

### Step 10: Mark review complete

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

(Reuses the cf-review marker so downstream skills like `/cf-ship` see this branch as reviewed.)

### Step 11: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns** worth preserving, call `memory_store` with:

- type: `"fact"`
- importance: `3`
- source: `"auto-capture"`
- tags: include `"codex-review"`
- title/description/content summarizing the insight

Skip if the review was routine.

### Step 12: Final output

Display Codex's full report followed by the status banner in a **single message**.

**IMPORTANT**: The structured report and the banner MUST appear together in the same final response.

**If NO critical issues were found:**

```
╔══════════════════════════════════════════════════╗
║  ✅  Codex Review Complete                       ║
╚══════════════════════════════════════════════════╝
```

> Engine: **🤖 Codex (GPT)** · Mode: **[QUICK|STANDARD|DEEP]** · Effort: **[minimal|low|medium|high|xhigh]** · No blocking issues found.
>
> You're clear to commit. Run `/cf-commit` when ready.

**If critical issues were found:**

```
╔══════════════════════════════════════════════════╗
║  ⚠️  Codex Review Complete — Action Needed       ║
╚══════════════════════════════════════════════════╝
```

> Engine: **🤖 Codex (GPT)** · Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** must be resolved before committing.
>
> Resolve the critical issues listed above. Shall I help fix them now?

**If Codex was unavailable (Step 1 failed):**

```
╔══════════════════════════════════════════════════╗
║  ❌  Codex Unavailable                           ║
╚══════════════════════════════════════════════════╝
```

> Codex is not installed or not reachable. Specifically: `CODEX_CLI=<value>`, `CODEX_AGENT=<value>`.
>
> To install:
>
> 1. Codex CLI: https://github.com/openai/codex-plugin-cc#installation
> 2. Plugin: `/plugin marketplace add openai/codex-plugin-cc` then `/plugin install codex@openai-codex`
> 3. Verify: `/codex:setup`
>
> Once both are installed, retry `/cf-review-codex`. For Claude review now, run `/cf-review` instead.

**If the Codex dispatch in Step 8 failed at runtime:**

```
╔══════════════════════════════════════════════════╗
║  ❌  Codex Review Failed                         ║
╚══════════════════════════════════════════════════╝
```

> Codex was not reachable: <error reason>. No review was produced.
>
> Try again, or run `/cf-review` to use Claude specialists instead.

## Rules

- **Codex-only dispatch** — this skill always routes the review job to Codex. It never silently substitutes Claude specialists. The user picked the Codex variant on purpose.
- **Read-only** — both the codex-rescue routing flags (`do not enable --write`) and the prompt body (`Do NOT write, edit, or create any files`) must enforce this. Do not strip either.
- **Same format as /cf-review** — output uses the identical 🚨/⚠️/💡/📋 structure so downstream skills (e.g. `/cf-fix`) can parse either review.
- **Reuse cf-review scripts** — diff gathering, change assessment, and review-marker scripts are shared with `/cf-review` to keep behavior consistent.

## Relationship to other skills

- **`/cf-review`** — Claude-orchestrated multi-agent review (5 specialists + optional Codex 6th specialist when `codex.enabled=true`). The default review. If you want both engines in one pass, configure `/cf-review` and use it instead of running this skill alongside.
- **`/cf-review-codex`** (this skill) — Codex-only review for when you specifically want a GPT perspective on its own.
- **`/cf-review-out`** — Generate a self-contained review prompt for any external AI (Gemini, ChatGPT web, human reviewer). Manual/offline; this skill is automated via the Codex CLI.
- **`/cf-review-in`** — Collect results from an external AI review back into the workflow.
