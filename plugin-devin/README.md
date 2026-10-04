# Coding Friend — Devin CLI (beta)

Lean toolkit for disciplined engineering workflows — the same skills, agents,
hooks and memory system as the Claude Code plugin, repackaged for Devin CLI.

> **Beta:** Devin support is new — report issues at
> https://github.com/dinhanhthi/coding-friend/issues.

## Install

Production (GitHub, the `plugin-devin/` subdirectory of the repo):

```bash
devin plugins install dinhanhthi/coding-friend#plugin-devin
```

Development (local checkout — symlinked, so edits apply to new sessions):

```bash
devin plugins install --local /path/to/coding-friend/plugin-devin
```

## Usage

Slash commands resolve bare or namespaced: `/cf-plan` and
`/coding-friend:cf-plan` are the same skill. Subagents run through the
`run_subagent` tool with profile `coding-friend:<agent>`.

The plugin ships the `coding-friend-memory` MCP server via `.mcp.json`
(`npx -y coding-friend-cli mcp-serve`). Install the
[`coding-friend-cli`](https://www.npmjs.com/package/coding-friend-cli) for
indexed memory search; skills fall back to grep + direct file writes without it.

## Known Differences

Compared to the Claude Code plugin, on Devin CLI:

- No task tracker or agent tracker — the `TaskCreated`, `TaskCompleted`,
  `SubagentStart` and `SubagentStop` hook events do not exist.
- No statusline hook.
- `/cf-session` is a stub: use native resume — `devin -r <id>`, `devin -c`,
  `devin list`, or `/resume` / `/ls` in the REPL.
- Memory auto-capture is deferred to the first prompt AFTER compaction —
  `PostCompaction` context is not delivered to the model.
- Agents with `model: inherit` or `model: haiku` run on Devin's default
  subagent model; `sonnet` and `opus` are kept.
- No per-plugin enable/disable — `cf enable/disable --agent devin` prints
  guidance instead.
- Notebook tools (`notebook_read`, `notebook_edit`) are not covered by the
  privacy/scout PreToolUse filters — the matcher covers
  `read|write|edit|glob|grep` only.
- `${CLAUDE_PLUGIN_ROOT}` is not expanded inside skill bodies — use the
  `<plugin-root>` token documented in each SKILL.md.
- Hooks are session-bound: edits to a `--local` install apply to new
  sessions only.
- `-p` (non-interactive) mode denies anything the auto-approve hook does not
  approve.
- CLI/Desktop sessions only — Devin cloud sessions do not load local plugins.
