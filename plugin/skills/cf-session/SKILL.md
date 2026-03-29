---
name: cf-session
description: >
  Save the current Claude Code session to docs/sessions/ for cross-machine resume. Use when
  the user wants to save their session — e.g. "save this session", "I want to continue on
  another machine", "save my progress", "export this conversation", "sync this session",
  "bookmark this session". Pairs with `cf session load` + `claude --resume` on the target machine.
disable-model-invocation: true
model: haiku
tools: [Bash, Read]
---

# /cf-session

Save the current Claude Code session to `docs/sessions/` so it can be restored on another machine.

Label: **$ARGUMENTS**

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-session`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before Step 1
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Resolve Sessions Folder

Output goes to `{docsDir}/sessions/` (default: `docs/sessions/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

- Only check `$CWD/.coding-friend/config.json` for `docsDir` — do NOT search sub-folders
- Always resolve the sessions path as an **absolute path**: `$CWD/{docsDir}/sessions/`

Create the folder if it doesn't exist:

```bash
mkdir -p "$CWD/{docsDir}/sessions"
```

### Step 2: Detect Active Session

Run the detection script. It outputs two lines: the full JSONL path and the session ID.

```bash
CF_SESSION_SCRIPTS="${CLAUDE_PLUGIN_ROOT}/skills/cf-session/scripts"
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

Use the provided label, or default to `session-YYYY-MM-DD` using today's date.

### Step 4: Build Preview Text

Extract the first user message from the JSONL for preview:

```bash
CF_SESSION_SCRIPTS="${CLAUDE_PLUGIN_ROOT}/skills/cf-session/scripts"
PREVIEW=$(python3 "$CF_SESSION_SCRIPTS/extract-preview.py" "$LATEST")
echo "Preview: $PREVIEW"
```

### Step 5: Save Session to Sessions Folder

Run the save script with all values as arguments:

```bash
CF_SESSION_SCRIPTS="${CLAUDE_PLUGIN_ROOT}/skills/cf-session/scripts"
bash "$CF_SESSION_SCRIPTS/save-session.sh" \
  "$SESSIONS_DIR" "$SESSION_ID" "$LABEL" "$LATEST" "$PREVIEW"
```

This copies the JSONL and writes `meta.json` with session metadata. All values are passed as command-line arguments to avoid injection.

### Step 6: Confirm Success

Report to the user:

```
Session saved successfully.
  Label:   <label>
  ID:      <session-id>
  Folder:  <sessions-dir>/<session-id>/

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
