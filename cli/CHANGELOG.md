# Changelog (CLI)

> Plugin changelog: [`docs/CHANGELOG.md`](../docs/CHANGELOG.md)

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
