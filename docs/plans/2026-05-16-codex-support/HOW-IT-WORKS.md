# How Codex Support Works in Coding Friend

Companion to [README.md](./README.md). Answers six concrete questions about user journeys, feature mapping, update flow, and source-of-truth structure.

> **Status:** this document describes the intended end-state after the plan in `README.md` ships. Phase 0 GATING probes may force minor rewrites (Phase 4.1 install UX or Phase 6 agent deploy path) — those will be reflected here on landing.

---

## 1. User journeys

### 1.1 Codex-only user (no Claude installed)

1. User installs Codex CLI (`brew install --cask codex` or `npm i -g @openai/codex`) — outside CF.
2. `npm i -g coding-friend-cli` — installs `cf` binary. No Claude dependency.
3. `cf install --agent codex`:
   - Verifies `codex --version` ≥ `0.130.0`. Fails fast with upgrade link if older.
   - Does NOT check for `claude` binary. Does NOT touch `~/.claude/`.
   - Runs `codex plugin marketplace add dinhanhthi/coding-friend`.
   - Registers the marketplace and prints the required one-time plugin directory step: open Codex and install `coding-friend` from `/plugins` / Plugins UI. Phase 0.7 confirmed config-only enablement does not install a not-yet-installed plugin.
   - Deploys generated CF agent TOMLs to `~/.codex/agents/`.
   - Registers the Memory MCP server in `~/.codex/config.toml` `[mcp_servers.coding-friend-memory]` pointing at the local `cf mcp` daemon.
