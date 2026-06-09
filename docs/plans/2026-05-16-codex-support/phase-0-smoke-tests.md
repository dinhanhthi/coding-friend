# Phase 0: Smoke tests & spike

**Plan:** [README.md](./README.md)
**Type:** sequential
**Goal:** Verify Codex CLI runtime assumptions before writing production code. Each task either confirms an assumption or surfaces a gap that changes a downstream task.

## Progress

| Status  | Task                                                          |
| ------- | ------------------------------------------------------------- |
| ✅ DONE | 0.1 Probe `CLAUDE_PLUGIN_ROOT` alias under Codex hooks (info) |
| ✅ DONE | 0.2 Verify SKILL.md discovery from a Codex plugin             |
| ✅ DONE | 0.3 Inspect Codex session JSONL format                        |
| ✅ DONE | 0.4 Verify PermissionRequest hook output schema               |
| ✅ DONE | 0.5 **GATING** — Plugin-bundled `agents/` discovery           |
| ✅ DONE | 0.6 **GATING** — Non-interactive `marketplace add`            |
| ✅ DONE | 0.7 **GATING** — How to "install" a plugin without TUI step   |

## Tasks

1. **0.1 Probe `CLAUDE_PLUGIN_ROOT` alias** (informational only — does NOT gate)
   - Files: create temp scratch plugin under `/tmp/cf-codex-probe/` with `.codex-plugin/plugin.json` + `hooks/hooks.json` that logs `env | grep -i plugin_root` to `/tmp/cf-probe.log` on `SessionStart`. Register via `codex plugin marketplace add /tmp/cf-codex-probe`. Run `codex exec "hello"`. Inspect log.
   - Verify: `PLUGIN_ROOT` is always set; `CLAUDE_PLUGIN_ROOT` may or may not be set. Record actual behavior in `docs/plans/2026-05-16-codex-support/probe-results.md`.
   - Outcome: We transform regardless in Phase 3 build script, so result is informational. If alias works, source-of-truth scripts under `plugin/hooks/` need no Phase 2 sweep; if not, they're transformed at build. Either way the plan is unchanged.
   - Rollback: `codex plugin marketplace remove cf-codex-probe`; `rm -rf /tmp/cf-codex-probe /tmp/cf-probe.log`.

2. **0.2 Verify SKILL.md discovery**
   - Files: extend the same scratch plugin from 0.1 with `skills/cf-probe/SKILL.md` containing `---\nname: cf-probe\ndescription: probe skill\n---\nReturn the string PROBE_OK.` Run `codex` interactive and type `$cf-probe`. Confirm Codex picks up the skill.
   - Verify: skill body executes; document any frontmatter field rejected.
   - Outcome: Confirms Phase 2 SKILL.md format is compatible. If Codex rejects extra Claude frontmatter fields (e.g. `allowed-tools`) → build transform must strip them.
   - Rollback: same as 0.1.

3. **0.3 Inspect Codex session JSONL format**
   - Files: read `~/.codex/sessions/2026/05/16/*.jsonl` (use any recent file). Document schema fields: timestamp, role, content, tool_use shape, etc.
   - Verify: schema documented in `docs/plans/2026-05-16-codex-support/probe-results.md` alongside Claude's `~/.claude/projects/<encoded>/*.jsonl` for comparison.
   - Outcome: Determines parser shape for Codex memory-capture in Phase 5 (memory-capture.sh Codex variant).
   - Rollback: read-only inspection — nothing to undo.

4. **0.4 Verify PermissionRequest output schema**
   - Files: extend scratch plugin with `hooks/hooks.json` adding a `PermissionRequest` handler that always returns `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow","message":"probe"}}}`. Run a Codex command that triggers permission (e.g. write to a sandbox-restricted path). Confirm Codex respects the allow decision.
   - Verify: schema accepted by Codex; document the exact JSON path Codex parses (`hookSpecificOutput.decision.behavior` vs `decision.behavior`).
   - Outcome: Locks the schema for the Codex auto-approve port in Phase 5.
   - Rollback: same as 0.1.

