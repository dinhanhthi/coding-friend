# Phase 8: Tests

**Plan:** [README.md](./README.md)
**Type:** parallel
**Goal:** Net new test coverage for Codex + regression guard for Claude. Each task touches disjoint test files.

## Progress

| Status  | Task                                                |
| ------- | --------------------------------------------------- |
| ⬜ TODO | 8.1 Unit tests for host abstraction & TOML helpers  |
| ⬜ TODO | 8.2 Codex e2e install smoke test                    |
| ⬜ TODO | 8.3 Build-script idempotence + transform fixtures   |
| ⬜ TODO | 8.4 Claude regression guard (no behavioral changes) |

## Tasks

1. **8.1 Unit tests**
   - Files: `cli/src/lib/__tests__/host.test.ts`, `cli/src/lib/__tests__/codex-toml.test.ts` (new — TOML mutate helper), `cli/src/lib/__tests__/prompt-utils.test.ts` (extend), `cli/src/lib/__tests__/paths.test.ts` (extend)
   - Cover: host detection, min-version check, `--codex` flag parsing, TOML round-trip (read → mutate → write preserves comments + ordering), every new Codex path helper
   - Verify: `cd cli && npm test` passes; coverage report shows >90% on new code
   - Rollback: delete added tests.

2. **8.2 Codex e2e smoke**
   - Files: `cli/src/commands/__tests__/codex-install.e2e.test.ts` (new, runs in `vitest.e2e.config.ts`)
   - Scenario:
     - Temp `$HOME/.codex/` sandbox via env override
     - Run `cf install --codex` programmatically (or via CLI shell-out)
     - Verify marketplace added, plugin enabled in config.toml, MCP registered
     - Run `cf uninstall --codex` to undo; verify cleanup
   - Gated by `commandExists("codex")` — skips on machines without Codex
   - Verify: passes locally; CI has a `codex-cli` setup step (Phase 10)
   - Rollback: delete file.

3. **8.3 Build-script fixtures**
   - Files: `scripts/__tests__/build-codex-plugin.test.ts` (extend), `scripts/__tests__/fixtures/` (new — sample SKILL.md, agent.md, hooks.json)
   - Cover:
     - Each placeholder type renders correctly for both Claude (no-op) and Codex
     - `hooks.json` event allowlist drops non-Codex events
     - Two consecutive `npm run build:codex` runs produce zero diff
     - Missing `plugin/` source fails fast with clear error
   - Verify: tests pass; fixtures committed.
   - Rollback: delete tests + fixtures.

4. **8.4 Claude regression guard**
   - Files: `cli/src/commands/__tests__/install.test.ts` (extend), `plugin/hooks/__tests__/*.test.ts` (re-verify intact)
   - Add explicit assertions that `cf install` (no flag) produces byte-identical behavior to pre-Codex baseline. Use a snapshot of the command sequence captured before Phase 1 began.
   - Verify: full test suite green; snapshot diff on Claude install is empty.
   - Rollback: revert snapshot file.

## Exit criteria

- `cd cli && npm test` (unit + hooks + e2e configs) all green
- `npm run verify:codex-drift` exits 0
- Claude install/uninstall behavior unchanged (snapshot test)
