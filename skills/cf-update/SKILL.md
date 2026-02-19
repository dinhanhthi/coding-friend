---
name: cf-update
description: Update coding-friend plugin and refresh statusline
disable-model-invocation: true
---

# /cf-update

Update the coding-friend plugin to the latest version and refresh the statusline.

## Workflow

### Step 1: Gather version info

Collect three pieces of information:

1. **CURRENT_VERSION**: Read `~/.claude/plugins/installed_plugins.json` and extract the version of `coding-friend@coding-friend-marketplace`.

2. **LATEST_VERSION**: Fetch the latest release tag from GitHub. Try `gh` first, fall back to `curl`:

```bash
gh api repos/dinhanhthi/coding-friend/releases/latest --jq '.tag_name' 2>/dev/null || curl -s https://api.github.com/repos/dinhanhthi/coding-friend/releases/latest | jq -r '.tag_name'
```

Strip the leading `v` if present (e.g. `v1.3.0` → `1.3.0`). If both fail (no internet, rate limited, etc.), tell the user you cannot check the latest version and ask them to verify manually at https://github.com/dinhanhthi/coding-friend/releases

3. **STATUSLINE_VERSION**: Read `~/.claude/settings.json` and extract the version from the `statusLine.command` path. The path looks like:
`bash ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<version>/hooks/statusline.sh`

Extract `<version>` from that path. If no `statusLine` field exists, set to `none`.

Tell the user:
> - Installed version: **vCURRENT_VERSION**
> - Latest version: **vLATEST_VERSION**
> - Statusline version: **vSTATUSLINE_VERSION** (or "not configured")

### Step 2: Decide what to do

Compare the versions:

**Case A — Already up to date and statusline matches:**
If `CURRENT_VERSION == LATEST_VERSION` and `STATUSLINE_VERSION == CURRENT_VERSION`:
> You're on the latest version (**vCURRENT_VERSION**). No update needed.

Stop here.

**Case B — Already up to date but statusline mismatched:**
If `CURRENT_VERSION == LATEST_VERSION` but `STATUSLINE_VERSION != CURRENT_VERSION`:
> Plugin is up to date (**vCURRENT_VERSION**), but your statusline points to **vSTATUSLINE_VERSION**. Updating statusline now...

Skip to Step 4.

**Case C — Update available:**
If `CURRENT_VERSION != LATEST_VERSION`:
> Update available: **vCURRENT_VERSION** → **vLATEST_VERSION**

Proceed to Step 3.

### Step 3: Ask user to update the plugin

**Important:** `/plugin update` is a Claude Code CLI command, not a bash command. You cannot run it via Bash tool. Tell the user to run it themselves:

> Please run this command in Claude Code:
> ```
> /plugin update coding-friend@coding-friend-marketplace
> ```
> Then come back and say "done" so I can continue.

Wait for the user to confirm before proceeding.

After the user confirms, read `~/.claude/plugins/installed_plugins.json` again and extract the new version. Compare with `CURRENT_VERSION`:

- **If version changed:** Tell the user the new version and proceed to Step 4.
- **If version is the same:** The update may not have taken effect yet. Ask the user:
  > The version is still **vCURRENT_VERSION**. Would you like to:
  > 1. Restart Claude Code and try `/cf-update` again
  > 2. Skip the update

  Do NOT proceed to Step 4 if the version hasn't changed.

### Step 4: Update the statusline

Only perform this step if:
- The plugin version changed in Step 3, OR
- The statusline version was mismatched (Case B in Step 2)

1. Find the latest version folder:

```bash
ls ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/
```

Pick the latest version folder. Build the full path:
`~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<version>/hooks/statusline.sh`

2. Read `~/.claude/settings.json` and update the `statusLine` field to point to the correct version path:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<version>/hooks/statusline.sh"
  }
}
```

**Rules:**
- Preserve all existing settings — only update the `statusLine` field
- Do NOT modify any other fields

### Step 5: Ask user to restart

Tell the user:
- What changed (plugin updated and/or statusline refreshed)
- **Restart Claude Code** (or start a new session) to see the changes
