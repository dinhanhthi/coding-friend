# Phase 8: Tests

**Plan:** [README.md](./README.md)
**Type:** parallel
**Goal:** Net new test coverage for Codex + regression guard for Claude. Each task touches disjoint test files.

## Progress

| Status  | Task                                                |
| ------- | --------------------------------------------------- |
| ✅ DONE | 8.1 Unit tests for host abstraction & TOML helpers  |
| ✅ DONE | 8.2 Codex install smoke coverage                    |
| ✅ DONE | 8.3 Build-script idempotence + transform fixtures   |
| ✅ DONE | 8.4 Claude regression guard (no behavioral changes) |

## Tasks

1. **8.1 Unit tests**
   - Files: `cli/src/lib/__tests__/host.test.ts`, `cli/src/lib/__tests__/codex-config.test.ts`, `cli/src/lib/__tests__/prompt-utils.test.ts`, `cli/src/lib/__tests__/paths.test.ts`
   - Cover: host detection, min-version check, `--codex` flag parsing, TOML mutation preservation, generated-vs-installed Codex agent source lookup, and Codex path helper edge cases
   - Verify: focused Vitest unit run passes
   - Rollback: delete added tests.

2. **8.2 Codex install smoke coverage**
   - Files: `cli/src/commands/__tests__/install.test.ts`
   - Scenario: programmatic `cf install --agent codex` branch with mocked Codex CLI presence and version, marketplace registration, plugin enablement, and agent deployment
   - Decision: do not add a real `codex` e2e shell-out in this phase. Codex CLI v0.130.0 cannot fully script plugin install, the current e2e harness needs a working-directory fix before new shell-outs, and real external CLI setup belongs to Phase 10 CI/release plumbing.
   - Verify: focused install command test passes.
   - Rollback: delete added test assertions.

3. **8.3 Build-script fixtures**
   - Files: `scripts/__tests__/build-codex-plugin.test.mjs`
   - Cover:
     - Each placeholder type renders correctly for Codex
     - `hooks.json` event allowlist drops non-Codex events
     - Two consecutive build runs over a temp fixture repo produce identical output
     - Missing `plugin/` source fails fast with clear error
   - Verify: Node test runner passes; `npm run verify:codex-drift` exits 0.
   - Rollback: delete tests.

4. **8.4 Claude regression guard**
   - Files: `cli/src/commands/__tests__/install.test.ts` (extend), `plugin/hooks/__tests__/*.test.ts` (re-verify intact)
   - Add explicit assertions that `cf install` (no flag) still resolves to Claude, runs the Claude marketplace/install command sequence, and does not call Codex config helpers.
   - Verify: focused install test and hook suite pass.
   - Rollback: revert snapshot assertion.

## Exit criteria

- ✅ `node --test scripts/__tests__/build-codex-plugin.test.mjs scripts/__tests__/agent-md-to-toml.test.mjs scripts/__tests__/placeholder-lint.test.mjs`
- ✅ `cd cli && npx vitest run src/lib/__tests__/host.test.ts src/lib/__tests__/prompt-utils.test.ts src/lib/__tests__/paths.test.ts src/lib/__tests__/codex-config.test.ts src/commands/__tests__/install.test.ts`
- ✅ `cd cli && npm run test:hooks`
- ✅ `npm run verify:codex-drift`
- ✅ Final release-candidate validation ran the full CLI suite outside the restricted sandbox: 59 Vitest files / 858 tests plus 7 hook files / 558 tests, 1,416 tests total, all passing.