5. **0.5 GATING — Plugin-bundled `agents/` discovery**
   - Why this is gating: Codex plugin-build docs list `skills`, `mcpServers`, `apps`, `hooks` as plugin pointers — agents are NOT listed. The subagents doc says agents load from `~/.codex/agents/` or `<repo>/.codex/agents/`. If Codex doesn't scan plugin-bundled `agents/`, Phase 6 ships 12 TOML files that do nothing.
   - Files: extend scratch plugin from 0.1 with `agents/cf-probe-agent.toml` (`name = "cf-probe-agent"`, `description = "..."`, `developer_instructions = "Reply with PROBE_AGENT_OK"`). Run `codex` and try to spawn `$cf-probe-agent`. Confirm activation.
   - If discoverable: keep Phase 6 as written.
   - If NOT discoverable: **rewrite Phase 6**. `cf install --agent codex` writes each agent TOML into `~/.codex/agents/cf-*.toml` directly (config mutation, not plugin file). Build script still generates the TOML; install command copies them. Phase 4.1 grows by one step (agent file deploy).
   - Verify: probe-results.md documents discovery path + chosen Phase 6 shape.
   - Rollback: clean scratch plugin.

6. **0.6 GATING — Non-interactive `marketplace add`**
   - Why gating: `codex plugin marketplace add` may prompt for trust on first add (Codex security model). If interactive, `cf install --agent codex` blocks in CI.
   - Files: run `echo '' | codex plugin marketplace add /tmp/cf-codex-probe < /dev/null 2>&1 | tee /tmp/cf-mp-add.log` and inspect exit code + output. Try with `-c 'features.trust_marketplaces=true'` or similar override if a prompt appears.
   - If non-interactive succeeds: Phase 4.1 unchanged.
   - If interactive: find the flag/env that dismisses (search `codex plugin marketplace add --help` and `codex` source — repo is open-source). If none, Phase 4.1 documents that `cf install --agent codex` requires a one-time interactive run.
   - Verify: probe-results.md records the exact command used and result.
   - Rollback: `codex plugin marketplace remove cf-codex-probe`.

7. **0.7 GATING — "Install" without TUI step**
   - Why gating: Codex CLI exposes `marketplace add/upgrade/remove` but not `plugin install`. Plugin install happens via `/plugins` interactive UI. We need a non-TUI path for `cf install --agent codex` to honor its one-shot promise.
   - Files: try three approaches in order, document each:
     - **(A) TOML-only:** after `marketplace add`, write `[plugins."coding-friend@coding-friend-marketplace"] enabled = true` to `~/.codex/config.toml` and start `codex exec "noop"`. Does the plugin activate? (Confirm via SessionStart hook firing — the scratch plugin from 0.1 already has one.)
     - **(B) Config override:** `codex -c 'plugins."coding-friend@coding-friend-marketplace".enabled=true' exec "noop"`. Does that one-shot side-effect persist?
     - **(C) Honest fallback:** `cf install --agent codex` does `marketplace add` then prints "Run `codex` and select `/plugins → Install coding-friend` once."
   - Outcome: lock the winning approach in probe-results.md. **Approach A is the target.** If only C works, `cf install --agent codex` becomes "register + instruct" and we update README accordingly.
   - Verify: probe-results.md picks A/B/C and updates Phase 4.1 to match.
   - Rollback: clean TOML edits.

## Exit criteria

`docs/plans/2026-05-16-codex-support/probe-results.md` exists and documents:

- `CLAUDE_PLUGIN_ROOT` alias status (info)
- SKILL.md fields accepted/rejected by Codex
- Codex session JSONL schema (role keys, content shape, tool-use representation)
- PermissionRequest output JSON shape
- **Agent discovery path chosen → Phase 6 shape locked**
- **Marketplace add non-interactive method confirmed → Phase 4.1 UX locked**
- **Plugin "install" approach A/B/C chosen → Phase 4.1 UX locked**

Status: complete. See [probe-results.md](./probe-results.md).

If any GATING probe (0.5, 0.6, 0.7) forces a Phase rewrite, **pause** and update the corresponding phase file before proceeding. Informational probes (0.1) may proceed regardless.
