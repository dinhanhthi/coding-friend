# How Codex Support Works in Coding Friend

Companion to [README.md](./README.md). This document describes the implemented
release candidate, not the original proposal.

## 1. User journeys

### 1.1 Codex-only user

1. Install Codex CLI and `coding-friend-cli`.
2. Run `cf install --agent codex`.
   - Requires Codex CLI `0.130.0` or newer.
   - Registers `dinhanhthi/coding-friend` as a Codex marketplace.
   - Records the plugin as enabled and deploys generated custom-agent TOMLs
     when an installed plugin artifact is available.
   - Does not require Claude Code or touch `~/.claude/`.
3. Open Codex, run `/plugins`, and install `coding-friend`. Codex `0.130.0`
   does not expose non-interactive plugin installation.
4. In each project, run `cf init --agent codex`.
   - Creates the Coding Friend docs folders and a root `AGENTS.md`.
   - Registers the shared memory MCP server in the **project**
     `.codex/config.toml` only. A global registration would point at one
     project's absolute memory path and leak it into every other Codex
     session, so it is intentionally not written.
   - Deploys project custom agents under `.codex/agents/`.
   - Sets `agents.max_depth = 2` globally for Coding Friend's nested review flow.
   - Leaves project trust unchanged unless `--trust-project` is passed.
     Without project trust the project-scoped memory MCP does not load.
5. Start a new Codex thread, review plugin hooks with `/hooks`, and invoke
   skills with `$cf-*` or select them from `/skills`.

### 1.2 Claude and Codex together

Run the host installs independently:

```bash
cf install
cf install --agent codex
```

The same project can contain `CLAUDE.md`, `AGENTS.md`, and one shared
`docs/memory/` tree. Host lifecycle state stays separate. Memory stored by one
host is available to the other through the same MCP backend.

### 1.3 Moving from Claude to Codex

`cf uninstall` removes only the Claude plugin state. It does not delete project
docs or memory. After `cf install --agent codex` and
`cf init --agent codex`, the existing project memory remains usable.

`cf uninstall --agent codex` mirrors this for Codex: it disables the plugin,
removes deployed `~/.codex/agents/cf-*.toml`, and drops any
`coding-friend-memory` entry from the global config. It leaves
`agents.max_depth`, project trust entries, and project-local `.codex/` files
in place.

## 2. Feature mapping

| Feature                    | Claude Code                                                | Codex implementation                                                                                                                           |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills                     | `/cf-*`                                                    | `$cf-*`, `/skills`, and description-based implicit activation                                                                                  |
| Custom agents              | Claude Markdown agents and `Agent` dispatch                | Generated TOML agents deployed to `~/.codex/agents/` or `.codex/agents/`; prompts explicitly ask Codex to spawn the named custom agent         |
| Agent model tiers          | `haiku`, `sonnet`, `opus`, `inherit`                       | Generated `model_reasoning_effort`: low, medium, high, or inherited parent defaults; no invalid Anthropic model IDs                            |
| Hooks                      | Claude plugin `hooks.json`                                 | Generated plugin-bundled Codex hooks, reviewed through `/hooks`; task-only events are omitted                                                  |
| Memory MCP                 | Claude MCP registration                                    | `cf init --agent codex` writes `[mcp_servers.coding-friend-memory]` to the project `.codex/config.toml` (requires project trust)               |
| Auto-approve               | Rules plus Sonnet classifier                               | Separate `autoApproveCodex` opt-in; deterministic allow/deny only (including `apply_patch` working-dir checks), unknown actions defer to Codex |
| Memory capture             | `PreCompact`                                               | Codex `PreCompact` with Codex transcript parsing                                                                                               |
| Project-rule memory sync   | `CLAUDE.md`                                                | `AGENTS.md`; dual-host projects update both instruction files                                                                                  |
| Reviews                    | CF specialists plus optional external Codex second opinion | Native CF specialist subagents; `--with-codex` is ignored because the workflow already runs inside Codex                                       |
| Parallel plans             | Claude background agent calls                              | Codex parallel subagent request and wait; scheduling remains host-controlled                                                                   |
| Sessions                   | CF's Claude session save/load                              | Generated `$cf-session` routes to native `/resume`, `/fork`, `codex resume`, and `codex fork`                                                  |
| Statusline                 | CF shell renderer with live counters                       | Native `/statusline` built-in fields; CF-specific live counters are unavailable                                                                |
| Session status             | `cf status` plus Claude UI                                 | Native `/status` for current Codex session details; no CF aggregate Codex status wrapper                                                       |
| Permissions                | `cf permission` manages Claude rules                       | `cf permission --agent codex` only toggles deterministic CF auto-approve; native `/permissions` owns Codex sandbox posture                     |
| Generic MCP administration | Existing CF/Claude commands                                | Native `codex mcp` and `/mcp`; project memory registration remains automated by `cf init`                                                      |
| Plugin updates             | Claude marketplace auto-update                             | `cf update --agent codex` runs `codex plugin marketplace upgrade`; no automatic session-start update                                           |

