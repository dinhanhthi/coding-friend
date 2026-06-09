# Phase 4: CLI Codex commands

**Plan:** [README.md](./README.md)
**Type:** parallel (all 6 tasks edit independent files; only `cli/src/index.ts` is touched serially)
**Goal:** Add `--agent codex` support to every lifecycle command without changing default Claude behavior. `--codex` may remain as a compatibility alias, but `--agent <claude|codex>` is the public extensible flag. Each command branches on `resolveHostFlags(opts).host`.

**File-overlap note:** Each task edits ONE distinct command file plus its test. `cli/src/index.ts` registers the new flag — that registration is consolidated into 4.6 to avoid concurrent edits.

## Progress

| Status  | Task                                                |
| ------- | --------------------------------------------------- |
| ✅ DONE | 4.1 `cf install --agent codex`                      |
| ✅ DONE | 4.2 `cf uninstall --agent codex`                    |
| ✅ DONE | 4.3 `cf enable --agent codex` / `cf disable --agent codex` |
| ✅ DONE | 4.4 `cf update --agent codex`                       |
| ✅ DONE | 4.5 `cf init --agent codex` + `cf permission --agent codex` |
| ✅ DONE | 4.6 Register host flags in commander entrypoint     |

## Tasks

1. **4.1 `cf install --agent codex`**
   - Files: `cli/src/commands/install.ts` (edit), `cli/src/commands/__tests__/install.test.ts` (edit)
   - Branch: if `host === "codex"`:
     - Check `commandExists("codex")` (instead of `claude`)
     - Run `checkCodexVersion()` — fail if < 0.130.0 with upgrade instructions
     - Marketplace add: `codex plugin marketplace add dinhanhthi/coding-friend` (gracefully handle "already registered" by checking `~/.codex/config.toml` `[marketplaces]`)
     - Plugin install via Codex `/plugins` / Plugins UI is not scriptable today. Phase 0.7 confirmed config-only enablement does not install a not-yet-installed plugin. Print a banner: "Open Codex and run `/plugins` → Install coding-friend."
     - Deploy generated agent TOMLs into `~/.codex/agents/`.
     - Auto-update flag: Codex equivalent of marketplace auto-update if exposed via CLI (`codex plugin marketplace upgrade` is on-demand only — document this gap, no equivalent of Claude's `marketplaces.<m>.autoUpdate`).
   - Verify: dry-run test mocks `commandExists` and `run`; asserts correct sequence; existing Claude install test still passes.
   - Rollback: revert `install.ts`.

2. **4.2 `cf uninstall --agent codex`**
   - Files: `cli/src/commands/uninstall.ts` (edit), test
   - Branch: write `enabled = false` for `[plugins."coding-friend@coding-friend-marketplace"]` in `~/.codex/config.toml` (TOML parse → mutate → write back); optionally `codex plugin marketplace remove coding-friend-marketplace` if user passes `--remove-marketplace`.
   - Verify: test confirms TOML edit preserves other keys.
   - Rollback: revert.

3. **4.3 `cf enable --agent codex` / `cf disable --agent codex`**
   - Files: `cli/src/commands/enable.ts`, `cli/src/commands/disable.ts` (edit each), tests
   - Branch: toggle `[plugins."coding-friend@coding-friend-marketplace"] enabled = true|false` in `~/.codex/config.toml` via the same TOML helper used by 4.2.
   - Verify: tests cover enable→disable→enable cycle; idempotent.
   - Rollback: revert.

4. **4.4 `cf update --agent codex`**
   - Files: `cli/src/commands/update.ts` (edit), test
   - Branch: run `codex plugin marketplace upgrade coding-friend-marketplace`. Read installed version from `~/.codex/plugins/cache/coding-friend-marketplace/coding-friend/<version>/.codex-plugin/plugin.json` and compare to npm-published `coding-friend-cli` version (semver comparison reuses existing helper).
   - Verify: test mocks the upgrade command; asserts version-bump flow.
   - Rollback: revert.

5. **4.5 `cf init --agent codex` + `cf permission --agent codex`**
   - Files: `cli/src/commands/init.ts` (edit), `cli/src/commands/permission.ts` (edit), tests
   - `init --agent codex`: registers MCP `coding-friend-memory` in `[mcp_servers.coding-friend-memory]` in `~/.codex/config.toml`, writes root `<cwd>/AGENTS.md`, and writes project `.codex/config.toml` / `.codex/agents/*.toml` as needed.
   - **Trust level — explicit consent only:** if user passes `--trust-project`, set `[projects."<cwd>"] trust_level = "trusted"`. **Never silently set this** — trust is a security decision belonging to the user. Without the flag, print "To enable project-scoped config, run `cf init --agent codex --trust-project` or trust manually via Codex."
   - `permission --agent codex`: manages `autoApproveCodex` flag in `.coding-friend/config.json` (Phase 5 hook reads this). This deliberately avoids changing the existing Claude `autoApprove` boolean schema. Provides `--enable-auto-approve` / `--disable-auto-approve` flags. Default OFF on Codex even if Claude has auto-approve enabled.
   - Verify: TOML mutations don't clobber existing keys; config.json mutations preserve other fields; no `trust_level` written without `--trust-project`.
   - Rollback: revert each file.

6. **4.6 Register host flags**
   - Files: `cli/src/index.ts` (edit)
   - Add `.option("--agent <agent>", "Operate on host agent: claude or codex", "claude")` to every command that 4.1–4.5 touches. Add `.option("--codex", "Alias for --agent codex")` only if it is low-risk.
   - Verify: `cf install --help` shows the flag; `cf install --agent codex` reaches the install command with `host: "codex"`.
   - Rollback: revert.

## Exit criteria

- `cf install --agent codex` (with mocked codex CLI) executes the full install path without errors
- All Claude lifecycle tests pass unchanged (regression guard)
- New Codex tests cover happy path + min-version-fail + already-installed cases
- `cf init --agent codex` writes a valid `~/.codex/config.toml` snippet that Codex can parse (`codex --help` still works after the edit)

## Phase 4 validation

- Focused affected suite: `npx vitest run src/lib/__tests__/codex-config.test.ts src/lib/__tests__/config.test.ts src/commands/__tests__/install.test.ts src/commands/__tests__/uninstall.test.ts src/commands/__tests__/enable.test.ts src/commands/__tests__/disable.test.ts src/commands/__tests__/update.test.ts src/commands/__tests__/permission.test.ts`
- Build: `npm run build`
- Smoke: `cf init --agent codex --trust-project` with temp `CODEX_HOME` produced parseable Codex TOML; `codex --help` accepted it.
- Full `npm test` requires unsandboxed local IPC/socket listeners for `tsx` and cf-memory daemon tests. Sandbox execution fails with `EPERM`; the required escalation request was rejected by the environment because the workspace is out of credits.
