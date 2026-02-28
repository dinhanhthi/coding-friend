# For Developers

## CLI Development

Please refer to [cli/README.md](../cli/README.md) for CLI development.

### Running CLI tests

Tests are written with [Vitest](https://vitest.dev/) and live in `cli/src/lib/__tests__/`.

```bash
cd cli

# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch
```

Current coverage: `lib/json.ts`, `lib/paths.ts`, `lib/exec.ts`.

## Plugin Development (local source)

### Prerequisites

```bash
git clone https://github.com/dinhanhthi/coding-friend.git
cd coding-friend
```

### Running the local plugin

Use the `--plugin-dir` flag to load the plugin directly from your local source:

```bash
claude --plugin-dir /path/to/coding-friend/plugin
```

This loads the plugin **for that session only** — no installation needed.

### If you already have coding-friend installed from the marketplace

When you use `--plugin-dir`, Claude Code loads **both** the marketplace-installed version and the local version, which causes conflicts (duplicate skills, hooks, agents). To avoid this, **disable the installed version first**:

```bash
# Disable the marketplace version
claude plugin disable coding-friend

# Now run with your local source
claude --plugin-dir /path/to/coding-friend/plugin
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
alias claude-dev="claude --plugin-dir /path/to/coding-friend/plugin"
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
claude --plugin-dir /path/to/coding-friend/plugin
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

# Reinstall local dev plugin (useful when install state is broken)
cf dev restart
```

This handles uninstalling, marketplace swap, and reinstalling automatically.

Changes require **restarting the extension** (reload VSCode window) to take effect.

**When to use `cf dev restart`:**

If the install state becomes broken or out of sync (e.g. after a failed `cf dev off`), run:

```bash
cf dev restart
```

This is equivalent to `cf dev off && cf dev on` using the previously saved local path. If dev mode was already OFF, it skips the off step and just runs `cf dev on`.

**Why `cf dev on` alone is not enough:**

When you run `cf dev on`, Claude Code installs the plugin from your local source into a **versioned cache directory** (e.g. `~/.claude/plugins/cache/.../0.0.2`). From that point on, Claude Code reads all hooks, skills, and agents from that cache — not directly from your source files.

This means: **edits to your local source are invisible to Claude Code until the cache is updated.**

The naive fix is to bump the version in `plugin/.claude-plugin/plugin.json` and run `cf dev off && cf dev on` again. But that creates a new cache entry for every tiny change, pollutes version history, and takes ~10–15 seconds each time.

**`cf dev sync` solves this:**

```bash
# Edit code in local source
vi hooks/session-init.sh

# Push changes into the cache
cf dev sync

# Restart Claude Code → changes are live
```

It copies all files from your local source directly into the existing cache directory for the current version — no uninstall, no reinstall, no version bump. The whole cycle takes ~1 second.

**💎 Recommended dev workflow:**

```bash
# One-time setup
cf dev on /path/to/coding-friend

# Inner loop (repeat as many times as needed)
# 1. Edit files
# 2. cf dev sync
# 3. Restart Claude Code and test

# When feature is done — bump version once and commit
```

Skips `.git`, `node_modules`, `.claude`, and `.coding-friend` during sync.

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

