# Phase 6: Agents port

**Plan:** [README.md](./README.md)
**Type:** sequential
**Goal:** Convert CF's 12 Markdown agent definitions into Codex's TOML format, deploy them to Codex agent directories, and translate agent-dispatch references inside skill bodies.

## Progress

| Status  | Task                                                    |
| ------- | ------------------------------------------------------- |
| ✅ DONE | 6.1 Write MD→TOML agent converter                       |
| ✅ DONE | 6.2 Generate and deploy `plugin-codex/agents/cf-*.toml` |
| ✅ DONE | 6.3 Render Codex-native agent dispatch instructions     |

## Tasks

1. **6.1 MD→TOML converter**
   - Files: `scripts/lib/agent-md-to-toml.js` (new), test
   - Parse frontmatter (gray-matter or simple parser):
     - `name` → TOML `name`
     - `description` → TOML `description`
     - Claude model tiers map to Codex `model_reasoning_effort`: `haiku` → `low`, `sonnet` → `medium`, `opus` → `high`, `inherit` → parent defaults.
     - Claude `tools` frontmatter is omitted because it is not a documented standalone Codex agent key; agent instructions constrain behavior instead.
     - Markdown body → TOML `developer_instructions` (multi-line `'''…'''` string)
   - Verify: fixture test converts a sample MD agent to expected TOML; idempotent.
   - Rollback: delete converter + test.

2. **6.2 Generate and deploy Codex agent files**
   - Files: `plugin-codex/agents/cf-*.toml` (12 files, generated), CLI install/init deployment logic
   - Extend Phase 3.3 build script to call 6.1 converter for each `plugin/agents/*.md` and write to `plugin-codex/agents/<name>.toml`.
   - Verify: 12 TOML files appear in `plugin-codex/agents/`; `cf install --agent codex` deploys them to `~/.codex/agents/`; Codex can spawn the named `cf-explorer` custom agent.
   - Rollback: re-run build with converter disabled.

3. **6.3 Render Codex-native dispatch**
   - Files: `scripts/build-codex-plugin.js` (edit), test
   - When the build renders Claude `Agent`/`subagent_type` instructions, replace them with explicit Codex natural-language custom-agent spawning:
     ```
     Spawn a subagent named `NAME` with the following instructions:
     <prompt>
     Wait for it to finish and use its output.
     ```
   - Verify with source-to-Codex fixture tests and generated-artifact lint.
   - Rollback: revert build script + test.

## Exit criteria

- `plugin-codex/agents/` contains 12 valid TOML files
- `cf install --agent codex` deploys those TOMLs to `~/.codex/agents/`
- A Codex session with deployed custom agents can spawn `cf-explorer` and receive output
- Generated agent files contain no Anthropic model IDs or undocumented `tools` keys

## Phase 6 validation

- Converter tests: `node --test scripts/__tests__/agent-md-to-toml.test.mjs`
- Build transform tests: `node --test scripts/__tests__/build-codex-plugin.test.mjs`
- Placeholder lint: `node --test scripts/__tests__/placeholder-lint.test.mjs`
- Generated artifact: `npm run build:codex`
- Drift guard: `npm run verify:codex-drift`
- Agent count: `plugin-codex/agents/` contains 12 `cf-*.toml` files.
- Compatibility scan: no unresolved placeholders, raw `subagent_type`, Claude-only runtime tools, invalid model aliases, or `CLAUDE_PLUGIN_ROOT` remains in generated instructions.
