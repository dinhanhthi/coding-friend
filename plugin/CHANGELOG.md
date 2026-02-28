# Changelog (Plugin)

> CLI changelog: [`cli/CHANGELOG.md`](../cli/CHANGELOG.md)

## v0.0.2 (unpublished)

- Redesign website homepage to showcase full ecosystem (Plugin, CLI, Learn Host, Learn MCP)
- Add EcosystemSection highlighting 4-tool relationships with visual /cf-learn pipeline
- Add DifferentiatorSection emphasizing Simplicity and /cf-learn as core differentiators
- Clarify that /cf-learn captures knowledge for human understanding, not just AI output
- Move plugin changelog from docs/ to plugin/ subdirectory
- Move marketplace.json to .claude-plugin/ per Claude Code convention

## v0.0.1

- Add 15 skills: `/cf-plan`, `/cf-fix`, `/cf-ask`, `/cf-optimize`, `/cf-review`, `/cf-commit`, `/cf-ship`, `/cf-remember`, `/cf-learn`, `/cf-research` + 5 auto-invoked (`cf-tdd`, `cf-sys-debug`, `cf-code-review`, `cf-verification`, `cf-learn`)
- Add 7 hooks: session init, dev rules reminder, privacy block, scout block, statusline, compact marker, context tracker
- Add 5 agents: `code-reviewer`, `implementer`, `planner`, `writer` (haiku), `writer-deep` (sonnet)
- Add CLI companion (`coding-friend-cli` on npm): `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- Add learning docs host (`cf host`) with ISR, Pagefind full-text search, and modern UI with command palette
- Add MCP server (`cf mcp`) for LLM integration with learning docs
- Add layered config: global (`~/.coding-friend/`) + local (`.coding-friend/`), local wins
- Add prompt injection defense across all skills, agents, and hooks
- Add project website with docs, changelog, and landing page
