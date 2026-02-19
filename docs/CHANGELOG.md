# Changelog

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
