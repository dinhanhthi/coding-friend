---
name: cf-session
description: Save the current Claude Code conversation/session to docs/sessions/ so it can be resumed on another machine with `cf session load` + `claude --resume`
user-invocable: true
tools: [Bash, Read]
---

# /cf-session

Save the current Claude Code session to `docs/sessions/` so it can be restored on another machine.

Label: **$ARGUMENTS**

## Workflow

### Step 0: Load Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-session`

If output is not empty, integrate the returned sections:

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

The current project path is the working directory. Find the most recently modified session JSONL file:

```bash
CWD=$(pwd)
# Encode project path: replace / with -
ENCODED=$(echo "$CWD" | sed 's|/|-|g')
SESSION_DIR="$HOME/.claude/projects/$ENCODED"

if [ ! -d "$SESSION_DIR" ]; then
  echo "ERROR: No session directory found at $SESSION_DIR"
  exit 1
fi

# List JSONL files sorted by modification time (newest first), skip agent-* files
LATEST=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | grep -v '/agent-' | head -1)

if [ -z "$LATEST" ]; then
  echo "ERROR: No session files found in $SESSION_DIR"
  exit 1
fi

echo "Detected session: $LATEST"
SESSION_ID=$(basename "$LATEST" .jsonl)
echo "Session ID: $SESSION_ID"
```

If no session is found, report the error clearly and stop.

### Step 3: Get Session Label

If `$ARGUMENTS` is provided, use it as the label. Otherwise ask the user:

> "Give this session a label (or press Enter for default):"

Use the provided label, or default to `session-YYYY-MM-DD` using today's date.

### Step 4: Build Preview Text

Extract the first user message from the JSONL for preview:

```bash
PREVIEW=$(python3 -c "
import json, sys
try:
    with open('$LATEST') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if entry.get('type') == 'user':
                    msg = entry.get('message', {})
                    content = msg.get('content', '')
                    if isinstance(content, str) and content.strip():
                        print(content.strip()[:200])
                        sys.exit(0)
            except Exception:
                continue
    print('(preview unavailable)')
except Exception:
    print('(preview unavailable)')
" 2>/dev/null || echo "(preview unavailable)")
echo "Preview: $PREVIEW"
```

### Step 5: Save Session to Sessions Folder

```bash
SESSIONS_DIR="<from Step 1>"
LABEL="<from Step 3>"
SESSION_ID="<from Step 2>"
LATEST="<from Step 2>"
PROJECT_PATH=$(pwd)
MACHINE=$(hostname)
SAVED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

DEST_DIR="$SESSIONS_DIR/$SESSION_ID"
mkdir -p "$DEST_DIR"

# Copy JSONL
cp "$LATEST" "$DEST_DIR/session.jsonl"

# Write metadata
python3 -c "
import json
meta = {
    'sessionId': '$SESSION_ID',
    'label': '$LABEL',
    'projectPath': '$PROJECT_PATH',
    'savedAt': '$SAVED_AT',
    'machine': '$MACHINE',
    'previewText': $(python3 -c "import json; print(json.dumps('$PREVIEW'))")
}
with open('$DEST_DIR/meta.json', 'w') as f:
    json.dump(meta, f, indent=2)
print('meta.json written')
"
```

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
