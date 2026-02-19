---
name: cf-statusline
description: Setup coding-friend statusline in Claude Code
disable-model-invocation: true
---

# /cf-statusline

Setup the coding-friend statusline in Claude Code.

## Workflow

### Step 1: Find the plugin path

```bash
ls ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/
```

Pick the latest version folder. Build the full path:
`~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<latest-version>/hooks/statusline.sh`

### Step 2: Read current settings

Read `~/.claude/settings.json` to check if a `statusLine` field already exists.

### Step 3: Add or update statusLine

Add (or replace) the `statusLine` field in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<version>/hooks/statusline.sh"
  }
}
```

Use the actual version found in Step 1.

**Rules:**
- Preserve all existing settings — only add/update the `statusLine` field
- If a `statusLine` already exists, ask the user before overwriting
- Do NOT modify any other fields

### Step 4: Confirm

Tell the user:
- Statusline has been configured
- Restart Claude Code (or start a new session) to see it
- The statusline shows: plugin name, active model, and git branch
