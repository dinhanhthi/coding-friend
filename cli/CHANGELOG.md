# Changelog (CLI)

> Plugin changelog: [`plugin/CHANGELOG.md`](../plugin/CHANGELOG.md)

## v1.20.2 (unpublished)

- Fix Windows compatibility: `commandExists()` uses `where` instead of Unix-only `which`, `resolvePath()` handles Windows drive letters, `encodeProjectPath()` handles backslashes and colons, `buildStatuslineCommand()` quotes paths for spaces in usernames, `remapProjectPath()` supports `C:\Users\` paths, and `devSyncCommand()` uses `homedir()` instead of `process.env.HOME` [#2e67ea7](https://github.com/dinhanhthi/coding-friend/commit/2e67ea7)

## v1.20.1 (2026-03-22)

- Fix postinstall script failing on Windows — replace Unix shell syntax (`test -f`, `|| true`) with cross-platform `node -e` invocation [#d786f08](https://github.com/dinhanhthi/coding-friend/commit/d786f08)
- Auto-start memory daemon when running `cf memory init` [#2acda01](https://github.com/dinhanhthi/coding-friend/commit/2acda01)

## v1.20.0 (2026-03-21)

- Colorize config property keys in `cf status` output for better visual hierarchy [#e83b93c](https://github.com/dinhanhthi/coding-friend/commit/e83b93c)
- Show detailed error messages when `npm install` or build fails on `cf memory init` [#83c34e6](https://github.com/dinhanhthi/coding-friend/commit/83c34e6)
- Improve `cf update` error message with manual update instructions when marketplace cache is stale [#4e98252](https://github.com/dinhanhthi/coding-friend/commit/4e98252)

## v1.19.0 (2026-03-20)

- Add `cf status` command — unified dashboard showing versions, plugin state, memory system status, and configuration [#96b97b0](https://github.com/dinhanhthi/coding-friend/commit/96b97b0)
- Add interactive memory configuration wizard (`cf memory init`) and `cf memory config` command [#783dbb6](https://github.com/dinhanhthi/coding-friend/commit/783dbb6)
- Add `detectPluginScope()` for accurate scope detection with local > project > user priority [#96b97b0](https://github.com/dinhanhthi/coding-friend/commit/96b97b0)

## v1.18.0 (2026-03-20)

- Fix permission rules to support both quoted and unquoted script invocations — prevents repeated permission prompts for `/cf-review`, `/cf-commit`, and other skills [#e690da7](https://github.com/dinhanhthi/coding-friend/commit/e690da7)
- Fix permissions to use absolute path + wide glob pattern for plugin script rules [#57ad562](https://github.com/dinhanhthi/coding-friend/commit/57ad562)
- Add interactive menu mode to `cf init` for already-initialized projects [#491dc0e](https://github.com/dinhanhthi/coding-friend/commit/491dc0e)
- Display Permissions in `cf init` status and add config counts [#7c2f849](https://github.com/dinhanhthi/coding-friend/commit/7c2f849)
- Add token usage visibility across UI with tier icons and documentation [#4227860](https://github.com/dinhanhthi/coding-friend/commit/4227860)

## v1.17.4 (2026-03-19)

- Use path-based project IDs in `cf memory list --projects` for consistent identification with cf-memory backend [#9c4cac0](https://github.com/dinhanhthi/coding-friend/commit/9c4cac0)
- Rename `cf memory start`/`stop` to `cf memory start-daemon`/`stop-daemon` to clarify these commands manage only the daemon, not the entire memory system [#acbe789](https://github.com/dinhanhthi/coding-friend/commit/acbe789)

## v1.17.2 (2026-03-17)

- Fix `cf memory list` date formatting — preserve original format instead of normalizing with fake timestamps [#31e0824](https://github.com/dinhanhthi/coding-friend/commit/31e0824)

## v1.17.1 (2026-03-17)

- Refactor `cf memory start` to use shared `spawnDaemon()` from cf-memory lib, reducing code duplication [#2211b84](https://github.com/dinhanhthi/coding-friend/commit/2211b84)
- Add tip to daemon status output when running `cf memory status` [#fc5ba80](https://github.com/dinhanhthi/coding-friend/commit/fc5ba80)
- Rename `/cf-onboard` to `/cf-scan` in CLI init command [#387afda](https://github.com/dinhanhthi/coding-friend/commit/387afda)

## v1.17.0 (2026-03-16)

- Add memory system with 3-tier architecture: Tier 1 (SQLite + Hybrid Search), Tier 2 (MiniSearch + Daemon), Tier 3 (Markdown) ([#fd601f2](https://github.com/dinhanhthi/coding-friend/commit/fd601f2), [#7fe84ed](https://github.com/dinhanhthi/coding-friend/commit/7fe84ed), [#7b7d8a1](https://github.com/dinhanhthi/coding-friend/commit/7b7d8a1), [#68522bd](https://github.com/dinhanhthi/coding-friend/commit/68522bd))
- Add `cf memory` CLI commands: `status`, `search`, `list`, `rm`, `init`, `start`, `stop`, `rebuild`, `mcp` ([#fd601f2](https://github.com/dinhanhthi/coding-friend/commit/fd601f2))
- Add `cf memory list --projects` to list all project databases with size and metadata ([#1da99b1](https://github.com/dinhanhthi/coding-friend/commit/1da99b1))
- Add `cf memory rm --prune` to remove orphaned projects (source dir missing or 0 memories) ([#ec0bfee](https://github.com/dinhanhthi/coding-friend/commit/ec0bfee))
- Show hour and minute in `cf memory list --projects` Updated column ([#1d5dd88](https://github.com/dinhanhthi/coding-friend/commit/1d5dd88))
- Add `cf memory` subcommands to bootstrap context and shell completion ([#1da99b1](https://github.com/dinhanhthi/coding-friend/commit/1da99b1))
- Add memory settings to `cf config` ([#5da3085](https://github.com/dinhanhthi/coding-friend/commit/5da3085))
- Add memory MCP setup step to `cf init` ([#382b872](https://github.com/dinhanhthi/coding-friend/commit/382b872))
- Support dynamic embedding dimensions and wire embedding config through tiers ([#b7f6eba](https://github.com/dinhanhthi/coding-friend/commit/b7f6eba))
- Improve `cf init` to be more interactive with step-by-step guided setup ([#d5bbc9c](https://github.com/dinhanhthi/coding-friend/commit/d5bbc9c))

## v1.16 (2026-03-13)

- Improve `cf init` to be more interactive with step-by-step guided setup ([#d5bbc9c](https://github.com/dinhanhthi/coding-friend/commit/d5bbc9c))
- Fix `cf init` not creating docs folder when user chooses "Use global setting" shortcut for `docsDir` ([#5e12415](https://github.com/dinhanhthi/coding-friend/commit/5e12415))
- Add `ensureDocsFolders()` helper with regression tests for docs folder creation ([#5e12415](https://github.com/dinhanhthi/coding-friend/commit/5e12415))

## v1.15 (2026-03-10)

- Show plugin version in `cf dev on`, `cf dev restart`, and `cf dev update` logs ([#4e1d141](https://github.com/dinhanhthi/coding-friend/commit/4e1d141))
- Add fallback to plugin install when `cf dev update` fails to refresh cache ([#82aea4e](https://github.com/dinhanhthi/coding-friend/commit/82aea4e))

## v1.14 (2026-03-10)

- Add `rate_limit` statusline component replacing old `usage` — displays current and weekly API usage with reset times ([#b8c1cdc](https://github.com/dinhanhthi/coding-friend/commit/b8c1cdc))
- Add dependency check for `curl` and `jq` in `cf statusline` and `cf init` when `rate_limit` is selected ([#b8c1cdc](https://github.com/dinhanhthi/coding-friend/commit/b8c1cdc))
- Auto-migrate old `usage` config to `rate_limit` in `loadStatuslineComponents` ([#b8c1cdc](https://github.com/dinhanhthi/coding-friend/commit/b8c1cdc))

## v1.13 (2026-03-09)

- Auto-enable marketplace auto-update during `cf install` so plugins stay up-to-date without manual configuration ([#cab3d9e](https://github.com/dinhanhthi/coding-friend/commit/cab3d9e))

## v1.12 (2026-03-09)

- Add `cf disable` and `cf enable` commands with `--user`/`--global`, `--project`, and `--local` scope flags ([#32325db](https://github.com/dinhanhthi/coding-friend/commit/32325db))
- Warn when running `cf install` on a plugin that is installed but disabled ([#32325db](https://github.com/dinhanhthi/coding-friend/commit/32325db))
- Add shared helpers (`isPluginDisabled`, `setPluginEnabled`, `settingsPathForScope`) for plugin state management ([#32325db](https://github.com/dinhanhthi/coding-friend/commit/32325db))
- Fix `cf update` reporting false success when `installed_plugins.json` didn't change ([#138ec07](https://github.com/dinhanhthi/coding-friend/commit/138ec07))
- Add `runWithStderr()` helper for better error diagnostics ([#138ec07](https://github.com/dinhanhthi/coding-friend/commit/138ec07))
- Add shell completion for `disable` and `enable` commands ([#32325db](https://github.com/dinhanhthi/coding-friend/commit/32325db))

## v1.11 (2026-03-09)

- Add scope flags (`--user`/`--global`, `--project`, `--local`) to `cf install`, `cf uninstall`, and `cf update` ([#16ece26](https://github.com/dinhanhthi/coding-friend/commit/16ece26))
- Add interactive scope prompt with TTY detection for CI/CD environments ([#16ece26](https://github.com/dinhanhthi/coding-friend/commit/16ece26))
- Add shell completion for scope flags across bash, zsh, fish, and PowerShell ([#173d0c6](https://github.com/dinhanhthi/coding-friend/commit/173d0c6), [#16ece26](https://github.com/dinhanhthi/coding-friend/commit/16ece26))
- Fix tilde path resolution in `cf session load` command ([#009cf58](https://github.com/dinhanhthi/coding-friend/commit/009cf58))

## v1.10 (2026-03-08)

- Add `cf permission` command for managing Claude Code permission rules — interactive category-based wizard with `--all` flag for non-interactive setup ([#8033ef4](https://github.com/dinhanhthi/coding-friend/commit/8033ef4))
- Improve `cf init` UX — show all steps with skip reasons and default to project-local config ([#ecc7554](https://github.com/dinhanhthi/coding-friend/commit/ecc7554))
- Fix permission rules: remove overly-broad `Bash(npx:*)`, add scope warnings for `Bash(cat:*)` and `Bash(grep:*)`, quote paths with spaces in learn directory rules ([#d272d33](https://github.com/dinhanhthi/coding-friend/commit/d272d33))

## v1.9 (2026-03-08)

- Add shell completion support for fish, PowerShell, and macOS bash ([#3f6768c](https://github.com/dinhanhthi/coding-friend/commit/3f6768c))
- Add config menu options for statusline, `.gitignore`, and shell completion management ([#de711da](https://github.com/dinhanhthi/coding-friend/commit/de711da))
- Fix version detection in `cf install` and `cf update` commands ([#babc843](https://github.com/dinhanhthi/coding-friend/commit/babc843))
- Fix `cf session` to create destination directories before copying session files ([#99c7add](https://github.com/dinhanhthi/coding-friend/commit/99c7add))

## v1.8 (2026-03-07)

- Add `cf config` interactive command for editing individual settings ([#68ea924](https://github.com/dinhanhthi/coding-friend/commit/68ea924))
- Refactor `cf init` with styled banner, step-based wizard, and shared prompt utilities ([#68ea924](https://github.com/dinhanhthi/coding-friend/commit/68ea924))
- Fix `cf init` step numbering and hardcoded `docs/learn` default ([#68ea924](https://github.com/dinhanhthi/coding-friend/commit/68ea924))
- Remove `devRulesReminder` from config (always ON, not user-configurable) ([#68ea924](https://github.com/dinhanhthi/coding-friend/commit/68ea924))
- Add `cf session` command and improve cross-machine session handling ([#6158bb7](https://github.com/dinhanhthi/coding-friend/commit/6158bb7))

## v1.7 (2026-03-05)

- Add package manager tabs (npm, yarn, pnpm) to website ([#72e9e05](https://github.com/dinhanhthi/coding-friend/commit/72e9e05))
- Add separate language settings for docs and `cf-learn` ([#1bbaae1](https://github.com/dinhanhthi/coding-friend/commit/1bbaae1))
- Improve docs for `cf init` command ([#8dad5f2](https://github.com/dinhanhthi/coding-friend/commit/8dad5f2))
- Fix TOC heading text stripping markdown links from slug generation ([#9a8fb5c](https://github.com/dinhanhthi/coding-friend/commit/9a8fb5c))
- Decorate inline codes for TOC in `learn-host` ([#573d7b0](https://github.com/dinhanhthi/coding-friend/commit/573d7b0))

## v1.6 (2026-03-04)

- Add `cf dev update` command to update local dev plugin ([#2788225](https://github.com/dinhanhthi/coding-friend/commit/2788225))
- Ensure statusline and shell completion auto-update in `dev/restart/update` commands ([#2b754e2](https://github.com/dinhanhthi/coding-friend/commit/2b754e2))

## v1.5 (2026-03-03)

- Add customizable statusline component selection for simplified setup ([#3714a2b](https://github.com/dinhanhthi/coding-friend/commit/3714a2b))
- Fix `cf host` and `cf mcp` failing to locate bundled lib packages when installed from npm ([#8761c72](https://github.com/dinhanhthi/coding-friend/commit/8761c72))
- Improve styling across website and `learn-host` ([#0029522](https://github.com/dinhanhthi/coding-friend/commit/0029522))

## v1.4 (2026-03-03)

- Add `cf install` command for plugin setup from terminal ([#e51cd4e](https://github.com/dinhanhthi/coding-friend/commit/e51cd4e))
- Add `cf uninstall` command ([#ccf1758](https://github.com/dinhanhthi/coding-friend/commit/ccf1758))
- Add copy button to code blocks in website and learn-host docs ([#ac47c74](https://github.com/dinhanhthi/coding-friend/commit/ac47c74))

## v1.3 (2026-03-02)

- `cf dev on` and `cf dev restart`: Auto-update versioned paths in `settings.json` (e.g. statusline command) to latest cached plugin version

## v1.2 (2026-03-01)

- `cf dev on [path]`: Switch to local plugin source for development
- `cf dev off`: Switch back to remote marketplace
- `cf dev status`: Show current dev mode
- `cf dev sync`: Hot-reload plugin changes during development
- `cf dev restart [path]`: Restart dev mode with updated path
- Shell completion: Add support for path completion and update logic to replace outdated blocks
- Fix `cf update` running wrong commands and downgrading itself
- Add Vitest setup and tests for lib utilities
- Show `cf dev` subcommands in `cf help` output

## v1.1

- `cf host`: Switch to ISR — new/changed docs auto-update without rebuild
- `cf host`: Add Pagefind full-text search (replaces custom search index)
- `cf host`: Use `next start` instead of `npx serve`
- Add `-v` short flag for `cf --version`

## v1.0 (2026-03-01)

- First npm publish (`npm i -g coding-friend-cli`, binary: `cf`)
- Commands: `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- Bundle `lib/learn-host` and `lib/learn-mcp` at publish time
- Resolve config: local → global → defaults
- Shell tab completion auto-configured on install/update
- `cf init` works in non-git directories (git steps skipped gracefully)
- `cf update` with `--cli`, `--plugin`, `--statusline` flags for selective updates
- Fix `cf update` retry/polling for version verification
- Fix `cli/src/lib/` being ignored
