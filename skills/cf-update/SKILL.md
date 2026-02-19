---
name: cf-update
description: Update coding-friend plugin and refresh statusline
disable-model-invocation: true
---

# /cf-update

Update the coding-friend plugin to the latest version and refresh the statusline.

## Workflow

### Step 1: Record current version

Read `~/.claude/plugins/installed_plugins.json` and extract the current version of `coding-friend@coding-friend-marketplace`. Save this as `CURRENT_VERSION`.

Tell the user:
> Current version: **vCURRENT_VERSION**

### Step 2: Ask user to update the plugin

**Important:** `/plugin update` is a Claude Code CLI command, not a bash command. You cannot run it via Bash tool. Tell the user to run it themselves:

> Please run this command in Claude Code:
> ```
> /plugin update coding-friend@coding-friend-marketplace
> ```
> Then come back and say "done" so I can continue.

Wait for the user to confirm before proceeding.

### Step 3: Verify the update

After the user confirms, read `~/.claude/plugins/installed_plugins.json` again and extract the new version. Compare with `CURRENT_VERSION`:

- **If version changed:** Tell the user the new version and proceed to Step 4.
- **If version is the same:** The update may not have taken effect yet. Ask the user:
  > The version is still **vCURRENT_VERSION**. Would you like to:
  > 1. Restart Claude Code and try `/cf-update` again
  > 2. Skip — you're already on the latest version

  Do NOT proceed to Step 4 if the version hasn't changed.

### Step 4: Update the statusline

Only perform this step if the version has changed in Step 3.

1. Find the latest version folder:

```bash
ls ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/
```

Pick the latest version folder. Build the full path:
`~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<new-version>/hooks/statusline.sh`

2. Read `~/.claude/settings.json` to check the current `statusLine` field.

3. Update the `statusLine` field in `~/.claude/settings.json` to point to the new version path:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<new-version>/hooks/statusline.sh"
  }
}
```

**Rules:**
- Preserve all existing settings — only update the `statusLine` field
- Do NOT modify any other fields

### Step 5: Ask user to restart

Tell the user:
- Plugin updated: **vCURRENT_VERSION** → **vNEW_VERSION**
- Statusline refreshed to point to the new version
- **Restart Claude Code** (or start a new session) to see the changes
