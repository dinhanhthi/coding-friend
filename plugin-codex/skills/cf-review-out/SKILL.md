---
name: cf-review-out
description: >
  Generate a review prompt for an external AI agent. Creates a self-contained document
  that any AI (Gemini, Codex, ChatGPT, or even a human) can read and use to review your
  code changes. Use when the user wants an outside review — e.g. "get a second opinion",
  "external review", "review out", "send for review", "cf-review-out", "outside review",
  "prepare review for gemini", "review prompt".
created: 2026-03-23
updated: 2026-06-06
---

# $cf-review-out

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

Generate a review prompt for an external agent: **$ARGUMENTS**

## Purpose

Creates a complete, self-contained review document in `docs/reviews/` that any external AI agent or human reviewer can read and act on. The prompt includes the full diff, review criteria, output format instructions, and where to save results. Pair with [`$cf-review-in`](/docs/skills/cf-review-in/) to collect results.

> **Using Codex?** Run `$cf-review` directly. The review-out/review-in round trip remains available for other external reviewers or humans.

## Workflow

### Step 0: Custom Guide

Run: `bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review-out`

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Determine the label

If `$ARGUMENTS` contains a label, use it directly. Otherwise:

- Analyze the current changes (branch name, changed files, nature of changes)
- **Auto-generate a label** in snake-case with a prefix: `fix-`, `improve-`, `feature-`, `refactor-`, `security-`
- **No confirmation needed. Proceed immediately.**

The label must be snake-case with a descriptive prefix.

### Step 2: Check for existing review

Check if `<docsDir>/reviews/YYYY-MM-DD-<label>-prompt.md` already exists (new format) OR `<docsDir>/reviews/<label>-prompt.md` (legacy format). If either exists, warn the user and ask whether to overwrite or pick a different label.

### Step 3: Gather diff and build prompt

Read the docsDir from `.coding-friend/config.json` (default: `docs`).

Construct the **full label** by prepending today's date: `YYYY-MM-DD-<label>` (e.g., `2026-05-03-fix-auth-bypass`). Use this full label everywhere from this point on — as the script argument, the output filename, and in the reviewer instructions.

```bash
mkdir -p <docsDir>/reviews && \
  bash "${PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh" | \
  bash "${PLUGIN_ROOT}/skills/cf-review-out/scripts/build-review-prompt.sh" \
    "YYYY-MM-DD-<label>" "<docsDir>" \
  > <docsDir>/reviews/YYYY-MM-DD-<label>-prompt.md
```

If the script exits with an error (empty diff), tell the user there are no changes to review and **STOP**.

### Step 4: Confirm and guide the user

Show the user:

```
╔══════════════════════════════════════════════════╗
║  📝  Review Prompt Ready                         ║
╚══════════════════════════════════════════════════╝
```

> **Label:** `YYYY-MM-DD-<label>`
> **Prompt file:** `<docsDir>/reviews/YYYY-MM-DD-<label>-prompt.md`
> **Results expected at:** `<docsDir>/reviews/YYYY-MM-DD-<label>-result-<service>.md`

Then show a **copy-paste ready prompt** that the user can paste directly into any external AI agent:

> **Copy and paste this to your external agent:**
>
> ```
> Read the file <docsDir>/reviews/YYYY-MM-DD-<label>-prompt.md in this project. It contains a complete code review request with the diff, review criteria, and output format. Follow the instructions exactly: review the code changes, then write your findings to <docsDir>/reviews/YYYY-MM-DD-<label>-result-<service>.md in the format specified in the prompt. Replace <service> with your name (e.g., gemini, chatgpt, codex, cursor, copilot).
> ```

Replace `<docsDir>` and `<label>` with the actual values. The prompt must be a single, complete instruction that works when pasted into any AI agent (Gemini, Codex, ChatGPT, Cursor, etc.) that has access to the project files.

Finally, remind the user:

> When all external agents finish, run `$cf-review-in YYYY-MM-DD-<label>` to collect all results.
