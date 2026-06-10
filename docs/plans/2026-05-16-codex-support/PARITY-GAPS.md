# Codex Parity Gaps

Companion to [README.md](./README.md) and
[HOW-IT-WORKS.md](./HOW-IT-WORKS.md). This is the final implementation audit.

Severity:

- **Blocked**: Codex exposes no equivalent that a plugin skill can use.
- **Degraded**: the workflow works with different UX or weaker guarantees.
- **Native alternative**: CF does not duplicate a Codex feature.

## 1. Subagents and parallel work

Current Codex supports parallel subagent workflows and custom TOML agents.
Coding Friend asks Codex to spawn named agents, wait for them, and consolidate
their results.

| Behavior                         | Result                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `cf-reviewer` specialist fan-out | Works after `cf init --agent codex` sets `agents.max_depth = 2`; the default depth of 1 blocks nested reviewer children |
| Parallel `cf-implementer` tasks  | Works as an explicit parallel subagent request; Codex controls actual scheduling                                        |
| Nested `cf-explorer`             | Works within the configured depth of 2                                                                                  |
| Fire-and-forget subagents        | **Blocked**. Codex's subagent workflow waits for requested results                                                      |
| Background terminal commands     | Native `/ps` and `/stop` exist, but they are not a replacement for detached subagents                                   |

Write-heavy parallel phases retain Coding Friend's file-overlap guard because
concurrent edits can still conflict.

## 2. Hook differences

| Claude behavior                                | Codex result                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreCompact` memory capture                    | Supported with a Codex transcript parser                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SubagentStart` / `SubagentStop` tracking      | Supported                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `TaskCreated` / `TaskCompleted` tracking       | **Blocked**; omitted from generated hooks                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `async: true`                                  | **Degraded**; Codex hooks run synchronously, so generated handlers stay small                                                                                                                                                                                                                                                                                                                                                                                   |
| Plugin hooks                                   | Supported as plugin-bundled hooks, subject to Codex `/hooks` review and trust                                                                                                                                                                                                                                                                                                                                                                                   |
| `privacy-block` / `scout-block` on file access | Supported for file edits: generated matchers include `apply_patch` (Codex documents `Edit`/`Write` as matcher aliases for it), both hooks extract target paths from patch envelopes, and blocking via exit code 2 is documented for Codex `PreToolUse`. **Caveat:** Codex has no `Read`/`Glob`/`Grep` tools — reads go through shell commands, where only the Bash `command` heuristics apply. End-to-end verification on a live Codex session is still pending |

## 3. Auto-approve

Codex auto-approve is intentionally separate and off by default:

- Known-safe actions may be allowed.
- Known-destructive actions are denied.
- File edits arrive as `apply_patch`: the hook parses the patch envelope and
  allows only when every touched path (including `Move to:` rename targets)
  stays inside the project directory; otherwise it emits no decision.
- Unknown actions emit no decision and remain under Codex native approval.
- Claude's Sonnet classifier is not called from Codex.

This is **degraded by design** but preserves the safer failure mode.

## 4. Claude-only workflow APIs

| Claude API or UX                                                   | Codex handling                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `AskUserQuestion` structured choices                               | **Degraded** to direct natural-language questions                                                                             |
| `TaskCreate` / `TaskUpdate`                                        | **Degraded** to an inline checklist; `/goal` can hold the overall persistent objective                                        |
| `ExitPlanMode` acceptance surface                                  | **Native alternative**: enter Codex `/plan` before `$cf-plan`; the skill also writes a durable plan and asks for confirmation |
| `ScheduleWakeup` / `CronCreate` used by third-party loop workflows | **Blocked inside a CLI plugin skill**; Codex app automations are a separate product surface                                   |
| `EnterWorktree` / `ExitWorktree` tool calls                        | **Blocked for a skill**; users can launch Codex in an existing worktree                                                       |
| `WebSearch` / `WebFetch` tool names                                | Supported through Codex's first-party web search and source-opening behavior; generated instructions use host-neutral wording |

## 5. Sessions, status, permissions, and MCP

These are native alternatives, not missing wrappers:

- Session continuation: `/resume`, `/fork`, `codex resume`, `codex fork`
- Current-session status: `/status`
- Footer configuration: `/statusline`
- Sandbox and approval posture: `/permissions`
- MCP administration: `codex mcp` and `/mcp`

CF still automates the pieces it owns:

- `cf init --agent codex` registers Coding Friend memory MCP in the
  **project** `.codex/config.toml` only — a global entry would hold one
  project's absolute memory path and leak it into every other Codex
  session. The project must be trusted (`--trust-project`) for it to load.
- Convention memories update `AGENTS.md`; dual-host projects update both
  `AGENTS.md` and `CLAUDE.md`.
- `cf permission --agent codex` toggles `autoApproveCodex`.
- Generated `$cf-session` directs users to native Codex session controls.
- `cf uninstall --agent codex` disables the plugin, removes deployed
  `~/.codex/agents/cf-*.toml`, and drops any `coding-friend-memory` entry
  from the global config. Intentional residue: `agents.max_depth`, project
  trust entries, and project-local `.codex/` files.

## 6. Statusline

Codex `/statusline` can display and reorder built-in fields such as model,
context, limits, git, tokens, and session data. It cannot execute Coding
Friend's Claude statusline shell renderer.

**Degraded:** native status information is available, but CF-specific live task
and agent counters are not.

## 7. Plugin installation and updates

- Installation requires one `/plugins` interaction after marketplace
  registration because Codex CLI `0.130.0` has no scriptable plugin-install
  command.
- Skills remain discoverable through `$` completion and `/skills`.
- Updates are on demand through `cf update --agent codex`; no Claude-style
  marketplace auto-update flag is available.
- There is no session-start "new version available" banner.

## 8. Review behavior

Claude's `/cf-review --with-codex` launches Codex as an external second opinion.
Doing that from inside Codex would recursively launch the same host. The
generated `$cf-review` therefore ignores `--with-codex` and runs Coding Friend's
native specialist/reducer workflow directly.

## 9. Final assessment

Core Coding Friend workflows port:

- planning, fixing, TDD, review, commit, shipping, research, memory, learning,
  optimization, design, verification, hooks, MCP, and custom agents

Unavoidable blocked surfaces:

- Claude task lifecycle hook events
- structured question UI from inside a skill
- fire-and-forget subagents
- in-skill timed wakeups and worktree switching

Degraded but usable:

- inline task progress, deterministic-only auto-approve, synchronous hooks,
  native-only statusline fields, manual plugin installation, and on-demand
  updates

Everything else either ports directly or uses a documented native Codex
alternative.
