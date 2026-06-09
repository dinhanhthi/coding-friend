# Phase 2: Placeholder convention + sweep

**Plan:** [README.md](./README.md)
**Type:** sequential
**Goal:** Define a host-neutral placeholder syntax inside skills/agents/docs, then sweep every existing reference. After this phase, `plugin/` source is host-agnostic and ready to be rendered for both Claude and Codex by Phase 3 build script.

## Progress

| Status  | Task                                             |
| ------- | ------------------------------------------------ |
| ⬜ TODO | 2.1 Define placeholder convention doc            |
| ⬜ TODO | 2.2 Sweep all SKILL.md / agent .md / shared docs |
| ⬜ TODO | 2.3 Add placeholder lint test                    |

## Tasks

1. **2.1 Define placeholder convention** (new doc)
   - Files: `plugin/lib/PLACEHOLDERS.md` (new)
   - Document the canonical placeholders the build script will render:
     - `{{cf:slash CMD}}` → Claude: `/CMD`, Codex: `$CMD` (e.g. `{{cf:slash cf-review}}` → `/cf-review` or `$cf-review`)
     - `{{cf:plugin_root}}` → Claude: `${CLAUDE_PLUGIN_ROOT}`, Codex: `${PLUGIN_ROOT}` (shell hook scripts only)
     - `{{cf:dispatch agent=NAME prompt="..."}}` → Claude: full `Agent` tool block with `subagent_type: "coding-friend:NAME"`; Codex: natural-language "Spawn a subagent named NAME with the following instructions: ..."
     - `{{cf:agent_ref NAME}}` → Claude: `subagent_type: "coding-friend:NAME"`; Codex: `$NAME`
     - `{{cf:host}}` → Claude: literal `Claude Code`, Codex: literal `Codex CLI` (for cosmetic doc strings)
   - Verify: doc reviewed; no real changes yet.
   - Rollback: delete the doc.

2. **2.2 Sweep all skill/agent/doc files**
   - Files: every `plugin/skills/cf-*/SKILL.md` (21 files), every `plugin/agents/cf-*.md` (12 files), `plugin/context/bootstrap.md`, `CLAUDE.md`, `README.md` — only the source-of-truth copies, NOT `plugin-codex/` (that's generated)
   - Replace every literal `/cf-review`, `/cf-commit`, `/cf-plan`, …, `${CLAUDE_PLUGIN_ROOT}` (in skill bodies/docs, NOT in `.sh` scripts yet — those stay raw), `subagent_type: "coding-friend:cf-..."` with the matching `{{cf:...}}` placeholder.
   - Hook script `.sh` files in `plugin/hooks/` keep `${CLAUDE_PLUGIN_ROOT}` raw — they are not transformed at source; the build script copies them and rewrites env vars for Codex.
   - Verify: `git grep -nE '/cf-[a-z]+' plugin/skills plugin/agents | grep -v '{{cf:'` returns only false-positives (URLs, file paths). Manual review required.
   - Rollback: `git checkout -- plugin/ CLAUDE.md README.md plugin/context/bootstrap.md`.

3. **2.3 Add placeholder lint test**
   - Files: `scripts/__tests__/placeholder-lint.test.ts` (new) or shell test under `plugin/hooks/__tests__/`
   - Test: scan `plugin/skills/`, `plugin/agents/`, fail if any raw `/cf-<name>` or `${CLAUDE_PLUGIN_ROOT}` appears in a `.md` file body (not code-blocks documenting placeholders themselves — allow inside ```).
   - Verify: test passes after sweep; would fail if drift introduced.
   - Rollback: delete test file.

## Exit criteria

- All 21 SKILL.md + 12 agents.md + 3 shared docs use placeholders
- Lint test passes
- A diff of `plugin/skills/` shows ONLY placeholder substitutions (no semantic changes)
