# Plan: Codex Support for Coding Friend

**Mode:** hard
**Created:** 2026-05-16
**Status:** ⬜ TODO
**Supersedes (Codex slice):** [2026-02-21-multi-platform-support.md](../2026-02-21-multi-platform-support.md) — old plan assumed Codex had no plugin/hook system; Codex CLI v0.130.0 now ships full plugin/hooks/agents/skills/MCP support.

## Overview

Add Codex CLI as a first-class plugin host alongside Claude Code. Single source tree, two plugin folders, build-time transform for host-specific differences. Claude remains the default and is never broken; Codex is opt-in via `--agent codex`.

Locked decisions (Round 1 discovery + adopted from Codex agent's cross-review):

1. Install UX: `cf install --agent codex` (extensible flag, default `claude`), hosts independent
2. Memory: shared `docs/memory/` + single MCP daemon registered to both hosts
3. Slash refs: `{{cf:command}}` placeholder + build transform
4. Auto-approve on Codex: **deterministic-only v1** (no LLM classifier port); opt-in via `autoApprove.codex: true`; unknown → defer to Codex native approval
5. Architecture: 1 repo, 2 plugin folders (`plugin/` source + `plugin-codex/` committed artifact)
6. Versioning: locked `v*` ↔ `codex-v*` (same number)
7. `cf install --agent codex` installs ONLY Codex (no side-effect on Claude)
8. Build artifact committed + pre-commit hook + CI drift guard
9. Codex hooks installed via project `<cwd>/.codex/config.toml [hooks]` for trust clarity; plugin-bundled hooks also exist but require user trust review
10. `cf init --agent codex` generates project `AGENTS.md` (Codex equivalent of `CLAUDE.md`), gitignored by default
11. Codex session resume/fork uses native `codex resume` / `codex fork`; no CF-side session file parsing
12. `codex review` used as Codex-native second-pass reviewer where it fits the cf-review workflow

See [HOW-IT-WORKS.md](./HOW-IT-WORKS.md) for the user-journey explainer and the single-source-of-truth matrix.

## Not Building

- Cursor / Windsurf / Copilot / Roo / OpenCode / Antigravity (out of scope for this plan)
- A Codex equivalent of CF skills installed via `~/.agents/skills/` outside the plugin (we ship everything through the plugin)
- Auto-translating arbitrary user CLAUDE.md content to AGENTS.md (only CF-generated docs)
- Cross-host memory sync via network (memory stays project-local; shared inside a single project)

## Progress

| Status  | Phase                                   | File                                                           | Tasks   |
| ------- | --------------------------------------- | -------------------------------------------------------------- | ------- |
| ✅ DONE | Phase 0: Smoke tests & spike (3 GATING) | [phase-0-smoke-tests.md](./phase-0-smoke-tests.md)             | 7 tasks |
| ✅ DONE | Phase 1: Host abstraction               | [phase-1-host-abstraction.md](./phase-1-host-abstraction.md)   | 4 tasks |
| ⬜ TODO | Phase 2: Placeholder convention + sweep | [phase-2-placeholders.md](./phase-2-placeholders.md)           | 3 tasks |
| ⬜ TODO | Phase 3: Manifests + build pipeline     | [phase-3-manifests-build.md](./phase-3-manifests-build.md)     | 4 tasks |
| ⬜ TODO | Phase 4: CLI Codex commands             | [phase-4-cli-commands.md](./phase-4-cli-commands.md)           | 6 tasks |
| ⬜ TODO | Phase 5: Hooks port                     | [phase-5-hooks-port.md](./phase-5-hooks-port.md)               | 5 tasks |
| ⬜ TODO | Phase 6: Agents port                    | [phase-6-agents-port.md](./phase-6-agents-port.md)             | 3 tasks |
| ⬜ TODO | Phase 7: MCP + memory cohabitation      | [phase-7-mcp-memory.md](./phase-7-mcp-memory.md)               | 2 tasks |
| ⬜ TODO | Phase 8: Tests                          | [phase-8-tests.md](./phase-8-tests.md)                         | 4 tasks |
| ⬜ TODO | Phase 9: Docs & website                 | [phase-9-docs-website.md](./phase-9-docs-website.md)           | 5 tasks |
| ⬜ TODO | Phase 10: Release plumbing              | [phase-10-release-plumbing.md](./phase-10-release-plumbing.md) | 4 tasks |

**Total: 47 tasks across 11 phases.** (Phase 0 has 3 GATING probes that may force rewrites of Phase 4.1 or Phase 6 before implementation begins.)

## Assumptions

- **Codex CLI ≥ 0.130.0** is installed when user runs `cf install --agent codex`. Basis: verified on dev machine; pinned as min version in CLI check.
- **`codex plugin marketplace add owner/repo`** accepts the same input as Claude. Basis: `codex plugin marketplace add --help` output verified.
- **Codex plugin manifest schema** matches `developers.openai.com/codex/plugins/build` doc (verified against real OpenAI `github` plugin under `~/.codex/plugins/cache/`).
- **`CLAUDE_PLUGIN_ROOT` alias** is documented in current Codex plugin hooks. Build still transforms env var refs where it produces Codex artifacts, but source scripts can rely on the compatibility fallback.
- **Codex session JSONL** under `~/.codex/sessions/YYYY/MM/DD/*.jsonl` is readable for memory-capture; current hook input also includes `session_id` and `transcript_path`, but transcript format is not stable.
- **Codex hooks events** that overlap with Claude: SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, PermissionRequest, PreCompact, SubagentStart, SubagentStop. Missing on Codex: TaskCreated, TaskCompleted.
- **Codex subagents** use TOML format with `developer_instructions` field. CF agents stay authored as MD; build generates TOML and install/init deploys it to Codex agent directories.
- **MCP daemon** is host-agnostic; single instance can serve both Claude and Codex via stdio connections.
- **Plugin install location** is `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` — mirror of Claude's `~/.claude/plugins/cache/...`.

## Risks

- **`codex plugin install` is not scriptable.** Codex only exposes `marketplace {add,upgrade,remove}` in CLI v0.130.0. Phase 0.7 confirmed TOML-only enablement does not install a not-yet-installed plugin, so `cf install --agent codex` registers the marketplace and prints the one-time manual plugin directory instruction.
- **Plugin-bundled `agents/` are not a documented discovery path.** Phase 0.5 locks the robust path: `cf install --agent codex` deploys generated agent TOMLs into `~/.codex/agents/` directly instead of relying on plugin scan.
- **`marketplace add` may prompt for trust.** Phase 0.6 probes the non-interactive path. If only interactive, document.
- **Codex CLI is pre-1.0 (v0.130.0).** Plugin/hook schema may change. Mitigation: pin min version in `cf install --agent codex`; smoke-test on every CI run; document supported Codex version range.
- **Build artifact drift.** `plugin-codex/` is committed; PR author may forget to rebuild. Mitigation: pre-commit hook regenerates + CI drift check fails PR with non-empty diff.
- **Auto-approve port correctness.** Schema differs (`hookSpecificOutput.decision.behavior` vs Claude's `decision`). Mitigation: keep opt-in separate from Claude (`autoApprove.codex`); add fixture tests; deny-by-default on unknown patterns.
- **Memory MCP contention.** SQLite WAL handles reads; writes serialize. Mitigation: existing daemon already single-writer-multi-reader; just register MCP with both hosts.
- **Auto-capture fragility on Codex**: current Codex supports `PreCompact` and exposes `transcript_path`, but transcript format is not stable. Mitigation: use `PreCompact` first and keep a `Stop` fallback/throttle for long sessions if needed.
- **Agent dispatch translation.** Claude uses `Agent` tool + `subagent_type: "coding-friend:cf-explorer"`. Codex uses spawn-agents tool or `$cf-name` mention. Mitigation: `{{cf:dispatch agent=... prompt=...}}` placeholder; build renders to host-specific syntax.
- **Tag namespace bloat.** Add `codex-v*` tag pattern. Mitigation: GA workflow auto-tags `codex-v$VERSION` whenever `v$VERSION` is tagged.

## Migration & Rollback

- **Overall rollback strategy:** Two-tier. (1) Revert `plugin-codex/` build artifact + Codex marketplace.json → Codex install path fails fast (intended). (2) Revert `plugin/` placeholder sweep + CLI `--agent codex` code → return to pre-Codex state with Claude untouched. Each phase commit is independently revertable.
- **Point of no return:** Phase 3 commit that adds `.agents/plugins/marketplace.json` and publishes the first `codex-v*` tag. Once external users install Codex plugin, removing it would break their setup.
- **Incremental deployment:** Phases 0–7 land before any user-facing Codex feature is announced. Phase 8 tests must pass. Phase 9 docs ship same release. Phase 10 release plumbing is the last gate — only that tag turns Codex support GA.
- **Feature flag:** All Codex paths in CLI are dormant until user passes `--agent codex` (or a compatibility alias). No env var or auto-detection enables Codex implicitly.

## Integration

- **Works with:** All existing skills (auto-discoverable on both hosts after Phase 2 placeholder sweep), memory MCP, statusline (Codex has TUI customization in config.toml).
- **Auto-invokes:** N/A — this is infrastructure, not a skill.
- **Invoked by this:** Build script auto-runs in pre-commit and CI; `cf install --agent codex` invokes the Codex plugin marketplace.
- **Replaces/overlaps:** Supersedes the Codex slice of [2026-02-21-multi-platform-support.md](../2026-02-21-multi-platform-support.md). Other platforms in that plan remain open work.

## Next Steps

After implementation: `/cf-review` → `/cf-commit` → tag `v$NEW` + `codex-v$NEW` together.
