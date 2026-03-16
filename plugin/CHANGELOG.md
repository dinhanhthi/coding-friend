# Changelog (Plugin)

> CLI changelog: `[cli/CHANGELOG.md](../cli/CHANGELOG.md)`

## v0.9.0 (2026-03-16)

- Add `/cf-onboard` skill for project memory bootstrap — scans project and populates memory with architecture, conventions, and features ([#0ed475e](https://github.com/dinhanhthi/coding-friend/commit/0ed475e))
- Add memory MCP setup step to `cf init` ([#382b872](https://github.com/dinhanhthi/coding-friend/commit/382b872))
- Add `cf memory` subcommands to bootstrap context and shell completion ([#1da99b1](https://github.com/dinhanhthi/coding-friend/commit/1da99b1))

## v0.8.1 (2026-03-11)

- Improve skill descriptions for `cf-remember`, `cf-learn`, `cf-review`, `cf-commit`, `cf-ship`, `cf-research`, `cf-ask`, `cf-session`, and `cf-tdd` with explicit trigger phrases and auto-invoke conditions ([#3bfdfe9](https://github.com/dinhanhthi/coding-friend/commit/3bfdfe9))
- Clarify `cf-remember` (AI recall) vs `cf-learn` (human learning) distinction in descriptions ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Add `user-invocable: true` to `cf-review` for both manual and auto-trigger support ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Add refactoring triggers to `cf-tdd` description ("refactor this", "clean up", "extract") ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Add Common Workflows and Troubleshooting sections to `cf-help` skill ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Extract `cf-research` templates to `references/templates.md` to avoid nested code fence parsing issues ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Extract `cf-session` inline scripts to `scripts/` directory with safe argument passing (no shell injection) ([#3bfdfe9](https://github.com/dinhanhthi/coding-friend/commit/3bfdfe9))
- Fix `cf-sys-debug` heading: "5-Phase Process" → "4-Phase Process + Documentation" ([#3bfdfe9](https://github.com/dinhanhthi/coding-friend/commit/3bfdfe9))
- Add `cf-session` to bootstrap context slash commands list ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Add `model: haiku` to `cf-session` for cost efficiency ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Add PR title format guidance and main branch guard to `cf-ship` ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))

## v0.8.0 (2026-03-10)

- Add `rate_limit` statusline component showing current (5-hour) and weekly (7-day) API usage percentages with color-coded gradient and reset times ([#b8c1cdc](https://github.com/dinhanhthi/coding-friend/commit/b8c1cdc))
- Replace old `usage` component with improved `rate_limit` — fetches from Anthropic OAuth API with 60s caching, multi-source token resolution (env, Keychain, credentials file, `secret-tool`), and cross-platform date formatting ([#b8c1cdc](https://github.com/dinhanhthi/coding-friend/commit/b8c1cdc))

## v0.7.5 (2026-03-09)

- Make `cf-optimize` auto-invocable on performance-related conversation signals ([#ca86338](https://github.com/dinhanhthi/coding-friend/commit/ca86338))
- Add performance suggestion sections to `cf-fix`, `cf-plan`, and `cf-code-reviewer` to cross-reference `/cf-optimize` ([#ca86338](https://github.com/dinhanhthi/coding-friend/commit/ca86338))
- Add `user-invocable: false` frontmatter to `cf-tdd` and `cf-sys-debug` skills ([#ca86338](https://github.com/dinhanhthi/coding-friend/commit/ca86338))

## v0.7.4 (2026-03-09)

- Update bootstrap context and statusline to list `cf disable` and `cf enable` CLI commands ([#32325db](https://github.com/dinhanhthi/coding-friend/commit/32325db))

## v0.7.3 (2026-03-09)

- Update bootstrap context to list scope flags for `cf install`, `cf uninstall`, `cf update` CLI commands ([#16ece26](https://github.com/dinhanhthi/coding-friend/commit/16ece26))

## v0.7.2 (2026-03-08)

- Update bootstrap context to list `cf permission` CLI command ([#8033ef4](https://github.com/dinhanhthi/coding-friend/commit/8033ef4))

## v0.7.1 (2026-03-08)

- Remove manual only trigger for skills cf-optimize, cf-remember, cf-review ([#a2ea10f](https://github.com/dinhanhthi/coding-friend/commit/a2ea10f))

## v0.7.0 (2026-03-08)

- Add `cf-session` skill for cross-machine session continuity ([#d0c58cd](https://github.com/dinhanhthi/coding-friend/commit/d0c58cd), [#6158bb7](https://github.com/dinhanhthi/coding-friend/commit/6158bb7))
- Auto-trigger `/cf-review` after implementation and fix workflows ([#ff666ba](https://github.com/dinhanhthi/coding-friend/commit/ff666ba))
- Add folder and brain icons to statusline for better visual clarity ([#dab4d0b](https://github.com/dinhanhthi/coding-friend/commit/dab4d0b))
- Improve skill and hook documentation ([#e852b1c](https://github.com/dinhanhthi/coding-friend/commit/e852b1c))
- Fix `$CWD` path resolution to prevent literal string substitution in skills ([#5b59571](https://github.com/dinhanhthi/coding-friend/commit/5b59571))
- Fix activation signal to require explicit `cf-` name check ([#d567bed](https://github.com/dinhanhthi/coding-friend/commit/d567bed))
- Remove non-functional `PreCompact` hook ([#687a38c](https://github.com/dinhanhthi/coding-friend/commit/687a38c))
- Add missing `hookEventName` to `compact-marker.sh` ([#7cc4161](https://github.com/dinhanhthi/coding-friend/commit/7cc4161))

## v0.6.0 (2026-03-05)

- Add frontmatter-based recall and memory documentation to skills ([#37af8ee](https://github.com/dinhanhthi/coding-friend/commit/37af8ee))
- Add separate language settings for docs and `cf-learn` ([#1bbaae1](https://github.com/dinhanhthi/coding-friend/commit/1bbaae1))
- Consolidate `bump-version` into `cf-ship-custom` ([#287fddc](https://github.com/dinhanhthi/coding-friend/commit/287fddc))
- Add tag push ordering rule to release docs ([#7ebf80d](https://github.com/dinhanhthi/coding-friend/commit/7ebf80d))

## v0.5.0 (2026-03-04)

- Migrate custom skill guides from eager to on-demand loading ([#f3fcd69](https://github.com/dinhanhthi/coding-friend/commit/f3fcd69))
- Migrate custom skill guides to directory-based format ([#f28e1af](https://github.com/dinhanhthi/coding-friend/commit/f28e1af))
- Track skills `bump-version` and `release` for this project only ([#8c88658](https://github.com/dinhanhthi/coding-friend/commit/8c88658))
- Specify explicit model for `cf-code-reviewer` and `cf-implementer` agents ([#76bb8f2](https://github.com/dinhanhthi/coding-friend/commit/76bb8f2))
- Add `cf-` prefix to all agent names ([#ce59871](https://github.com/dinhanhthi/coding-friend/commit/ce59871))
- Expand `cf-plan` and `cf-fix` trigger keywords for better auto-invocation ([#9486160](https://github.com/dinhanhthi/coding-friend/commit/9486160))
- Clarify `cf-*` signal rules with explicit criteria ([#5191081](https://github.com/dinhanhthi/coding-friend/commit/5191081))

## v0.4.2 (2026-03-04)

- Refactor custom skill guides to use `-custom.md` suffix ([#99648a7](https://github.com/dinhanhthi/coding-friend/commit/99648a7))
- Refactor bootstrap context and split from `cf-help` skill ([#de47b9a](https://github.com/dinhanhthi/coding-friend/commit/de47b9a))
- Add in-skill reminders and remove `review-gate` Stop hook ([#1c9f8c3](https://github.com/dinhanhthi/coding-friend/commit/1c9f8c3))
- Fix tool naming in agent delegation documentation ([#24487d7](https://github.com/dinhanhthi/coding-friend/commit/24487d7))
- Fix activation signal to scope to coding-friend skills only ([#41c5e43](https://github.com/dinhanhthi/coding-friend/commit/41c5e43))

## v0.4.1 (2026-03-03)

- Optimize verification workflow to avoid duplicate test runs ([#00b9304](https://github.com/dinhanhthi/coding-friend/commit/00b9304))

## v0.4.0 (2026-03-03)

- Add customizable statusline component selection for simplified setup ([#3714a2b](https://github.com/dinhanhthi/coding-friend/commit/3714a2b))
- Add context window usage percentage display to statusline ([#89d3c95](https://github.com/dinhanhthi/coding-friend/commit/89d3c95))
- Improve documentation link and inline code styling on website ([#96a1071](https://github.com/dinhanhthi/coding-friend/commit/96a1071))

## v0.3.0 (2026-03-03)

- Add `explorer` agent for reusable codebase exploration ([#af2a926](https://github.com/dinhanhthi/coding-friend/commit/af2a926))
- Add `implementer` agent wired into `cf-plan`, `cf-fix`, `cf-tdd`, `cf-optimize` ([#cc5b0c4](https://github.com/dinhanhthi/coding-friend/commit/cc5b0c4))
- Add `cf-plan` codebase exploration delegation to `planner` agent ([#24b1560](https://github.com/dinhanhthi/coding-friend/commit/24b1560))
- Fix: don't auto commit after implementation ([#a5d6750](https://github.com/dinhanhthi/coding-friend/commit/a5d6750))
- Fix code review findings in plugin ([#f3d7f53](https://github.com/dinhanhthi/coding-friend/commit/f3d7f53))
- Fix statusline credential hygiene in OAuth token handling ([#003993e](https://github.com/dinhanhthi/coding-friend/commit/003993e))
- Fix statusline: use Anthropic OAuth API instead of third-party Swift script ([#56335f7](https://github.com/dinhanhthi/coding-friend/commit/56335f7))
- Fix statusline: properly validate utilization is numeric before display ([#952bd62](https://github.com/dinhanhthi/coding-friend/commit/952bd62))
- Fix stop hook JSON schema in `review-gate.sh` ([#741fc6e](https://github.com/dinhanhthi/coding-friend/commit/741fc6e))
- Make `cf-auto-review` single source of truth for review methodology ([#b92f9a9](https://github.com/dinhanhthi/coding-friend/commit/b92f9a9))

## v0.2.0 (2026-03-02)

- Add `/cf-review` reminder to `/cf-plan` and `/cf-fix` workflows to prevent skipping code review before commit — [#16d608c](https://github.com/dinhanhthi/coding-friend/commit/16d608c)
- Add activation signal display for coding-friend skills and agents — [#2dd1668](https://github.com/dinhanhthi/coding-friend/commit/2dd1668)
- Enhance `/cf-review` documentation with proportional review depth, security analysis, and cross-links — [#2220098](https://github.com/dinhanhthi/coding-friend/commit/2220098)
- Enhance security review with proportional depth, auto-triggers, and defense-in-depth strategy — [#53994ce](https://github.com/dinhanhthi/coding-friend/commit/53994ce)
- Rewrite `scout-block` hook as Node.js with default patterns and negation support — [#2364935](https://github.com/dinhanhthi/coding-friend/commit/2364935)
- Add detailed descriptions to all hook files — [#c6fadbc](https://github.com/dinhanhthi/coding-friend/commit/c6fadbc)
- Add `review-gate` hook documentation and update hook count from 7 to 8 — [#19a1775](https://github.com/dinhanhthi/coding-friend/commit/19a1775)
- Reduce the number of colors on homepage — [#0c2f3a2](https://github.com/dinhanhthi/coding-friend/commit/0c2f3a2)

## v0.1.1 (2026-03-02)

- Fix `UserPromptSubmit` hook error on new session
- Merge `/changelog` into `/bump-version` skill

## v0.1.0 (2026-03-01)

- Add custom skill guides: extend built-in skills with user-defined `Before`/`Rules`/`After` sections in `.coding-friend/skills/<skill-name>.md`
- Add validation for custom guides: warn on wrong skill names, format errors, with "did you mean?" suggestions
- Show guide warnings prominently at session start via `<guide-warnings>` block
- Fix: exclude code blocks when extracting headings for Table of Contents (fixes duplicate key warnings in website docs)
- Redesign website homepage to showcase full ecosystem (Plugin, CLI, Learn Host, Learn MCP)
- Add `EcosystemSection` highlighting 4-tool relationships with visual `/cf-learn` pipeline
- Add `DifferentiatorSection` emphasizing Simplicity and `/cf-learn` as core differentiators
- Clarify that `/cf-learn` captures knowledge for human understanding, not just AI output
- Move plugin changelog from `docs/` to `plugin/` subdirectory
- Move `marketplace.json` to `.claude-plugin/` per Claude Code convention
- Clarify `/cf-remember` category selection: add `bugs/` and `infrastructure/` categories with explicit guide (fixes bug fixes being saved to features/)
- Document that `$ARGUMENTS` acts as filter for conversation content, with auto-detected topic names by default
- Enhance `/cf-commit` workflow: add Step 2 to explicitly identify conversation-related changes vs unrelated work
- Simplify README with website and CLI references
- Move development guides to component READMEs
- Consolidate gitignore files into single root

## v0.0.1

- Add 15 skills: `/cf-plan`, `/cf-fix`, `/cf-ask`, `/cf-optimize`, `/cf-review`, `/cf-commit`, `/cf-ship`, `/cf-remember`, `/cf-learn`, `/cf-research` + 5 auto-invoked (`cf-tdd`, `cf-sys-debug`, `cf-auto-review`, `cf-verification`, `cf-learn`)
- Add 7 hooks: session init, dev rules reminder, privacy block, scout block, statusline, compact marker, context tracker
- Add 5 agents: `code-reviewer`, `implementer`, `planner`, `writer` (`haiku`), `writer-deep` (`sonnet`)
- Add CLI companion (`coding-friend-cli` on npm): `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- Add learning docs host (`cf host`) with ISR, Pagefind full-text search, and modern UI with command palette
- Add MCP server (`cf mcp`) for LLM integration with learning docs
- Add layered config: global (`~/.coding-friend/`) + local (`.coding-friend/`), local wins
- Add prompt injection defense across all skills, agents, and hooks
- Add project website with docs, changelog, and landing page
