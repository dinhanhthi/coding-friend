# Changelog (CLI)

> Plugin changelog: [`plugin/CHANGELOG.md`](../plugin/CHANGELOG.md)

## v1.2.0

- `cf dev on [path]`: Switch to local plugin source for development
- `cf dev off`: Switch back to remote marketplace
- `cf dev status`: Show current dev mode
- `cf dev sync`: Hot-reload plugin changes during development
- `cf dev restart [path]`: Restart dev mode with updated path
- Shell completion: Add support for path completion in `cf dev on [path]`
- Shell completion: Update logic now replaces outdated blocks instead of skipping
- Fix `cf update` running wrong commands and downgrading itself
- Add Vitest setup and tests for lib utilities

## v1.1.1

- Add `-v` short flag for `cf --version`

## v1.1.0

- `cf host`: Switch to ISR — new/changed docs auto-update without rebuild
- `cf host`: Add Pagefind full-text search (replaces custom search index)
- `cf host`: Use `next start` instead of `npx serve`

## v1.0.4

- Fix: `cli/src/lib/` is ignored.

## v1.0.3

- `cf update` now also updates the CLI npm package (`coding-friend-cli`)
- Add `--cli`, `--plugin`, `--statusline` flags to `cf update` for selective updates

## v1.0.2

- Fix `cf update` — add retry/polling for version verification after `claude plugin update`
- Fix `cf update` — no longer skips statusline/shell-completion steps when version verify is slow

## v1.0.1

- First npm publish (`npm i -g coding-friend-cli`, binary: `cf`)
- Commands: `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- Bundle `lib/learn-host` and `lib/learn-mcp` at publish time
- Resolve config: local → global → defaults
- Shell tab completion auto-configured on install/update
- `cf init` works in non-git directories (git steps skipped gracefully)