Lifecycle commands with host routing are:

```text
install, uninstall, enable, disable, init, permission, update
```

Other `cf` commands remain host-agnostic or Claude-specific. They do not accept
`--agent codex` unless explicitly documented.

## 3. Source of truth

### 3.1 Published Claude source

`plugin/` is both the canonical source and the valid Claude plugin artifact.
It contains normal Claude syntax such as `/cf-review`,
`${CLAUDE_PLUGIN_ROOT}`, and `subagent_type: "coding-friend:cf-explorer"`.
Unresolved `{{cf:*}}` tokens are forbidden because they would break the
published Claude plugin.

### 3.2 Generated Codex artifact

`npm run build:codex` regenerates `plugin-codex/` from `plugin/`:

- `/cf-*` becomes `$cf-*`.
- Claude plugin-root paths become Codex plugin-root paths.
- Claude agent dispatch wording becomes explicit Codex custom-agent spawning.
- Claude-only task/question/background APIs become supported Codex wording.
- `cf-session` becomes a native Codex resume/fork guide.
- Claude's external Codex second-review branch is removed from Codex review.
- Markdown agents become TOML with Codex reasoning effort settings.
- Unsupported task hook events and hook `async` fields are removed.
- Hook matchers containing `Write`/`Edit` gain an explicit `apply_patch`
  alternative.
- Claude-only files (Claude session scripts, the nested-Codex review
  scripts, `task-tracker.sh`, the Claude memory-capture hook) are excluded
  from the artifact.

The build fails if the generated artifact contains unresolved placeholders or
host-incompatible references (`scripts/placeholder-lint.mjs`). The source and
artifact are additionally guarded by tests (`npm run test:scripts`, run in the
`tests` CI workflow), a tracked pre-commit hook, and the `codex-drift` CI
workflow (which also runs `npm run lint:codex`). The drift check fails on both
modified and untracked artifact files.

### 3.3 Shared and forked code

Shared:

- CLI, memory daemon, project memory, most hook scripts, skill and agent bodies
- Build and release automation

Forked where schemas differ:

- `auto-approve.cjs` and `auto-approve.codex.cjs`
- `memory-capture.sh` and `memory-capture.codex.sh`
- Claude and Codex plugin manifests

Host-native alternatives instead of CF wrappers:

- Codex `/status`, `/statusline`, `/permissions`, `/mcp`, `/resume`, and `/fork`
- Codex `/plan` for a native planning mode before invoking `$cf-plan`

## 4. Update and release flow

1. Edit `plugin/`, CLI source, or generator source.
2. Run `npm run build:codex`.
3. Run `npm run verify:codex-drift` after staging generated changes.
4. CI repeats the drift check on every pull request and `main` push.
5. A `vX.Y.Z` Claude release directly calls
   `.github/workflows/release-codex.yml`, which validates versions and creates
   the matching `codex-vX.Y.Z` release at the same commit.

The release candidate is `v0.36.0` / `codex-v0.36.0` with CLI `v1.37.0`.
Publication waits until the feature branch is merged.

## 5. Command cheat sheet

```bash
cf install --agent codex
cf init --agent codex --trust-project
cf permission --agent codex --enable-auto-approve
cf update --agent codex
cf disable --agent codex
cf enable --agent codex
cf uninstall --agent codex
```

Inside Codex:

```text
/plugins      install or manage the plugin
/skills       browse Coding Friend skills
/hooks        review and trust plugin hooks
/status       inspect the current session
/statusline   configure native footer fields
/permissions  configure native approval posture
/resume       resume a conversation
/fork         fork a conversation
```
