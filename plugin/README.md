# coding-friend plugin

Claude Code plugin for disciplined engineering workflows.

## Development Setup

```bash
git clone https://github.com/dinhanhthi/coding-friend.git
cd coding-friend
```

## Option 1: `--plugin-dir` (CLI only)

Load the plugin directly from source — no installation needed:

```bash
claude --plugin-dir /path/to/coding-friend/plugin
```

This is session-scoped: it loads skills, hooks, agents, and commands from the local directory, picks up changes on next session restart, and does not modify installed plugins.

> **Conflict warning:** If coding-friend is already installed from the marketplace, disable it first to avoid duplicates:
>
> ```bash
> claude plugin disable coding-friend   # before dev
> claude plugin enable coding-friend    # after dev
> ```

**Tip:** Add an alias for quick access:

```bash
alias claude-dev="claude --plugin-dir /path/to/coding-friend/plugin"
```

## Option 2: `cf dev` (CLI + VSCode)

The `cf dev` command (from `coding-friend-cli`) automates switching between local and marketplace sources. Works with both CLI and VSCode extension.

```bash
cf dev on /path/to/coding-friend    # switch to local
cf dev off                          # switch back to marketplace
cf dev status                       # check current mode
cf dev restart                      # reinstall (fixes broken state)
cf dev sync                         # push local edits into cache
```

Changes require restarting Claude Code (or reloading VSCode window).

### Why `cf dev sync` matters

`cf dev on` installs the plugin into a versioned cache (`~/.claude/plugins/cache/.../0.1.0`). After that, Claude Code reads from the cache — not your source files. Edits are invisible until the cache is updated.

`cf dev sync` copies your source directly into the cache without reinstalling or bumping versions (~1 second).

✨ When the plugin is bumped to a new version, run `cf dev restart` to update the cache to the latest version.

✨ **Recommended workflow:**

```bash
cf dev on /path/to/coding-friend    # one-time setup

# Inner loop:
# 1. Edit files
# 2. cf dev sync
# 3. Restart Claude Code and test

# When done — bump version once and commit
```

Skips `.git`, `node_modules`, `.claude`, and `.coding-friend` during sync.

## Option 3: Manual marketplace swap

If you don't have the CLI:

```bash
# Switch to local
claude plugin uninstall coding-friend
claude plugin marketplace remove coding-friend-marketplace
claude plugin marketplace add /path/to/coding-friend
claude plugin install coding-friend
```

```bash
# Switch back to remote
claude plugin uninstall coding-friend
claude plugin marketplace remove coding-friend-marketplace
claude plugin marketplace add https://github.com/dinhanhthi/coding-friend.git
claude plugin install coding-friend
```
