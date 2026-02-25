# Changelog (Plugin)

> CLI changelog: [`cli/CHANGELOG.md`](../cli/CHANGELOG.md)

## v0.0.1

- 15 skills: `/cf-plan`, `/cf-fix`, `/cf-ask`, `/cf-optimize`, `/cf-review`, `/cf-commit`, `/cf-ship`, `/cf-remember`, `/cf-learn`, `/cf-research` + 5 auto-invoked (`cf-tdd`, `cf-sys-debug`, `cf-code-review`, `cf-verification`, `cf-learn`)
- 7 hooks: session init, dev rules reminder, privacy block, scout block, statusline, compact marker, context tracker
- 5 agents: `code-reviewer`, `implementer`, `planner`, `writer` (haiku), `writer-deep` (sonnet)
- CLI companion (`coding-friend-cli` on npm): `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- Learning docs host (`cf host`) with ISR, Pagefind full-text search, and modern UI with command palette
- MCP server (`cf mcp`) for LLM integration with learning docs
- Layered config: global (`~/.coding-friend/`) + local (`.coding-friend/`), local wins
- Prompt injection defense across all skills, agents, and hooks
- Project website with docs, changelog, and landing page