4. In a project: `cf init --agent codex`:
   - Generates a root `AGENTS.md` (Codex's equivalent of `CLAUDE.md`), gitignored by default. Contains the same coding-friend rules section, but rendered with Codex-flavored guidance (`$cf-review` instead of `/cf-review`).
   - Writes `<project>/.codex/config.toml` with a CF-managed block: `[hooks]` for SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/PreCompact/Stop/PermissionRequest/SubagentStart/SubagentStop, `[mcp_servers.coding-friend-memory]` for project-local Memory MCP (optional; user-global already covers).
   - Trust level NOT auto-set. User must pass `--trust-project` to add `[projects."<cwd>"] trust_level = "trusted"`.
5. From now on: open Codex (`codex` interactive). All `$cf-*` skills work (`$cf-plan`, `$cf-fix`, `$cf-review`, …). `cf` CLI commands (`cf memory`, `cf clean`, `cf status --agent codex`, …) work as in the Claude flow.

**Result:** Zero `~/.claude/` files. Zero Claude binary. CF works end-to-end on Codex alone.

### 1.2 New user who wants BOTH platforms (no CF before)

1. Install both binaries: `claude` + `codex`.
2. `npm i -g coding-friend-cli`.
3. Run both install commands (order doesn't matter, they're independent):
   ```bash
   cf install            # registers the Claude plugin marketplace + plugin
   cf install --agent codex  # registers the Codex plugin marketplace + plugin
   ```
4. Each session uses whichever host the user launches. Memory is shared (single `docs/memory/` per project, single SQLite DB managed by the `cf mcp` daemon).
5. The same `cf` binary handles all CLI lifecycle for both hosts. `cf status` shows the Claude side; `cf status --agent codex` shows the Codex side. `cf status --all` (added in Phase 4) shows both.

**Result:** Both plugins enabled. Skills/agents available on both hosts under their respective slash syntax. Memory writes from one host are visible from the other.

### 1.3 Existing Claude user adds Codex

1. Claude side is already set up (`cf install` previously run). Nothing changes.
2. `cf install --agent codex`:
   - **Additive only.** Does not touch `~/.claude/`, `.claude-plugin/`, or any Claude-side config.
   - Adds the Codex marketplace + plugin + MCP.
3. In a project where the user wants Codex: `cf init --agent codex` writes the `AGENTS.md` and `.codex/config.toml`. Existing `CLAUDE.md` and `.coding-friend/config.json` stay untouched.
4. Memory carry-over is automatic: it lives in `<project>/docs/memory/` and is managed by the same `cf mcp` daemon. Past Claude sessions' captured episodes are immediately searchable from a new Codex session.

**Result:** A Claude session continues to behave exactly as before. A new Codex session in the same project sees the same memory, the same skills (in `$cf-*` form), the same agents.

### 1.4 Claude user quits Claude and goes Codex-only

1. `cf uninstall` (default flag = `--agent claude`):
   - Removes the Claude plugin (`claude plugin uninstall coding-friend@coding-friend-marketplace`).
   - Optionally removes the marketplace registration (`--remove-marketplace`).
   - Does NOT delete `~/.claude/` itself — that's the Claude CLI's problem, not CF's.
   - Does NOT delete `<project>/.coding-friend/` or `<project>/docs/memory/`. Those are host-agnostic project assets and survive.
   - Does NOT delete `<project>/CLAUDE.md`. It's a plain markdown file the user might still want as reference; deletion left to the user.
2. `cf install --agent codex` and `cf init --agent codex` per §1.1.
3. The project's `docs/memory/` carries forward unchanged. Memory captured during the Claude era is fully accessible to the Codex era.

**Result:** Claude binaries optional. CF + memory + project context migrates losslessly to Codex.

---

## 2. How each current CF feature works on each host

The table below maps every feature visible to a user today and how it behaves on Claude vs Codex. **Future updates** flow through the path marked in the "Update path" column.

| Feature                                                                                     | Claude today                                                                                             | Codex equivalent                                                                                                             | Update path                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slash commands** (`/cf-plan`, `/cf-review`, …)                                            | Native Claude slash                                                                                      | `$cf-plan`, `$cf-review` (Codex skill mention syntax)                                                                        | Edit `plugin/skills/cf-*/SKILL.md` source. `npm run build:codex` regenerates `plugin-codex/skills/*/SKILL.md` with `$cf-*` form. Single source-of-truth.                                     |
| **Auto-invoked skills** (`cf-tdd`, `cf-sys-debug`, `cf-verification`, `cf-help`)            | Loaded via Claude's skill-discovery + body trigger words                                                 | Loaded via Codex's `description`-based skill matching                                                                        | Same as above. Codex auto-match keyword field is `description` (already required in CF skills).                                                                                              |
| **Subagents** (`cf-explorer`, `cf-planner`, `cf-implementer`, `cf-reviewer*`, `cf-writer*`) | `plugin/agents/cf-*.md` with frontmatter, dispatched via `Agent` tool                                    | `plugin-codex/agents/cf-*.toml` generated from MD and deployed to Codex agent dirs; dispatched via Codex native subagent spawn (`$cf-name`) | Edit MD source. Build script converts MD→TOML. Install/init deploys generated TOMLs to `~/.codex/agents/` or project `.codex/agents/`.                              |
| **Memory store** (`docs/memory/`, MCP tools)                                                | Memory MCP registered via `claude mcp add` + `.mcp.json`                                                 | Memory MCP registered in `~/.codex/config.toml [mcp_servers]` and/or project `.codex/config.toml`                            | Same daemon (`cf mcp`). One source. Two registrations.                                                                                                                                       |
| **Auto-approve**                                                                            | `plugin/hooks/auto-approve.cjs` — Sonnet LLM classifier on PreToolUse                                    | `plugin/hooks/auto-approve.codex.cjs` — **deterministic allow/block ONLY** in v1; unknown → defer to Codex native approval   | **Forked.** v1 keeps logic minimal; Claude classifier and Codex deterministic list both need updating when new safe patterns are added.                                                      |
| **Memory auto-capture**                                                                     | `memory-capture.sh` on `PreCompact`                                                                      | `memory-capture.codex.sh` on `PreCompact`, with optional `Stop` fallback/throttle                                            | **Forked lightly.** Current Codex supports `PreCompact` and `transcript_path`; parser differs, capture heuristics shared.                                                                                                       |
| **Privacy block**                                                                           | `privacy-block.sh` on `PreToolUse` (Read/Write/Edit)                                                     | Same script, same hook event, same matcher                                                                                   | **Shared.** Build script just substitutes `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}` in the registered command path.                                                                         |
| **Scout block**                                                                             | `scout-block.cjs` on `PreToolUse` (Read/Glob/Grep)                                                       | Same                                                                                                                         | **Shared.**                                                                                                                                                                                  |
| **Rules reminder**                                                                          | `rules-reminder.sh` on `UserPromptSubmit`                                                                | Same                                                                                                                         | **Shared.**                                                                                                                                                                                  |
| **Session init context**                                                                    | `session-init.sh` on `SessionStart` injects `<IMPORTANT>` context block                                  | Same script; adds `HOST: codex` to the block so skills can branch on host                                                    | **Shared.**                                                                                                                                                                                  |
| **Session log**                                                                             | `session-log.sh` on `Stop` (async)                                                                       | Same on `Stop`. Codex has no async; runs synchronously (small payload, fast)                                                 | **Shared with caveat.** Build script drops `"async": true` for Codex hooks.json.                                                                                                             |
| **Task/agent tracker**                                                                      | `task-tracker.sh` on `TaskCreated`/`TaskCompleted`; `agent-tracker.sh` on `SubagentStart`/`SubagentStop` | Agent tracker ports to Codex `SubagentStart`/`SubagentStop`; task tracker is not registered because Codex has no task events | **Partially shared.** Agent lifecycle tracking is shared; Todo/task tracking remains Claude-only.                                                                                                |
| **Statusline**                                                                              | `statusline.sh` reads CF status; rendered by Claude's statusLine setting                                 | Codex native `[tui.status_line]` config in `~/.codex/config.toml` (different rendering mechanism)                            | **Forked.** Claude shell script stays. Codex statusline config is generated by `cf statusline --agent codex`. Status semantics shared (memory state, last action, etc.) via a common helper. |
| **Permissions / sandbox**                                                                   | Claude permission rules in `.claude/settings.json`                                                       | Codex native `[permissions.<name>]` profiles in `~/.codex/config.toml` (different schema)                                    | **Forked.** `cf permission --agent codex` manages Codex profiles; `cf permission` (default) manages Claude.                                                                                  |
| **Sessions (resume/fork)**                                                                  | Claude's `--resume` / `--continue` flags                                                                 | `codex resume` / `codex fork` native commands                                                                                | **Native to host.** `cf session --agent codex` is a thin wrapper that delegates to `codex resume`/`fork`. No CF-side session-file parsing on Codex.                                          |
| **Code review** (`cf-review` skill)                                                         | Claude-side: dispatches 5 specialist subagents in parallel + reducer (existing flow)                     | Codex-side: same 5 specialists via Codex native subagent spawn + reducer. Optionally chains `codex review` for a second pass | **Shared with rendering.** Same skill source; build adapts dispatch syntax.                                                                                                                  |
| **Plan workflow** (`cf-plan`)                                                               | As today                                                                                                 | As today, but uses Codex spawn for cf-planner/cf-explorer/cf-implementer dispatches                                          | **Shared.** Build adapts dispatch syntax via `{{cf:dispatch …}}` placeholder.                                                                                                                |
| **Memory MCP daemon** (`cf mcp`)                                                            | Same binary                                                                                              | Same binary                                                                                                                  | **Shared.** Single executable.                                                                                                                                                               |
| **Learn MCP host** (`cf host`)                                                              | Same                                                                                                     | Same; `codex mcp add coding-friend-learn ...` for registration                                                               | **Shared binary; per-host registration.**                                                                                                                                                    |
| **CLI commands** (`cf install`, `cf init`, `cf status`, …)                                  | Default route: Claude                                                                                    | `--agent codex` route: Codex                                                                                                 | **Shared CLI code; provider branch.** Each command has a `if (host === "codex")` arm using helpers from `cli/src/lib/host.ts`.                                                               |
| **Plugin auto-update**                                                                      | Claude `plugin marketplace.autoUpdate = true`                                                            | Codex has `codex plugin marketplace upgrade` (on-demand); no documented auto-update flag in 0.130.0                          | **Different.** Document the gap on Codex docs page. `cf update --agent codex` runs the upgrade command on-demand.                                                                            |
| **Pre-commit drift check**                                                                  | N/A                                                                                                      | `npm run verify:codex-drift` — fails CI if `plugin-codex/` is stale vs `plugin/`                                             | **New infra.** Runs in pre-commit + CI.                                                                                                                                                      |

### Future updates flow

When a CF maintainer wants to ship a fix or new skill, the flow is one of three:

**(a) Skill / agent / shared hook change** (most common):

1. Edit the source under `plugin/skills/`, `plugin/agents/`, or `plugin/hooks/`.
2. Run `npm run build:codex` (or rely on the pre-commit hook to auto-run it).
3. Commit both `plugin/` and `plugin-codex/` diffs.
4. CI's drift check confirms `plugin-codex/` is up to date.
5. Tag `v$X.$Y.$Z`. Release workflow auto-tags `codex-v$X.$Y.$Z`. Both marketplaces serve the new version.

**(b) Forked-script change** (auto-approve, memory-capture, statusline):

1. Edit BOTH `plugin/hooks/auto-approve.cjs` AND `plugin/hooks/auto-approve.codex.cjs` for matching changes.
2. CI runs tests for both forks; PR-review checklist includes "did you update both?".
3. Tag and release as in (a).

**(c) CLI-only change**: edit `cli/src/...`, run `cd cli && npm run build`, tag `cli-v$X.$Y.$Z`. Same for both hosts since `cf` binary is single.

### How Codex users get updates

- **Plugin updates**: `cf update --agent codex` runs `codex plugin marketplace upgrade coding-friend-marketplace`. Pulls the latest tagged `codex-v*` release.
- **CLI updates**: `npm update -g coding-friend-cli` (host-agnostic).
- **Auto-update**: not currently exposed by Codex CLI 0.130.0 for plugins. CF prints a one-line "new version available" notice on session start when out of date (`session-init.sh` already does this for Claude; replicate for Codex with host-aware check).

---

## 3. Single-source-of-truth matrix

### 3.1 Single source (one file, both hosts consume it)

| Asset                    | Source path                                                                                                            | How both hosts get it                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI binary               | `cli/src/**`                                                                                                           | One npm package `coding-friend-cli`. Branches on `--agent` at runtime.                                                                                             |
| Memory MCP daemon        | `cli/src/commands/mcp.ts` + `cli/src/lib/memory*.ts`                                                                   | Single executable invoked as `cf mcp`. Registered to both hosts as the same stdio command.                                                                         |
| Memory database          | `<project>/docs/memory/` (markdown) + SQLite under `~/.coding-friend/memory/`                                          | One on-disk store. Both hosts query through the same MCP daemon.                                                                                                   |
| Skill bodies (source)    | `plugin/skills/cf-*/SKILL.md` (with `{{cf:…}}` placeholders)                                                           | Build script renders to `plugin/skills/cf-*/SKILL.md` (Claude, no-op transform) and `plugin-codex/skills/cf-*/SKILL.md` (Codex, transformed). Source is canonical. |
| Subagent bodies (source) | `plugin/agents/cf-*.md` (markdown with frontmatter)                                                                    | Build renders to `plugin/agents/cf-*.md` (Claude, identity) and `plugin-codex/agents/cf-*.toml` (Codex).                                                           |
| Shared hook scripts      | `plugin/hooks/{privacy-block,scout-block,rules-reminder,session-init,session-log,task-tracker,agent-tracker}.{sh,cjs}` | One file. Build copies into `plugin-codex/hooks/` and rewrites `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}`. Trackers gate themselves on `$CF_HOST`.                 |
| Bootstrap context        | `plugin/context/bootstrap.md` (with placeholders)                                                                      | Build renders both forms; each host reads its own version via `SessionStart`.                                                                                      |
| Project-level config     | `.coding-friend/config.json`                                                                                           | One file, host-agnostic. Sub-keys differ per host (`autoApprove` vs `autoApprove.codex`).                                                                          |
| Project doc memory       | `docs/memory/` (markdown)                                                                                              | Host-agnostic content. Auto-capture writes there from either host.                                                                                                 |
| Build pipeline           | `scripts/build-codex-plugin.js` + `scripts/lib/agent-md-to-toml.js`                                                    | One script. Produces all Codex artifacts.                                                                                                                          |
| Placeholder lint         | `scripts/__tests__/placeholder-lint.test.ts`                                                                           | Single test gates both.                                                                                                                                            |
| Release workflow         | `.github/workflows/release-plugin.yml` (extended)                                                                      | After Claude tag, auto-tags `codex-v*` so versions stay locked.                                                                                                    |

### 3.2 Forked (two files exist; must be kept in sync by hand)

| Asset                  | Claude path                                                      | Codex path                                                                        | Why it's forked                                                                      | Sync mechanism                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketplace manifest   | `.claude-plugin/marketplace.json`                                | `.agents/plugins/marketplace.json`                                                | Different host expects different filename + schema                                   | Hand-edited; PR-review checklist: "name/version/keywords aligned?"                                                                                                                |
| Plugin manifest        | `plugin/.claude-plugin/plugin.json` (existing)                   | `plugin-codex/.codex-plugin/plugin.json` (generated, stamped with same version)   | Different schemas; Codex has `interface` block for marketplace listing               | Build script copies metadata from Claude manifest, stamps version                                                                                                                 |
| Auto-approve hook      | `plugin/hooks/auto-approve.cjs` (LLM classifier on `PreToolUse`) | `plugin/hooks/auto-approve.codex.cjs` (deterministic-only on `PermissionRequest`) | Codex schema fundamentally different; v1 risk policy says no LLM classifier on Codex | Comments in both files: "When you add a safe pattern, update BOTH files." Test suite asserts the deterministic allowlist matches between forks.                                   |
| Memory auto-capture    | `memory-capture.sh` on `PreCompact`                              | `memory-capture.codex.sh` on `PreCompact` with transcript parser fallback         | Transcript schema differs and is not stable                                          | Capture logic extracted to `plugin/hooks/lib/capture-core.sh`; both wrappers source it.                                                                                           |
| Statusline             | `plugin/hooks/statusline.sh` (Claude statusLine setting)         | `~/.codex/config.toml [tui.status_line]` block (Codex native)                     | Different rendering mechanism                                                        | Status fields (memory count, last action) extracted to shared shell helper                                                                                                        |
| Permissions config     | `.claude/settings.json [permissions]` schema                     | `~/.codex/config.toml [permissions.<name>]` schema                                | Different schemas entirely                                                           | `cf permission --agent ...` branches; logical rules shared via TS helper                                                                                                          |
| AGENTS.md vs CLAUDE.md | `CLAUDE.md` (existing, hand-authored project rules)              | `AGENTS.md` (generated by `cf init --agent codex`, gitignored)                    | Each host reads its own file; some users want both, some only one                    | `cf init --agent codex` generates `AGENTS.md` from a template that mirrors `CLAUDE.md`'s structure; future skill of `cf sync-docs` to regenerate when CLAUDE.md changes (post-v1) |

### 3.3 Host-specific (no equivalent on the other host)

| Asset                                                | Host                     | Why no counterpart                                                                          |
| ---------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `task-tracker.sh`                                    | Claude only              | No `TaskCreated`/`TaskCompleted` events in Codex                                           |
| `claude plugin install` CLI command                  | Claude                   | Codex does not have a scriptable `plugin install`; replaced by marketplace registration plus manual plugin directory install |
| `claude --print` (subprocess for LLM classification) | Claude (in auto-approve) | Deliberately NOT used from Codex auto-approve fork — v1 deterministic-only                  |
| `codex review` second-pass                           | Codex only               | Claude has its own multi-agent review; `codex review` is a Codex-native one-shot            |
| `codex resume` / `codex fork`                        | Codex only               | Native; CF doesn't reimplement                                                              |
| Plugin TUI `/plugins` browser                        | Codex only               | Claude installs via CLI marketplace command                                                 |

### 3.4 Sync drift guard

Forked items (§3.2) are the maintenance hot-spot. Three guards:

1. **CI drift check**: `npm run verify:codex-drift` ensures `plugin-codex/` matches the latest `plugin/` build.
2. **Test parity**: Each fork (auto-approve, memory-capture) has paired tests asserting the shared behavior (e.g. "this safe pattern allows on both forks").
3. **PR checklist** in `.github/PULL_REQUEST_TEMPLATE.md` (added in Phase 10): "If you edited a forked file, did you update both? See HOW-IT-WORKS.md §3.2."

---

## 4. Open questions Phase 0 must close

These are repeated from `phase-0-smoke-tests.md` because they directly affect the journeys in §1:

- **0.5 resolved**: plugin-bundled `agents/*.toml` are not a documented discovery path. CF deploys generated agent TOMLs to `~/.codex/agents/` or project `.codex/agents/`.
- **0.6 resolved**: `codex plugin marketplace add` is non-interactive for local probe marketplaces.
- **0.7 resolved**: config-only enablement does not install a not-yet-installed plugin. `cf install --agent codex` registers the marketplace and prints a one-time manual plugin directory instruction.

---

## 5. Summary cheat-sheet

```
$ cf install                       # Claude only (default, existing behavior)
$ cf install --agent codex         # Codex only (no Claude touched)
$ cf install && cf install --agent codex   # Both
$ cf uninstall                     # Remove Claude side
$ cf uninstall --agent codex       # Remove Codex side
$ cf init                          # Project rules → CLAUDE.md  (existing)
$ cf init --agent codex            # Project rules → AGENTS.md  (gitignored)
$ cf status                        # Claude side status
$ cf status --agent codex          # Codex side status
$ cf update --agent codex          # Pull latest plugin via codex plugin marketplace upgrade
$ cf mcp --agent codex             # Register Memory MCP into ~/.codex/config.toml
```

Every host-touching command supports `--agent <claude|codex>`. Default = `claude`. Unknown value = clear error. Claude users who never pass `--agent` see no behavioral changes.
