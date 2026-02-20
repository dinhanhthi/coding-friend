# Changelog

## v1.5.0

- Remove `/cf-init` skill — use `cf init` (CLI) instead
- `cf init` works in non-git directories (git steps skipped gracefully)
- Add `coding-friend-cli` on npm (`npm i -g coding-friend-cli`, binary: `cf`)
- CLI commands: `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- CLI bundles `lib/learn-host` and `lib/learn-mcp` at publish time
- CLI resolves config: local → global → defaults
- Remove `/cf-learn:host` — replaced by `cf host` and `cf mcp`
- Shell tab completion auto-configured on install/update

## v1.4.0

- Top-level `language` config — applies to all doc-generating skills
- Configurable `/cf-learn`: output location, categories, auto-commit, README index
- `/cf-learn` supports `readmeIndex: "per-category"`
- Layered config: global (`~/.coding-friend/`) + local (`.coding-friend/`), local wins
- `/cf-init` re-runnable, asks about language/learn settings, configures permissions
- `/cf-learn` auto-invokes on substantial new knowledge
- Config schema in `docs/config-schema.md`

## v1.3.0

- Add `/cf-init` — initialize workspace (docs folders + .gitignore)

## v1.2.2

- Add `/cf-update` — update plugin + refresh statusline
- Fix missing skill references in hooks

## v1.2.1

- Show plugin version in statusline

## v1.2.0

- Add `/cf-research [topic]` — web search + parallel subagents → `docs/research/`

## v1.1.0

- Add `/cf-statusline` — auto-setup statusline

## v1.0.3

- Change statusline from hook to `statusLine` setting
- Update statusline.sh for printf output

## v1.0.2

- Fix statusline JSON response format

## v1.0.1

- Show active model in statusline

## v1.0.0

- Initial release — 12 skills, 7 hooks, 3 agents
- Config via `.coding-friend/config.json` and `.coding-friend/ignore`
