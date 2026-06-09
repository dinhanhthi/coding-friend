# Phase 1: Host abstraction

**Plan:** [README.md](./README.md)
**Type:** parallel
**Goal:** Add host-aware lib code in `cli/` without touching Claude paths. New files only; existing `paths.ts` exports stay as-is to preserve backward compatibility.

## Progress

| Status  | Task                                                                       |
| ------- | -------------------------------------------------------------------------- |
| ⬜ TODO | 1.1 Create `cli/src/lib/host.ts`                                           |
| ⬜ TODO | 1.2 Extend `cli/src/lib/paths.ts` with `codex*Path()` helpers              |
| ⬜ TODO | 1.3 Extend `cli/src/lib/prompt-utils.ts` with `--codex` flag in ScopeFlags |
| ⬜ TODO | 1.4 Add `cf-paths.sh` host adapter for hook scripts                        |

## Tasks

1. **1.1 Create `cli/src/lib/host.ts`** (new file)
   - Files: `cli/src/lib/host.ts` (new), `cli/src/lib/__tests__/host.test.ts` (new)
   - Export `type Host = "claude" | "codex"`, `function detectHostsAvailable(): Host[]` (probes via `commandExists("claude")`, `commandExists("codex")`), `function resolveHost(opts: { codex?: boolean }): Host` (returns `"codex"` if flag set, else `"claude"`), `function getCodexMinVersion(): string` returns `"0.130.0"`, `function checkCodexVersion(): { ok: boolean; actual?: string; min: string }`.
   - Verify: unit tests cover all paths; default returns claude.
   - Rollback: delete `host.ts` + test file.

2. **1.2 Extend `cli/src/lib/paths.ts`**
   - Files: `cli/src/lib/paths.ts` (edit — add only, no rename)
   - Add: `codexConfigDir()` → `~/.codex`, `codexConfigTomlPath()` → `~/.codex/config.toml`, `codexPluginsCacheDir()`, `codexMarketplaceClonePath()`, `codexInstalledPluginsPath()`, `codexProjectsDir()` → `~/.codex/sessions`, `codexSessionDir(date: Date)` → `~/.codex/sessions/YYYY/MM/DD`, `codexLocalMarketplacePath()` → `<cwd>/.agents/plugins/marketplace.json`, `codexAgentsDir()` → `~/.codex/agents/`.
   - Do NOT rename or remove any existing function — Claude paths stay byte-identical.
   - Verify: existing `paths.test.ts` passes unchanged; new tests cover Codex paths.
   - Rollback: revert paths.ts diff; delete added tests.

3. **1.3 Extend `prompt-utils.ts` with `--codex` flag**
   - Files: `cli/src/lib/prompt-utils.ts` (edit), `cli/src/index.ts` (edit — register flag on relevant commander commands), `cli/src/lib/__tests__/prompt-utils.test.ts` (edit)
   - Add `codex?: boolean` to `ScopeFlags` type. `resolveScope` ignores the flag (scope is host-orthogonal). Add new helper `resolveHostFlags(opts: { codex?: boolean }): { host: Host }` that returns the host so command code uses the same pattern as `resolveScope`.
   - Verify: existing scope tests pass; new test asserts `--codex` flag is parsed and produces `host: "codex"`.
   - Rollback: revert diffs.

4. **1.4 Add `cf-paths.sh` host adapter**
   - Files: `plugin/lib/cf-paths.sh` (edit)
   - At the top of `cf_resolve_paths()`, add `: "${CLAUDE_PLUGIN_ROOT:=${PLUGIN_ROOT:-}}"` so any hook script that uses `${CLAUDE_PLUGIN_ROOT}` resolves to Codex's `${PLUGIN_ROOT}` if set. This is a belt-and-braces: build script will still transform, but inline scripts (`source $PLUGIN_ROOT/lib/cf-paths.sh`) become host-agnostic.
   - Verify: existing Claude bash tests in `plugin/hooks/__tests__/` pass unchanged; add one test that sets `PLUGIN_ROOT` only and confirms `cf_resolve_paths` works.
   - Rollback: revert single-line addition.

## Exit criteria

- `cli/dist/` builds clean (`npm run build` in `cli/`)
- All existing tests pass (`npm test` in `cli/`)
- New `host.ts` tests pass
- No file in Claude install path (`cf install` without `--codex`) reads new Codex helpers
