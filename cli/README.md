# coding-friend-cli

CLI companion for the [coding-friend](https://github.com/dinhanhthi/coding-friend) plugin — a lean toolkit for disciplined engineering workflows with Claude Code.

## Requirements

- Node.js >= 18
- The [coding-friend plugin](https://github.com/dinhanhthi/coding-friend) installed in Claude Code

## Install

```bash
npm i -g coding-friend-cli
```

## Commands

```bash
cf install              # Install plugin (interactive scope chooser)
cf install --user       # Install at user scope (all projects)
cf install --global     # Same as --user
cf install --project    # Install at project scope (shared via git)
cf install --local      # Install at local scope (this machine only)
                        # 💡 Safe to run multiple times (idempotent).
cf uninstall            # Uninstall plugin (interactive scope chooser)
cf uninstall --user     # Uninstall from user scope (full cleanup)
cf uninstall --global   # Same as --user
cf uninstall --project  # Uninstall from project scope only
cf uninstall --local    # Uninstall from local scope only
                        # 💡 Interactive — asks for confirmation before acting.
cf disable             # Disable plugin (interactive scope chooser)
cf disable --user      # Disable at user scope (all projects)
cf disable --global    # Same as --user
cf disable --project   # Disable at project scope
cf disable --local     # Disable at local scope
                       # 💡 Plugin stays installed but won't load.
cf enable              # Re-enable plugin (interactive scope chooser)
cf enable --user       # Enable at user scope (all projects)
cf enable --global     # Same as --user
cf enable --project    # Enable at project scope
cf enable --local      # Enable at local scope
cf init              # Initialize workspace (interactive)
                     # 💡 You can run this anywhere, anytime.
cf config            # Manage Coding Friend configuration (interactive menu)
                     # 💡 Edit docsDir, language, learn settings, and more.
cf host [path]       # Build and serve learning docs at localhost:3333
                     # [path] is optional, default is `docs/learn`
cf mcp [path]        # Setup MCP server for LLM integration
                     # [path] is optional, default is `docs/learn`
                     # This prints a JSON config snippet to add to your client's MCP
cf permission              # Manage Claude Code permission rules (interactive)
cf permission --all        # Apply all recommended permissions without prompts
cf permission --user       # Save to user-level settings (~/.claude/settings.json)
cf permission --project    # Save to project-level settings (.claude/settings.local.json)
cf permission --all --user # Apply all recommended permissions to user settings
cf permission --refresh    # Refresh plugin script paths (after plugin update)
cf statusline        # Setup coding-friend statusline
cf update               # Update plugin + CLI + statusline
cf update --cli         # Update only the CLI (npm package)
cf update --plugin      # Update only the Claude Code plugin
cf update --statusline  # Update only the statusline
cf update --project     # Update plugin at project scope
cf update --local       # Update plugin at local scope
cf dev on [path]     # Switch to local plugin source for development
cf dev off           # Switch back to remote marketplace
cf dev status        # Show current dev mode (local or remote)
cf dev sync          # Sync local changes to cache (no version bump needed)
cf dev restart       # Reinstall local dev plugin (off + on)
cf dev update        # Update local dev plugin to latest version (off + on)
cf memory status     # Show memory system status and stats
cf memory search     # Search memories by keyword
cf memory list              # List all memories in current project
cf memory list --projects   # List all project databases with size and metadata
cf memory rm --project-id <id>  # Remove a specific project database
cf memory rm --all          # Remove all project databases
cf memory rm --prune        # Remove orphaned projects (source dir missing or 0 memories)
cf memory start-daemon  # Start memory daemon (enables Tier 2 search)
cf memory stop-daemon   # Stop memory daemon
cf memory rebuild    # Rebuild search index from markdown files
cf memory init       # Initialize SQLite backend (Tier 1) and import memories
cf memory mcp        # Show MCP server config for clients
cf session save      # Save current Claude Code session to docs/sessions/
cf session load      # Load a saved session from docs/sessions/
cf help              # Show all commands
```

## 🐳 CLI Development

To work on the CLI locally:

```bash
cd cli
npm install
npm run build
npm link            # Creates global symlink for `cf` binary
```

Now `cf` is available globally, pointing to your local source. After making changes:

```bash
npm run build       # Rebuild (no need to re-link)
npm run watch       # Auto-rebuild on file changes
```

For development without rebuilding:

```bash
npm run dev -- <command>   # e.g. npm run dev -- init
```

To unlink when done:

```bash
npm unlink -g coding-friend-cli
```

To check if `cf` is pointing to the local plugin source:

```bash
npm ls -g coding-friend-cli
# Result:
# /Users/thi/.nvm/versions/node/v22.21.1/lib
#└── coding-friend-cli@1.1.1 -> ./../../../../../git/coding-friend/cli
```

### Running tests

Tests are written with [Vitest](https://vitest.dev/) and live in `src/lib/__tests__/`.

```bash
cd cli

# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch
```

Current coverage: `lib/json.ts`, `lib/paths.ts`, `lib/exec.ts`.

## Publish CLI to npm

Publishing is automated via GitHub Actions (`.github/workflows/publish-cli.yml`). Push a tag with the `cli-v*` prefix to trigger it:

```bash
# Bump version in cli/package.json first, then tag and push
git tag cli-v1.2.3
git push origin cli-v1.2.3
```

The workflow will build, bundle, and publish to npm automatically (with provenance), then create a GitHub Release with the changelog for that version.

**Manual publish (if needed):**

```bash
cd cli
npm login              # Login if not already
npm publish            # Build + bundle + publish
```

`prepublishOnly` runs automatically: builds TypeScript → `dist/` and bundles libs from `lib/`.

- Bump `version` in `cli/package.json` before publishing
- First time or public package: `npm publish --access public`
- Package name: `coding-friend-cli` → users install with `npm i -g coding-friend-cli`

## License

MIT
