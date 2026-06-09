# Phase 6: Agents port

**Plan:** [README.md](./README.md)
**Type:** sequential
**Goal:** Convert CF's 12 Markdown agent definitions into Codex's TOML format, deploy them to Codex agent directories, and translate agent-dispatch references inside skill bodies.

## Progress

| Status  | Task                                              |
| ------- | ------------------------------------------------- |
| ✅ DONE | 6.1 Write MD→TOML agent converter                 |
| ✅ DONE | 6.2 Generate and deploy `plugin-codex/agents/cf-*.toml` |
| ✅ DONE | 6.3 Resolve `{{cf:dispatch ...}}` in build script |

## Tasks

1. **6.1 MD→TOML converter**
   - Files: `scripts/lib/agent-md-to-toml.js` (new), test
   - Parse frontmatter (gray-matter or simple parser):
     - `name` → TOML `name`
     - `description` → TOML `description`
     - `model` → TOML `model` (Claude model IDs unchanged; if `haiku`/`sonnet`, leave as-is — user picks Codex model mapping in config.toml; document in Phase 9)
     - Markdown body → TOML `developer_instructions` (multi-line `'''…'''` string)
   - Verify: fixture test converts a sample MD agent to expected TOML; idempotent.
   - Rollback: delete converter + test.

2. **6.2 Generate and deploy Codex agent files**
   - Files: `plugin-codex/agents/cf-*.toml` (12 files, generated), CLI install/init deployment logic
   - Extend Phase 3.3 build script to call 6.1 converter for each `plugin/agents/*.md` and write to `plugin-codex/agents/<name>.toml`.
   - Verify: 12 TOML files appear in `plugin-codex/agents/`; `cf install --agent codex` deploys them to `~/.codex/agents/`; `$cf-explorer` activates the explorer subagent.
   - Rollback: re-run build with converter disabled.

3. **6.3 Resolve `{{cf:dispatch ...}}` in build**
   - Files: `scripts/build-codex-plugin.js` (edit), test
   - When the build script renders a SKILL.md for Codex, replace each `{{cf:dispatch agent=NAME prompt="..."}}` with a natural-language template:
     ```
     Spawn a subagent named `NAME` with the following instructions:
     <prompt>
     Wait for it to finish and use its output.
     ```
   - Same placeholder when rendered for Claude becomes the existing Agent-tool block (Phase 3.3 already handles the Claude rendering).
   - Verify: fixture: an input SKILL.md with `{{cf:dispatch agent=cf-explorer prompt="explore X"}}` → expected Codex output (snapshot test).
   - Rollback: revert build script + test.

## Exit criteria

- `plugin-codex/agents/` contains 12 valid TOML files
- `cf install --agent codex` deploys those TOMLs to `~/.codex/agents/`
- A Codex session with the plugin installed can spawn `$cf-explorer` and receive output
- No `{{cf:dispatch}}` placeholder remains in `plugin-codex/skills/*/SKILL.md`

## Phase 6 validation

- Converter tests: `node --test scripts/__tests__/agent-md-to-toml.test.mjs`
- Build transform tests: `node --test scripts/__tests__/build-codex-plugin.test.mjs`
- Placeholder lint: `node --test scripts/__tests__/placeholder-lint.test.mjs`
- Generated artifact: `npm run build:codex`
- Drift guard: `npm run verify:codex-drift`
- Agent count: `plugin-codex/agents/` contains 12 `cf-*.toml` files.
- Placeholder scan: no `{{cf:dispatch}}`, `{{cf:agent_ref}}`, `{{cf:slash}}`, raw `subagent_type:`, or `CLAUDE_PLUGIN_ROOT` remains in `plugin-codex/agents` or `plugin-codex/skills`.
