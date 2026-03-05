# Changelog (CLI)

> Plugin changelog: [`plugin/CHANGELOG.md`](../plugin/CHANGELOG.md)

## v1.7.0 (2026-03-05)

- Add package manager tabs (npm, yarn, pnpm) to website ([#72e9e05](https://github.com/dinhanhthi/coding-friend/commit/72e9e05))
- Add separate language settings for docs and `cf-learn` ([#1bbaae1](https://github.com/dinhanhthi/coding-friend/commit/1bbaae1))
- Improve docs for `cf init` command ([#8dad5f2](https://github.com/dinhanhthi/coding-friend/commit/8dad5f2))
- Fix TOC heading text stripping markdown links from slug generation ([#9a8fb5c](https://github.com/dinhanhthi/coding-friend/commit/9a8fb5c))
- Decorate inline codes for TOC in `learn-host` ([#573d7b0](https://github.com/dinhanhthi/coding-friend/commit/573d7b0))

## v1.6.0 (2026-03-04)

- Add `cf dev update` command to update local dev plugin ([#2788225](https://github.com/dinhanhthi/coding-friend/commit/2788225))
- Ensure statusline and shell completion auto-update in `dev/restart/update` commands ([#2b754e2](https://github.com/dinhanhthi/coding-friend/commit/2b754e2))

## v1.5.2 (2026-03-04)

- Improve styling across website and `learn-host` ([#0029522](https://github.com/dinhanhthi/coding-friend/commit/0029522))

## v1.5.1 (2026-03-03)

- Fix `cf host` and `cf mcp` failing to locate bundled lib packages when installed from npm ([#8761c72](https://github.com/dinhanhthi/coding-friend/commit/8761c72))

## v1.5.0 (2026-03-03)

- Add customizable statusline component selection for simplified setup ([#3714a2b](https://github.com/dinhanhthi/coding-friend/commit/3714a2b))

## v1.4.0 (2026-03-03)

- Add `cf install` command for plugin setup from terminal ([#e51cd4e](https://github.com/dinhanhthi/coding-friend/commit/e51cd4e))
- Add `cf uninstall` command ([#ccf1758](https://github.com/dinhanhthi/coding-friend/commit/ccf1758))
- Add copy button to code blocks in website and learn-host docs ([#ac47c74](https://github.com/dinhanhthi/coding-friend/commit/ac47c74))

## v1.3.0 (2026-03-02)

- `cf dev on` and `cf dev restart`: Auto-update versioned paths in `settings.json` (e.g. statusline command) to latest cached plugin version

## v1.2.1 (2026-03-01)

- Show `cf dev` subcommands in `cf help` output

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
