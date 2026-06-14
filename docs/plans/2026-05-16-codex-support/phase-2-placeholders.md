# Phase 2: Placeholder convention + sweep

**Plan:** [README.md](./README.md)
**Type:** sequential
**Goal:** Keep `plugin/` publishable as valid Claude-native content while making every host-specific form deterministic for the one-way Codex renderer.

## Progress

| Status  | Task                                             |
| ------- | ------------------------------------------------ |
| ✅ DONE | 2.1 Define host rendering convention             |
| ✅ DONE | 2.2 Keep published Claude source fully resolved  |
| ✅ DONE | 2.3 Add source and generated-artifact lint tests |

## Tasks

1. **2.1 Define host rendering convention**
   - Files: `plugin/lib/PLACEHOLDERS.md` (new)
   - `plugin/` uses resolved Claude forms: `/cf-*`, `${CLAUDE_PLUGIN_ROOT}`, `subagent_type`, and Skill-tool invocation text.
   - `scripts/build-codex-plugin.js` transforms those forms to `$cf-*`, `${PLUGIN_ROOT}`, explicit custom-agent spawning, and Codex skill loading.
   - Host-specific workflow differences use `renderCodexFile()` overrides.
   - Rollback: delete the doc.

2. **2.2 Resolve all published source**
   - Files: every `plugin/skills/cf-*/SKILL.md` (21 files), every `plugin/agents/cf-*.md` (12 files), `plugin/context/bootstrap.md`, `CLAUDE.md`, `README.md` — only the source-of-truth copies, NOT `plugin-codex/` (that's generated)
   - Remove unresolved `{{cf:*}}` tokens from the published plugin and README.
   - Keep Claude behavior unchanged while the Codex build rewrites generated copies.
   - Verify: the Claude source lint reports no unresolved tokens.
   - Rollback: `git checkout -- plugin/ CLAUDE.md README.md plugin/context/bootstrap.md`.

3. **2.3 Add host compatibility lint**
   - Files: `scripts/__tests__/placeholder-lint.test.ts` (new) or shell test under `plugin/hooks/__tests__/`
   - Source test: fail if published Markdown contains unresolved `{{cf:*}}`.
   - Artifact test: fail if Codex instructions contain Claude-only runtime APIs, unresolved roots, invalid model aliases, or undocumented agent `tools` keys.
   - Rollback: delete test file.

## Exit criteria

- Published Claude skill paths and commands are executable as written.
- Generated Codex instructions contain no Claude-only runtime APIs.
- Lint and build-transform tests pass.
