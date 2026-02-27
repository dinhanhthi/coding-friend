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
cf init              # Initialize workspace (interactive)
                     # 💡 You can run this anywhere, anytime.
cf host [path]       # Build and serve learning docs at localhost:3333
                     # [path] is optional, default is `docs/learn`
cf mcp [path]        # Setup MCP server for LLM integration
                     # [path] is optional, default is `docs/learn`
                     # This prints a JSON config snippet to add to your client's MCP
cf statusline        # Setup coding-friend statusline
cf update            # Update plugin + CLI + statusline
cf update --cli      # Update only the CLI (npm package)
cf update --plugin   # Update only the Claude Code plugin
cf update --statusline  # Update only the statusline
cf dev on [path]     # Switch to local plugin source for development
cf dev off           # Switch back to remote marketplace
cf dev status        # Show current dev mode (local or remote)
cf dev sync          # Sync local changes to cache (no version bump needed)
cf dev restart       # Reinstall local dev plugin (off + on)
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

## Publish CLI to npm

```bash
# From the root of coding-friend project
cd cli
npm login              # Login if not already
npm publish            # Build + bundle + publish

# To bump a version
npm version patch # 1.0.1 -> 1.0.2
npm version minor # 1.0.1 -> 1.1.0
```

`prepublishOnly` runs automatically: builds TypeScript → `dist/` and bundles libs from `lib/`.

- Bump `version` in `cli/package.json` before publishing
- First time or public package: `npm publish --access public`
- Package name: `coding-friend-cli` → users install with `npm i -g coding-friend-cli`

## License

MIT