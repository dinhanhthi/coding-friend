# Changelog (Plugin)

> CLI changelog: [`cli/CHANGELOG.md`](../cli/CHANGELOG.md)

## v1.7.0

- **Multi-platform support** — coding-friend now works with Cursor, Windsurf, GitHub Copilot, Roo Code, OpenCode, Codex, and Antigravity (in addition to Claude Code)
- Add `cf init --global` — install coding-friend into global config of each platform (works in all projects without per-project setup)
- Add `cf init` platform selection step — choose which platforms to configure during project setup
- Add `cf adapt` command — regenerate platform-specific files after skill/hook changes (`--global`, `--platform <id>`, `--dry-run`)
- Add `cf remove` command — remove coding-friend files from platforms (`--global`, `--platform <id>`)
- Adapter system in `cli/src/adapters/` — PlatformAdapter interface with platform-specific compilers for skills, hooks, and rules
- Core compilers: skill-compiler (SKILL.md → platform format), hooks-compiler (hooks.json → platform hook format), rules-builder (section markers for safe file merging)
- Platforms with hook support (Cursor, Windsurf, Copilot): generate native hook scripts with adapted I/O format
- Platforms without hooks (Roo Code, OpenCode, Codex, Antigravity): embed security/dev rules in instructions files
- Global install uses section markers (`<!-- coding-friend:start/end -->`) for safe idempotent upserts into shared files
- `CodingFriendConfig` extended with `platforms` and `platformOverrides` for per-platform opt-out

## v1.6.0

- Improve `cf host`:
    - `cf host`: Switch from static export to ISR (Incremental Static Regeneration) — new/changed docs auto-update on page refresh without rebuild
    - `cf host`: Add full-text search via Pagefind (replaces substring-match search index)
    - `cf host`: Use `next start` instead of `npx serve` for ISR support
- Improve working prompts:
    - Fix `/cf-plan` not asking for clarification — add mandatory "Clarify Before Exploring" step and user validation gate before finalizing plan
    - Fix `/cf-fix` proceeding without verifying problem — add "Verify the Problem Exists" and "Confirm Approach" steps
    - Improve planner agent — questions and assumptions surfaced first, unknowns must be resolved before planning
- Security:
    - Add prompt injection defense — layered content isolation across skills, agents, and hooks
    - Central security rules in `cf-help` (loaded at every session start)
    - Security reminder in `dev-rules-reminder` hook (every user prompt)
    - Security context preserved in `compact-marker` hook (survives compaction)
    - `/cf-research` subagent template hardened with content isolation instructions
    - All 5 agents updated with prompt injection awareness (code-reviewer, planner, implementer, writer, writer-deep)

## v1.5.1

- Fix plugin cache issue — bump version to force cache invalidation for users on v1.5.0

## v1.5.0

- Remove `/cf-update` skill — use `cf update` (CLI) instead
- Remove `/cf-statusline` skill — use `cf statusline` (CLI) instead
- Remove `/cf-init` skill — use `cf init` (CLI) instead
- `cf init` works in non-git directories (git steps skipped gracefully)
- Add `coding-friend-cli` on npm (`npm i -g coding-friend-cli`, binary: `cf`)
- CLI commands: `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- CLI bundles `lib/learn-host` and `lib/learn-mcp` at publish time
- CLI resolves config: local → global → defaults
- Remove `/cf-learn:host` — replaced by `cf host` and `cf mcp`
- Shell tab completion auto-configured on install/update
- Add `/cf-ask [question]` — lightweight codebase Q&A with auto-save to `docs/memory/`
- Add `/cf-optimize [target]` — structured optimization workflow with baseline/after measurement
- Add `writer` agent (haiku) — lightweight doc writer for skills that generate markdown files
- Add `writer-deep` agent (sonnet) — fallback for content requiring deep reasoning or long context
- `/cf-learn` and `/cf-remember` now delegate writing to writer agents (skill = brain, agent = hands)
- Move agents from `.claude/agents/` to `agents/` (correct plugin directory structure per official docs)

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
