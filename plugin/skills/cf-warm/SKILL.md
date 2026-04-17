---
name: cf-warm
description: >
  Catch up after absence — summarize git history for a specific user. Use when a user
  returns after time away from a project and needs to understand what happened — e.g.
  "warm up", "catch me up", "what happened while I was away", "what did I work on",
  "summarize recent changes", "what changed since I left", "warm up the project".
user-invocable: true
argument-hint: "[--user <name>] [--n-commits <N>]"
---

# /cf-warm

Catch up after absence. User input: **$ARGUMENTS**

## Purpose

When you return to a project after being away (vacation, sick leave, context switch), you have no idea what happened. This skill summarizes your recent work and everything the team did since your last commit, grouped by topic/area, so you can quickly get back up to speed.

## Folder

Output goes to `{docsDir}/warm/` (default: `docs/warm/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

**IMPORTANT — path resolution:**

- Run `pwd` to get the current working directory — substitute its actual output wherever `$CWD` appears below (do NOT pass `$CWD` as a literal string)
- Only check `$CWD/.coding-friend/config.json` for `docsDir` — do NOT search sub-folders
- Always resolve `file_path` as an **absolute path**: `$CWD/{docsDir}/warm/{name}.md`
- Never use relative paths in write specs — they may resolve incorrectly when the working directory contains nested git repos

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-warm`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Validate & Configure

1. **Check git repo** — run `git rev-parse --is-inside-work-tree`. If it fails, tell the user: "This directory is not a git repository. `/cf-warm` only works inside git repos." and **STOP**.

2. **Read config** — check `$CWD/.coding-friend/config.json` for:
   - `docsDir` (default: `docs`)
   - `language` (default: `en`)

### Step 2: Resolve User & Arguments

Parse `$ARGUMENTS` for flags:

- `--user <name>` — git author name to look up. If not provided, auto-detect via `git config user.name`.
- `--n-commits <N>` — number of user's own commits to summarize (default: `10`).

If `--user` is not provided AND `git config user.name` returns empty, ask the user to provide a name with `--user`.

Store resolved values as `$USER_NAME` and `$N_COMMITS`.

Confirm to the user: "🟢 Warming up as **$USER_NAME**, looking at your last **$N_COMMITS** commits."

### Step 3: Dry Run — Count Commits

Before fetching full commit data, count how many commits we'll process:

```bash
# Get date of user's Nth commit (the cutoff point) — store as $SINCE_DATE
git log --author="$USER_NAME" -n $N_COMMITS --format="%aI" | tail -1

# Count OTHER commits by subtraction (git has no reliable --not-author flag)
# Total commits since date:
git log --after="$SINCE_DATE" --oneline | wc -l
# User's commits since date:
git log --after="$SINCE_DATE" --author="$USER_NAME" --oneline | wc -l
# Others = Total - User's
```

**Display the dry run result:**

> Showing your last **$N_COMMITS** commits.
> Found **Y** commits by others since $SINCE_DATE.

**Safety cap:** If Y > 200, warn the user:

> ⚠️ There are **Y** commits by others. I'll summarize the most recent **200** to keep the report manageable. Use a more recent `--n-commits` value to narrow the window.

If the user's name matches zero commits, display a helpful error:

> No commits found for author "$USER_NAME". Check `git config user.name` or use `--user "Exact Name"` to specify the correct author.

**STOP** if zero commits found for the user.

### Step 4: Gather Commit Data

**4a. User's commits** — fetch the last $N_COMMITS:

```bash
git log --author="$USER_NAME" -n $N_COMMITS --format="---commit---%nHash: %h%nDate: %ad%nSubject: %s%n%b" --date=short
```

This gives commit hash, date, subject line, and body (description). **Do NOT fetch diffs** — only use messages and descriptions.

**4b. Other commits** — fetch all commits since the user's cutoff date, then filter out the user:

```bash
git log --after="$SINCE_DATE" --format="---commit---%nHash: %h%nDate: %ad%nAuthor: %an%nSubject: %s%n%b" --date=short
```

From this output, **exclude commits where Author matches `$USER_NAME`** (the LLM filters by comparing the Author field). Apply the 200-commit safety cap on the remaining "other" commits if the dry run showed > 200.

### Step 5: Analyze & Cluster

**5a. Summarize user's commits:**

For each of the user's commits, write a brief 1-2 sentence summary based on the commit message and description. Group related commits together if they're part of the same feature/fix.

**5b. Cluster other commits by topic/area:**

Read through all other commit messages and group them into logical topics. Use the commit subjects and descriptions to infer the topic — **do NOT look at diffs** unless a commit message is too vague to classify.

Typical topic groups:

- Feature area (e.g., "Authentication", "API", "Frontend", "Database")
- Type of work (e.g., "Bug Fixes", "Refactoring", "Infrastructure", "Documentation")
- Module/package name (for monorepos)

For each topic group, write:

- **Topic name** (short, descriptive)
- **Summary** (2-3 sentences covering what changed)
- **Key commits** (list the most important 3-5 commits with hash + subject)
- **Authors** involved

Use the `language` setting from config for the report language.

### Step 6: Write Report & Display Summary

**6a. Delegate to cf-writer agent:**

Construct a write spec and invoke the cf-writer agent via the **Agent tool** with `subagent_type: "coding-friend:cf-writer"`.

```
WRITE SPEC
----------
task: create
file_path: $CWD/{docsDir}/warm/warm-YYYY-MM-DD.md
language: {language from config}
content: |
  ---
  title: "Warm-up: $USER_NAME — YYYY-MM-DD"
  description: "Catch-up report for $USER_NAME after absence, covering N own commits and M team commits"
  tags: [warm-up, git-history, catch-up]
  created: YYYY-MM-DD
  ---

  # Warm-up Report: $USER_NAME

  **Generated:** YYYY-MM-DD
  **Period:** $SINCE_DATE → today
  **Your commits:** $N_COMMITS | **Team commits:** $M

  ## Your Recent Work

  <Summarized user commits, grouped by feature/fix if related>

  ## What the Team Did

  ### <Topic 1>
  <Summary>
  - `abc1234` — commit subject (Author)
  - `def5678` — commit subject (Author)

  ### <Topic 2>
  <Summary>
  - ...

  ## Quick Orientation

  <2-3 bullet points highlighting the most impactful changes the user should be aware of>
readme_update: false
auto_commit: false
existing_file_action: create
```

**6b. Display terminal summary:**

After the file is written, display a concise summary directly in the terminal:

```
## 🔥 Warm-up Complete

**You ($USER_NAME):** <1-2 sentence summary of your work>

**Team highlights:**
- <Topic 1>: <one-line summary>
- <Topic 2>: <one-line summary>
- ...

**⚡ Key things to know:**
- <Most impactful change 1>
- <Most impactful change 2>

📄 Full report: {docsDir}/warm/warm-YYYY-MM-DD.md
```

### Step 7: Index in Memory

After the report is written, call `memory_store` MCP tool to index it:

- `title`: "Warm-up: $USER_NAME — YYYY-MM-DD"
- `description`: "Catch-up report after absence: N own commits, M team commits grouped by topic"
- `type`: "fact"
- `tags`: ["warm-up", "git-history", "catch-up", "$USER_NAME"]
- `content`: the full markdown content
- `importance`: 2
- `source`: "conversation"
- `index_only`: true

If MCP tools are unavailable, log a warning but do NOT fail — the file was already written.

Show the user a 2-line summary:

- **Markdown file:** `{docsDir}/warm/warm-YYYY-MM-DD.md` (created)
- **Memory DB:** indexed ✓ — or: MCP unavailable, file only

## Interpreting `$ARGUMENTS`

`$ARGUMENTS` is optional. It can contain:

- `--user <name>` — git author name (uses substring matching via `git log --author`)
- `--n-commits <N>` — number of user's own commits to show (default: 10)
- Free text is ignored (reserved for future use)

Examples:

- `/cf-warm` — auto-detect user, show last 10 commits
- `/cf-warm --user "John Smith"` — look up commits by John Smith
- `/cf-warm --n-commits 20` — show last 20 of your commits
- `/cf-warm --user "Jane" --n-commits 3` — Jane's last 3 commits

## Rules

- **Git only** — this skill requires a git repository. Stop immediately if not in one.
- **Messages only** — use commit messages and descriptions, NOT diffs. Only inspect actual changes if a commit message is too vague to understand.
- **Dry run first** — always count commits before fetching to warn about volume.
- **Safety cap** — maximum 200 "other" commits. If more exist, take the most recent 200 and note the truncation.
- **Respect language** — write the report in the configured `language` setting.
- **No duplicate reports** — each report gets a unique date-stamped filename. Multiple runs on the same day overwrite the same file.
- Be concise — summaries over exhaustive lists.
- Group related commits — don't list every commit individually if they're part of the same feature.
