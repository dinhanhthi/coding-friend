# coding-friend omp bridge

TypeScript extension that lets [oh-my-pi](https://omp.sh/) (omp) reuse the
Claude-native Coding Friend plugin **without** duplicating skills.

This directory is **not** a Claude marketplace plugin and is **not** registered
in `.claude-plugin/marketplace.json`. omp loads it as a config-file extension
(`~/.omp/agent/extensions/coding-friend.ts` or `<cwd>/.omp/extensions/`).

## Bridge model

| Layer  | How omp gets it                                                             |
| ------ | --------------------------------------------------------------------------- |
| Skills | Inherited from `~/.claude` (omp priority 80). No `plugin/omp/skills/` copy. |
| Agents | **Not** inherited. Deployed by `cf install --agent omp` as `cf-*.md`.       |
| Hooks  | Proxied by [`extension.ts`](./extension.ts) with `CF_HOST=omp`.             |
| MCP    | File-based write to `~/.omp/agent/mcp.json` (no `omp mcp add`).             |

`extension.ts` is a default-export factory `(pi: HookAPI) => void`. Each
`pi.on(...)` handler `spawnSync`s the matching script under `plugin/hooks/`
and maps Claude hook I/O onto omp's event results.

| omp event                                                           | Claude hook   | Script                                                              |
| ------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| `session_start`                                                     | SessionStart  | `session-init.sh` (inject via `pi.sendMessage`)                     |
| `tool_call`                                                         | PreToolUse    | `privacy-block.sh`, then `scout-block.cjs`, then `auto-approve.cjs` |
| `session_before_compact` / `session.compacting` / `session_compact` | PreCompact    | `memory-capture.sh`                                                 |
| `session_shutdown`                                                  | Stop          | `session-log.sh`                                                    |
| `before_agent_start`                                                | SubagentStart | `agent-tracker.sh`                                                  |

Hook paths resolve from `CODING_FRIEND_PLUGIN_ROOT` when set, else the
`// CODING_FRIEND_PLUGIN_ROOT=` shim comment, else
`path.join(__dirname, "..", "hooks")` next to this folder.

Privacy and scout hooks fail closed (missing script / spawn error / null
status → `{ block: true }`).

## Install

```bash
cf install --agent omp
```

That command writes a one-line re-export shim that points at this
`extension.ts` and prepends `// CODING_FRIEND_PLUGIN_ROOT=<plugin-root>`.
Until the shim exists, point omp at this file directly:

```bash
omp --extension /path/to/coding-friend/plugin/omp/extension.ts
```
