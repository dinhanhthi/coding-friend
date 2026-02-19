# Changelog

## v1.4.0

- Top-level `language` config setting — applies to all doc-generating skills (`/cf-learn`, `/cf-plan`, `/cf-research`, etc.)
- Configurable `/cf-learn`: output location, categories, auto-commit, README index
- `/cf-learn` supports `readmeIndex: "per-category"` — distributed README per category folder + lightweight main README
- Layered config system: global (`~/.coding-friend/config.json`) + local (`.coding-friend/config.json`), local overrides global
- `/cf-init` is now re-runnable — detects previous setup, only shows pending steps
- `/cf-init` asks about language and learn settings
- `/cf-init` offers to configure Claude Code permissions (`~/.claude/settings.json`) for external `outputDir`
- `/cf-init` README index option now has 3 choices: No / Single README / Per-category
- `/cf-learn` can auto-invoke on substantial new knowledge
- Config schema documented in `docs/config-schema.md`

## v1.3.0

- Add `/cf-init` command to initialize coding-friend workspace in a project (creates docs folders + optional .gitignore setup)

## v1.2.2

- Add `/cf-update` command to update plugin and refresh statusline
- Update compact-marker and dev-rules-reminder hooks with missing skill references

## v1.2.1

- Show plugin version in statusline (e.g. `cf v1.2.1 │ ...`)

## v1.2.0

- Add `/cf-research [topic]` command for in-depth research with web search, parallel subagents, and structured output in `docs/research/`

## v1.1.0

- Add `/cf-statusline` command to auto-setup statusline in `~/.claude/settings.json`

## v1.0.3

- Change statusline from plugin hook to manual `statusLine` setting (Statusline is not a valid hook event)
- Remove Statusline entry from hooks.json
- Update statusline.sh to use printf output (compatible with `statusLine` setting)
- Update README with manual setup instructions

## v1.0.2

- Fix statusline hook to use JSON response format for plugin compatibility

## v1.0.1

- Show active model in statusline hook
- Add statusline configuration guide to README

## v1.0.0

- Initial release
- 12 skills, 7 hooks, 3 agents
- Config via `.coding-friend/config.json` and `.coding-friend/ignore`
- Installation via Claude Code marketplace
