# Working with omp (local dev)

> Standalone reference for developing/testing Coding Friend on **omp**
> ([oh-my-pi](https://omp.sh/)). omp is the third host (beta), **bridge mode** —
> there is no `plugin-omp/` artifact alongside `plugin-codex/`.
> Codex host: [codex-dev.md](codex-dev.md). Shared dev process: [plugin-dev.md](plugin-dev.md).

**Updated:** 2026-08-24 · omp CLI ≥ 0.1.0 · labelled **beta**.

---

## 1. Overview — bridge model

omp does **not** receive Coding Friend as a Claude marketplace plugin. `cf install --agent omp` writes files into `~/.omp/` (or `OMP_HOME`). The canonical source is still `plugin/` (Claude-native).

| Layer      | How omp receives it                                                                                           | What it does not do                   |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Skills     | Inherit from `~/.claude` (priority **80**; omp native = 100, Codex = 70)                                      | Does not copy `plugin/skills/`        |
| Agents     | Convert 12 `plugin/agents/cf-*.md` files at install → `~/.omp/agent/agents/cf-*.md` (flat, not recursive)     | Does **not** inherit `~/.claude/agents/` |
| Hooks      | [`plugin/omp/extension.ts`](../plugin/omp/extension.ts) `spawnSync`s `plugin/hooks/*.sh` with `CF_HOST=omp`   | Does not port each hook bash → TS     |
| MCP        | Writes `~/.omp/agent/mcp.json` directly (no `omp mcp add`)                                                    | —                                     |
| Statusline | Skipped — omp has its own TUI                                                                                 | `cf statusline` / `cf permission`     |

**Correct agent path (verified 2026-08-24):** `~/.omp/agent/agents/*.md` — discovery is **non-recursive**. Do **not** deploy into `~/.omp/agents/coding-friend/` (wrong parent **and** the subdirectory is not scanned). The `ompUserAgentsDir()` helper in [`cli/src/lib/paths.ts`](../cli/src/lib/paths.ts) points at the right place; `ompCodingFriendAgentsDir()` is the old path and is **not used** at install time.

`systemPrompt` = the **markdown body** after frontmatter (`name` + `description` required). Do not put `systemPrompt` in the YAML. Converter: `convertClaudeAgentToOmp()` in [`cli/src/lib/omp-config.ts`](../cli/src/lib/omp-config.ts).

---

## 2. Architecture: source → shim → spawn

```
plugin/                ← ONLY source (Claude-native)
├── skills/            ← omp inherits from ~/.claude (priority 80)
├── agents/cf-*.md     ← convert at install → ~/.omp/agent/agents/cf-*.md
└── hooks/*.sh         ← shared bash
       ▲
plugin/omp/extension.ts  (pi.on → spawnSync, CF_HOST=omp)
       ▲
~/.omp/agent/extensions/coding-friend.ts  (re-export shim)
```

- The shim is written by `writeOmpExtensionEntry()`: a `// CODING_FRIEND_PLUGIN_ROOT=<abs>` comment then `export { default } from "<abs-to-plugin/omp/extension.ts>"`.
- The factory `(pi: HookAPI) => void` registers `pi.on(...)`; each handler `spawnSync`s bash/`node` with env `CF_HOST=omp`, `CODING_FRIEND_PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`.
- `plugin/omp/` is **not** listed in `.claude-plugin/marketplace.json` — it is not a Claude plugin. Runtime details: [`plugin/omp/README.md`](../plugin/omp/README.md).

Event map (checked against omp compact-event docs):

| omp event                                                                                          | Claude hook   | Script                                                      |
| -------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| `session_start`                                                                                    | SessionStart  | `session-init.sh` → `pi.sendMessage`                        |
| `tool_call`                                                                                        | PreToolUse    | `privacy-block.sh` → `scout-block.cjs` → `auto-approve.cjs` |
| `session_before_compact` / `session.compacting` / `session_compact` (+ alias `session_compacting`) | PreCompact    | `memory-capture.sh`                                         |
| `session_shutdown`                                                                                 | Stop          | `session-log.sh`                                            |
| `before_agent_start`                                                                               | SubagentStart | `agent-tracker.sh`                                          |

Privacy/scout **fail closed** (missing script / spawn error → `{ block: true }`).

---

## 3. Local-dev workflow for omp

> `cf dev on/off/sync` **only supports Claude** ([`plugin-dev.md`](plugin-dev.md)). omp has no Codex-style cache copy — the shim re-exports an absolute path to `plugin/omp/extension.ts`. The hosts are independent (`~/.claude` / `~/.codex` / `~/.omp`); the `cf` CLI is shared. Codex: [codex-dev.md](codex-dev.md).

### A. One-time setup

```bash
cd cli && npm run build && cd ..          # 1. local CLI (cf already npm-linked)
# omp CLI: https://omp.sh/  →  curl -fsSL https://omp.sh/install | sh
cf install --agent omp                    # 2. agents + shim + memory MCP
#    alias: cf install --omp
cf init --agent omp                       # 3. per project: .omp/mcp.json + .coding-friend/
# restart omp / start a new session
```

`--project` / `--local` → project scope (`<cwd>/.omp/agents/cf-*.md`, `<cwd>/.omp/extensions/coding-friend.ts`). Default = user. Memory MCP **always** writes `~/.omp/agent/mcp.json` (user).

> Sandbox: `OMP_HOME=/tmp/cf-omp-dev` for **every** `cf`/`omp` command in the session (same idea as `CODEX_HOME` in [codex-dev.md](codex-dev.md)).

### B. Inner loop (after each edit)

- Edit `cli/src/**` → `cd cli && npm run build` (or `npm run watch`).
- Edit `plugin/omp/extension.ts` → **restart omp** (the shim points at the repo file if installed from cwd).
- Edit `plugin/hooks/*.sh` → the next spawn already sees it (no rebuild).
- Edit `plugin/agents/*.md` → `cf update --agent omp` (or `cf install --agent omp`) to reconvert.
- Edit `plugin/skills/**` → omp inherits Claude; use the Claude inner loop (`cf dev sync`) if inheritance reads the plugin cache (see §5 R2).

### C. Disable / clean up

```bash
cf disable --agent omp     # task.disabledAgents in config.yml — files remain
cf enable --agent omp      # remove cf-* names from disabledAgents
cf uninstall --agent omp   # delete agents + shim; MCP only when user scope
```

Claude/Codex are **not** touched. There is no omp marketplace to `remove`.

---

## 4. Files written by `cf install --agent omp` (user scope)

| Path                                                           | Contents                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.omp/agent/agents/cf-*.md`                                  | 12 converted agents: `cf-explorer`, `cf-implementer`, `cf-planner`, `cf-reviewer`, `cf-reviewer-plan`, `cf-reviewer-quality`, `cf-reviewer-reducer`, `cf-reviewer-rules`, `cf-reviewer-security`, `cf-reviewer-tests`, `cf-writer`, `cf-writer-deep` |
| `~/.omp/agent/extensions/coding-friend.ts`                     | Re-export shim → [`plugin/omp/extension.ts`](../plugin/omp/extension.ts)                                                                                                                                                                             |
| `~/.omp/agent/mcp.json` → `mcpServers["coding-friend-memory"]` | `{ command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] }`                                                                                                                                                                                 |

`cf disable --agent omp` does **not** delete the files above; it only upserts `task.disabledAgents` (block `# coding-friend-managed`) in `~/.omp/agent/config.yml` (user) or `<cwd>/.omp/config.yml` (project).

`cf update` with **no** `--agent` updates every installed host (Claude → Codex → omp). `--agent omp` / `--omp` = omp only.

---

## 5. Uninstall matrix

`cf uninstall --agent omp` ([`cli/src/commands/uninstall.ts`](../cli/src/commands/uninstall.ts)):

| Artifact                      | User (`--user` / default)                                                | Project (`--project` / `--local`)            |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `cf-*.md` agents              | Delete files matching `^cf-.*\.md$` in `~/.omp/agent/agents/` (keep others) | Same for `<cwd>/.omp/agents/`             |
| `coding-friend.ts` shim       | Delete `~/.omp/agent/extensions/coding-friend.ts`                        | Delete `<cwd>/.omp/extensions/coding-friend.ts` |
| `coding-friend-memory` MCP    | `removeOmpMcpEntry` on `~/.omp/agent/mcp.json`                           | Does **not** unregister                      |
| `coding-friend-learn` MCP     | Unregister if it was ever written by `cf config`/`cf learn`              | Does **not** unregister                      |
| `~/.claude/**`, `~/.codex/**` | Untouched                                                                | Untouched                                    |
| `config.yml` `disabledAgents` | Not reverted (harmless after the agent files are gone)                   | Not reverted                                 |

Nothing to remove → `"Nothing to uninstall"`. Restart omp after uninstall.

---

## 6. Known gotchas

1. **Agent frontmatter / `systemPrompt` (R1)** — omp `parseAgent` takes `systemPrompt` from the **body**, not the YAML. The converter only keeps `model` ∈ `{haiku, sonnet, opus}`. Missing `name`/`description` → that file is skipped at deploy time.
2. **Skills inheritance path (R2, verified 2026-08-24, omp 18.0.3)** — There is no `omp skills list` (only launch flags `--skills=<glob>` / `--no-skills`). omp reads **both** Claude surfaces: user/project `.claude/skills/*/SKILL.md` (provider `claude`, priority **80**) **and** the marketplace cache `~/.claude/plugins/cache/` via `installed_plugins.json` (provider `claude-plugins`, priority **70**). Native omp (`~/.omp/agent/skills`, `.omp/skills`) still has priority **100**. Coding Friend `cf-*` skills live in the Claude plugin cache — they are **not** in `~/.claude/skills/` unless the user copies them. A user who has not installed Claude Code (empty cache) **will not** see `cf-*`. Fallback (not shipped): copy into `~/.omp/agent/skills/` at install time.
3. **TS extension API (R3)** — `pi.on` follows the official compact-event docs: `session_before_compact`, `session.compacting`, `session_compact`; `session_compacting` is only a cheap alias. Shim types: [`plugin/omp/pi-types.d.ts`](../plugin/omp/pi-types.d.ts). If omp rejects a `.ts` re-export (R8), fallback: copy `extension.ts` into `extensions/`.
4. **`.omp/` dir probe false-positive on Claude (R4)** — [`plugin/hooks/session-init.sh`](../plugin/hooks/session-init.sh) when `CF_HOST` is empty: `CODEX_SESSION_ID` > `OMP_SESSION_ID` > `$PWD/.omp` > `claude`. `cf init --agent omp` creates `.omp/` → a Claude session in the same repo can be detected as `CF_HOST=omp`. The extension **always** sets `CF_HOST=omp` when spawning; Claude hooks.json does not. Mitigation: export `CF_HOST=claude` when running Claude on a mixed-host repo.
5. **`--omp` must not have a Commander default on `--agent` (fixed)** — `.option("--agent <agent>", ...)` must **not** default to `"claude"`. If it did, `cf install --omp` became `{ agent: "claude", omp: true }` → `resolveHost()` conflict. `cf update` still has `flagsForHostResolve()` to strip a leftover `agent: "claude"` when argv has no `--agent`. The default host when there is no flag is `"claude"` in [`cli/src/lib/host.ts`](../cli/src/lib/host.ts), not Commander.
6. **Wrong path `~/.omp/agents/coding-friend/`** — omp does not scan it. Always use the flat `~/.omp/agent/agents/cf-*.md`.
7. **`cf permission --agent omp`** — no-op: omp manages approval-mode itself (`omp config`).
8. **No official `OMP_SESSION_ID`** — the probe uses the env if present, then `.omp/` in cwd. Do not rely on a session id.

---

## 7. Troubleshooting

| Symptom                                   | Check                                                                         | Fix                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `omp CLI not found`                       | `command -v omp`                                                              | [omp.sh](https://omp.sh/) / `curl -fsSL https://omp.sh/install \| sh`                                         |
| 0 agents after install                    | `ls ~/.omp/agent/agents/cf-*.md`; **not** `ls ~/.omp/agents/coding-friend/`   | Run from the coding-friend repo or after a Claude `cf install` (source = `plugin/agents` or the plugin cache) |
| Agent not showing in omp                  | Discovery is non-recursive; `cf disable --agent omp` may have disabled them   | `ls` the correct dir; `cf enable --agent omp`; restart omp                                                    |
| `cf-*` skills disappear                   | R2: Claude not installed / cache empty                                        | Install the Claude plugin; `cf dev sync` if in dev; note the path omp actually reads                          |
| Hook not running                          | Shim + `CODING_FRIEND_PLUGIN_ROOT` must point at a real file                  | `cat ~/.omp/agent/extensions/coding-friend.ts`; `test -f` the path in `from "..."`                            |
| Privacy blocks every tool                 | Fail closed when the script is missing / spawn fails                          | `CODING_FRIEND_PLUGIN_ROOT` must contain `hooks/privacy-block.sh`                                             |
| Claude session shows `HOST: omp`          | R4: the repo has `.omp/`                                                      | `CF_HOST=claude` when launching Claude; or do not `cf init --agent omp` on a Claude-only repo                 |
| `--omp` reports a conflict with `--agent claude` | Old Commander default                                                  | `--agent` must not use `.option(..., "claude")`; use `--omp` **or** `--agent omp`                             |
| MCP does not connect                      | `jq . ~/.omp/agent/mcp.json`                                                  | Must have `coding-friend-memory`; `npx -y coding-friend-cli mcp-serve`; a **project** uninstall does not remove the user MCP |
| `cf update` does not touch omp            | `isOmpAgentInstalled`                                                         | Need at least one user or project `cf-*.md`                                                                   |
| Hook/extension edit not visible           | omp does not cache-copy like Codex                                            | Restart omp; for agents, `cf update --agent omp`                                                              |

session-init log: `${TMPDIR:-/tmp}/coding-friend-session-init.log` — the omp path prints `detected CF_HOST=omp`.

```bash
# sanity user-scope
ls ~/.omp/agent/agents/cf-*.md | wc -l          # 12
cat ~/.omp/agent/extensions/coding-friend.ts
jq '.mcpServers["coding-friend-memory"]' ~/.omp/agent/mcp.json
```

---

## 8. References

- [plugin-dev.md](plugin-dev.md) — shared dev/release process (Claude + Codex)
- [codex-dev.md](codex-dev.md) — Codex host (`plugin-codex/` artifact, different from the omp bridge)
- [architecture.md](architecture.md) — plugin vs CLI overview
- [`plugin/omp/README.md`](../plugin/omp/README.md) — bridge runtime + event map
- [`plugin/omp/extension.ts`](../plugin/omp/extension.ts) — `pi.on` → `spawnSync`
- Host-aware CLI: [`cli/src/lib/host.ts`](../cli/src/lib/host.ts), [`cli/src/lib/omp-config.ts`](../cli/src/lib/omp-config.ts), [`cli/src/lib/paths.ts`](../cli/src/lib/paths.ts)
- Lifecycle: [`cli/src/commands/install.ts`](../cli/src/commands/install.ts), [`cli/src/commands/uninstall.ts`](../cli/src/commands/uninstall.ts)
