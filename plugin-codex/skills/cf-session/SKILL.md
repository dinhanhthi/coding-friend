---
name: cf-session
description: >
  Save the current Claude Code session to docs/sessions/ for cross-machine resume. Use when
  the user wants to save their session — e.g. "save this session", "I want to continue on
  another machine", "save my progress", "export this conversation", "sync this session",
  "bookmark this session". Pairs with `cf session load` + `claude --resume` on the target machine.
disable-model-invocation: true
model: haiku
allowed-tools: [Bash, Read]
created: 2026-03-05
updated: 2026-06-06
state: beta
---

# $cf-session

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

Save the current Claude Code session to `docs/sessions/` so it can be restored on another machine.

Label: **$ARGUMENTS**

## Workflow

### Step 0: Custom Guide

Run: `bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-session`

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Resolve Sessions Folder

Output goes to `{docsDir}/sessions/` (default: `docs/sessions/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

- Use `MAIN_REPO_ROOT` from the SessionStart bootstrap context (injected via session-init.sh). If absent, fall back to running `pwd` for `$CWD` and use `$CWD` as `MAIN_REPO_ROOT`.
- Read config from `CF_CONFIG_FILE` (= `$MAIN_REPO_ROOT/.coding-friend/config.json`) — do NOT search sub-folders
- Use `CF_DOCS_ROOT` as the docs base dir (= `$MAIN_REPO_ROOT/{docsDir}` where `docsDir` comes from config, default `docs`)
- Always resolve the sessions path as an **absolute path**: `{CF_DOCS_ROOT}/sessions/`

Create the folder if it doesn't exist:

```bash
mkdir -p "{CF_DOCS_ROOT}/sessions"
```

### Step 2: Detect Active Session

Run the detection script. It outputs two lines: the full JSONL path and the session ID.

```bash
CF_SESSION_SCRIPTS="${PLUGIN_ROOT}/skills/cf-session/scripts"
OUTPUT=$(bash "$CF_SESSION_SCRIPTS/detect-session.sh")
LATEST=$(echo "$OUTPUT" | head -1)
SESSION_ID=$(echo "$OUTPUT" | tail -1)
echo "Detected session: $LATEST"
echo "Session ID: $SESSION_ID"
```

If the script exits with an error, report it clearly and stop.

### Step 3: Get Session Label

If `$ARGUMENTS` is provided, use it as the label. Otherwise ask the user:

> "Give this session a label (or press Enter for default):"

Use the provided label, or default to `YYYY-MM-DD-session` using today's date.

> **Note:** Existing sessions saved with the old `session-YYYY-MM-DD` folder naming continue to work — no migration needed.

### Step 4: Build Preview Text

Extract the first user message from the JSONL for preview:

```bash
CF_SESSION_SCRIPTS="${PLUGIN_ROOT}/skills/cf-session/scripts"
PREVIEW=$(python3 "$CF_SESSION_SCRIPTS/extract-preview.py" "$LATEST")
echo "Preview: $PREVIEW"
```

### Step 5: Save Session to Sessions Folder

Run the save script with all values as arguments. The script slugifies the label and uses it as the folder name (not the session UUID):

```bash
CF_SESSION_SCRIPTS="${PLUGIN_ROOT}/skills/cf-session/scripts"
FOLDER_NAME=$(bash "$CF_SESSION_SCRIPTS/save-session.sh" \
  "$SESSIONS_DIR" "$SESSION_ID" "$LABEL" "$LATEST" "$PREVIEW")
echo "Saved to folder: $FOLDER_NAME"
```

This copies the JSONL and writes `meta.json` with session metadata (including `sessionId` for `claude --resume`). All values are passed as command-line arguments to avoid injection.

### Step 6: Confirm Success

Report to the user:

```
Session saved successfully.
  Label:   <label>
  Folder:  <sessions-dir>/<folder-name>/
  ID:      <session-id>

To resume on another machine:
  1. Sync this project's docs/sessions/ folder (git, Dropbox, etc.)
  2. Run: cf session load
  3. Then: claude --resume <session-id>
```

## Rules

- Always show the detected session path in Step 2 so the user can confirm it's the right one
- If `$ARGUMENTS` is provided, use it directly as the label — do NOT ask again
- Never overwrite an existing session in the sessions folder without asking
- If python3 is not available, use a fallback JSON write with bash/echo for meta.json
