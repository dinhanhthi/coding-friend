# For Developers

## CLI Development

Please refer to [cli/README.md](../cli/README.md) for CLI development.

## Plugin Development (local source)

### Prerequisites

```bash
git clone https://github.com/dinhanhthi/coding-friend.git
cd coding-friend
```

### Running the local plugin

Use the `--plugin-dir` flag to load the plugin directly from your local source:

```bash
claude --plugin-dir /path/to/coding-friend
```

This loads the plugin **for that session only** — no installation needed.

### If you already have coding-friend installed from the marketplace

When you use `--plugin-dir`, Claude Code loads **both** the marketplace-installed version and the local version, which causes conflicts (duplicate skills, hooks, agents). To avoid this, **disable the installed version first**:

```bash
# Disable the marketplace version
claude plugin disable coding-friend

# Now run with your local source
claude --plugin-dir /path/to/coding-friend
```

When you're done developing and want to switch back to the marketplace version:

```bash
claude plugin enable coding-friend
```

**Tip:** You can check which plugins are currently active:

```bash
claude plugin list
```

### Convenient alias

Add this to your `~/.zshrc` or `~/.bashrc` for quick access:

```bash
alias claude-dev="claude --plugin-dir /path/to/coding-friend"
```

Then just run `claude-dev` to start a session with your local plugin.

### What `--plugin-dir` does

- Points Claude Code to the `.claude-plugin/plugin.json` inside the specified directory
- Loads all skills, hooks, agents, and commands from the local source
- Changes you make to skills/hooks/agents are picked up on the **next session** (restart Claude Code to see changes)
- Does **not** modify your installed plugins — it's session-scoped only

### VSCode (Claude Code extension)

The VSCode extension does **not** support `--plugin-dir` directly. Use one of these approaches:

**Option 1: Use the CLI inside VSCode terminal (recommended for dev)**

Open the integrated terminal in VSCode and run:

```bash
claude --plugin-dir /path/to/coding-friend
```

This gives you the full CLI experience with your local plugin, right inside VSCode.

**Option 2: Use `cf dev` (recommended if you have the CLI installed)**

The `cf dev` command automates switching between local and remote plugin sources:

```bash
# Switch to local dev mode
cf dev on /path/to/coding-friend

# Check current mode
cf dev status

# Switch back to remote marketplace
cf dev off
```

This handles uninstalling, marketplace swap, and reinstalling automatically.

Changes require **restarting the extension** (reload VSCode window) to take effect.

**Option 3: Manual marketplace swap**

If you don't have the CLI, run the commands manually:

```bash
# Switch to local
claude plugin uninstall coding-friend
claude plugin marketplace remove coding-friend-marketplace
claude plugin marketplace add /path/to/coding-friend
claude plugin install coding-friend
```

Switch back to remote:

```bash
claude plugin uninstall coding-friend
claude plugin marketplace remove coding-friend-marketplace
claude plugin marketplace add https://github.com/dinhanhthi/coding-friend.git
claude plugin install coding-friend
```

