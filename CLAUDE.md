# coding-friend

Lean toolkit for disciplined engineering workflows.

## Rules

1. **Check skills first** — Before any task, check if a relevant coding-friend skill exists. Load it.
2. **Test before code** — No production code without a failing test. RED → GREEN → REFACTOR.
3. **Verify before claiming** — Never claim done without running tests and showing output.
4. **Respect boundaries** — Do not read files in .coding-friend/ignore or .env/credentials.
5. **Commit with purpose** — Conventional commits. Focus on "why", not "what".
6. **No AI attribution** — Never add "Co-Authored-By" or any AI/Claude mention in commits, code, or PRs.
7. **Keep all references in sync** — When adding/removing skills or commands, update ALL of these: `skills/cf-help/SKILL.md`, `hooks/compact-marker.sh`, `hooks/dev-rules-reminder.sh`.

## Skills

### Commands (user triggers with /slash)
- `/cf-plan [task]` — Brainstorm + implementation plan
- `/cf-review [target]` — Code review (runs in forked subagent)
- `/cf-commit [hint]` — Smart conventional commit
- `/cf-ship [hint]` — Verify + commit + push + PR
- `/cf-fix [bug]` — Quick bug fix workflow
- `/cf-remember [topic]` — Extract project knowledge → docs/memory/
- `/cf-learn [topic]` — Extract learnings (configurable output, language, categories). Also auto-invoked.
- `/cf-research [topic]` — In-depth research with web search → docs/research/
- `/cf-statusline` — Setup coding-friend statusline
- `/cf-update` — Update plugin + refresh statusline

### Auto-invoked (loaded when relevant)
- `cf-tdd` — TDD workflow
- `cf-sys-debug` — 4-phase debugging
- `cf-code-review` — Review methodology
- `cf-verification` — Completion gate
- `cf-learn` — Auto-extract learnings on substantial new knowledge

## Agents
- `code-reviewer` — Multi-layer review
- `implementer` — TDD implementation
- `planner` — Exploration + task breakdown

## CLI (coding-friend-cli)
- Standalone CLI at `cli/` — published as `coding-friend-cli` on npm, binary `cf`
- Commands: `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- These mirror the plugin skills but work without Claude Code
- Libs bundled at publish time via `scripts/bundle-libs.js` (copies from `lib/`)

## Conventions
- Conventional commits: feat/fix/refactor/test/docs/chore
- Tests next to source or in __tests__/tests/
- Project docs in docs/memory/, learning notes in docs/learn/, research in docs/research/
- Respect .coding-friend/ignore patterns
- Config via .coding-friend/config.json (local) and ~/.coding-friend/config.json (global)

## Versioning

After any change, determine the version bump type:
- **PATCH** (x.x.1): bug fix, typo, docs update
- **MINOR** (x.1.0): new feature, new skill, new hook (backward compatible)
- **MAJOR** (1.0.0): breaking change (config format, removed skill, changed CLI behavior)

Steps:
1. Check latest **git tag**: `git tag --sort=-v:refname | head -1` — this is the source of truth for the current released version
2. Check `plugin.json` version — if it's already ahead of the tag, the current unreleased version is in progress. Do NOT bump again; add changes to the existing unreleased version instead
3. Only bump `plugin.json` when the tag and `plugin.json` match (meaning a new release cycle is starting)
4. Update changelog in `docs/CHANGELOG.md` (add to existing unreleased section if one exists)
5. Also update `package.json` version
