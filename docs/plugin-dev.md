# For plugin developers

Single local-dev guide for every host. `plugin/` is the only source tree. Claude
reads it (via cache). Codex and Antigravity consume **generated artifacts**.
omp is a **bridge** — it shells the live `plugin/` files.

| Host        | Section                     |
| ----------- | --------------------------- |
| Claude Code | [Claude Code](#claude-code) |
| Codex CLI   | [Codex](#codex)             |
| omp         | [omp](#omp)                 |
| Antigravity | [Antigravity](#antigravity) |

## Daily workflow

From the repo root:

```bash
npm run dev            # Start all sub-projects in parallel (see ports below)
npm run format         # Format all code across the repo
npm run format:check   # Check formatting without modifying files
```

`npm run dev` runs these in parallel with colored output:

| Sub-project | Command             | Port                                           |
| ----------- | ------------------- | ---------------------------------------------- |
| CLI         | `npm run watch`     | — (tsup build watch)                           |
| Website     | `npm run dev`       | [http://localhost:3000](http://localhost:3000) |
| Learn Host  | `npm run dev`       | [http://localhost:3333](http://localhost:3333) |
| Learn MCP   | `npm run dev:watch` | — (tsc watch)                                  |

Each sub-project has its own README. Release steps are in
[Release Workflow](#release-workflow).

## Hosts at a glance

The `cf` CLI is **shared**. The hosts are independent
(`~/.claude` / `~/.codex` / `~/.omp` / `~/.gemini`) and can run at the same
time. `cf dev` is Claude-only (except Antigravity, which uses it to **select
the artifact source**).

|                 | Claude Code                 | Codex                                          | omp _(beta)_                                       | Antigravity _(beta)_                                          |
| --------------- | --------------------------- | ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| **Mode**        | Marketplace source          | Artifact                                       | Bridge (no `plugin-omp/`)                          | Artifact                                                      |
| **Edit**        | `plugin/`                   | `plugin/` → `npm run build:codex`              | `plugin/` (live)                                   | `plugin/` → `npm run build:agy`                               |
| **Do not edit** | —                           | `plugin-codex/`                                | —                                                  | `plugin-antigravity/`                                         |
| **Runtime**     | `~/.claude/plugins/cache/…` | `~/.codex/plugins/cache/…`                     | `~/.omp/agent/` (shim + agents)                    | `~/.gemini/config/plugins/coding-friend/`                     |
| **Skills**      | `plugin/skills`             | converted `$cf-*`                              | Inherit `~/.claude` (priority 80)                  | `/cf-*` copied into the artifact                              |
| **Agents**      | `plugin/agents`             | converted                                      | Convert at install → `~/.omp/agent/agents/cf-*.md` | Copied; `model`: haiku→`flash`, sonnet/opus→`pro`             |
| **Hooks**       | `plugin/hooks/*.sh`         | converted                                      | `plugin/omp/extension.ts` `spawnSync`s live hooks  | `.agy.*` adapters; `hooks.json` at plugin **root**            |
| **MCP**         | marketplace                 | marketplace                                    | `~/.omp/agent/mcp.json`                            | Plugin-scoped `mcp_config.json`                               |
| **`cf dev`**    | `on` / `off` / `sync`       | No — `ud-plugin-local` rebuilds + clears cache | No — shim re-exports the repo path                 | `cf dev on` only picks the source                             |
| **Sandbox env** | `CLAUDE_CONFIG_DIR`         | `CODEX_HOME`                                   | `OMP_HOME`                                         | `ANTIGRAVITY_HOME` (`cf` only; `agy` still reads `~/.gemini`) |
| **Min version** | —                           | Codex CLI ≥ 0.130.0                            | omp ≥ 0.1.0                                        | agy ≥ 1.1.0                                                   |
| **Statusline**  | Yes                         | No                                             | No (own TUI)                                       | No                                                            |

Shared config: Claude, Codex, and Antigravity use one `autoApprove` key
(Claude: Sonnet classifier; Codex/Antigravity: deterministic). There is no
per-host override. omp manages approval itself (`omp config`).

Placeholders in shared source (`{{cf:slash …}}`, `{{cf:agent_ref …}}`,
`{{cf:dispatch …}}`, `{{cf:plugin_root}}`, `{{cf:host}}`) keep host syntax out
of files that are copied into artifacts. Do not hard-code Claude-only command,
agent, or plugin-root syntax there.

## Local dev — shared inner loop

The `cf` CLI is shared by all hosts: run `cd cli && npm run build` once (it is
already `npm link`-ed), or keep `npm run dev` running so it rebuilds on save.

Read more: [Plugin README](../plugin/README.md) (Claude `--plugin-dir` and
`cf dev` details).

### One-time setup

```bash
# Claude Code
cf dev on /path/to/coding-friend                       # switch to the local plugin

# Codex (writes to your real ~/.codex)
npm run build:codex                                    # generate plugin-codex/ from plugin/
codex plugin marketplace add /path/to/coding-friend    # LOCAL path (not the GitHub remote)
cf enable --agent codex                                # enable plugin in ~/.codex/config.toml
#   then in Codex:  /plugins -> install coding-friend  (no scriptable install)
cf init --agent codex --trust-project                  # per project you want it in

# omp
cf install --agent omp                                 # agents + shim + memory MCP
cf init --agent omp                                    # per project: .omp/mcp.json + .coding-friend/

# Antigravity — cf dev on selects ./plugin-antigravity/ as the copy source
cf dev on /path/to/coding-friend
npm run build:agy
cf install --agent agy                                 # copy + MCP + enabled: true
agy plugin validate ~/.gemini/config/plugins/coding-friend
cf init --agent agy
```

Do **not** use `cf install --agent codex` to register the local marketplace —
it adds the GitHub remote (`dinhanhthi/coding-friend` = `main`). Add the local
path with `codex plugin marketplace add /path/to/coding-friend`.

### Inner loop — after editing `plugin/`

One command refreshes all hosts:

```bash
npm run ud-plugin-local
```

It runs `build:codex` (regenerate `plugin-codex/` — Codex reads the artifact,
not `plugin/`) → `build:agy` (regenerate `plugin-antigravity/`) → `cf dev sync`
(copy `plugin/` into the Claude Code dev cache) → `cf update --agent omp --plugin`
→ `cf update --agent agy --plugin` (copy into
`~/.gemini/config/plugins/coding-friend/`) → clear
`~/.codex/plugins/cache/coding-friend-marketplace` (so Codex re-copies on next
launch).

Then **restart to load changes**:

- **Claude Code** — restart, or `/plugin` → reload coding-friend
- **Codex** — quit and relaunch
- **omp** — restart omp (hooks/extension are live; agents need the update step)
- **Antigravity** — quit and relaunch

> Edge cases: a **plugin version bump** or a change to `hooks.json` event types
> needs a full reinstall — `cf dev update` (Claude) and reinstall in Codex
> (`/plugins`). A `cli/` change needs nothing (`npm run dev` rebuilds); a
> **new** CLI command needs `cf init` + completion refresh.

What each edit actually needs (if you skip `ud-plugin-local`):

| You edited             | Claude          | Codex                       | omp                                                | Antigravity        |
| ---------------------- | --------------- | --------------------------- | -------------------------------------------------- | ------------------ |
| `cli/src/**`           | `npm run watch` | same                        | same                                               | same               |
| `plugin/**` (shared)   | `cf dev sync`   | `build:codex` + clear cache | hooks: next spawn; agents: `cf update --agent omp` | `build:agy` + copy |
| `plugin/omp/**`        | —               | —                           | restart omp                                        | —                  |
| `plugin/hooks/*.agy.*` | —               | —                           | —                                                  | `build:agy` + copy |
| `plugin/skills/**`     | `cf dev sync`   | `build:codex`               | Claude cache (omp inherits it)                     | `build:agy` + copy |

### Off / status

```bash
cf dev off       # Claude: switch back to the published (remote) marketplace
cf dev status    # show current mode + marketplace source

# Codex off: in Codex /plugins -> uninstall, then
#   codex plugin marketplace remove coding-friend-marketplace && cf disable --agent codex

cf disable --agent omp     # files remain; cf uninstall --agent omp removes them
cf disable --agent agy     # files remain; cf uninstall --agent agy removes them
```

## Claude Code

`cf dev on/off/sync` writes the Claude marketplace + cache. Claude reads a
**copy** in `~/.claude/plugins/cache/.../<version>/`, not the repo. That is why
`cf dev sync` exists.

### Custom `CLAUDE_CONFIG_DIR`

If you develop against a custom Claude config directory (see
[Installation → Custom config directory](https://cf.dinhanhthi.com/docs/getting-started/installation/)),
the dev plugin must be registered **inside that directory**. `cf dev` honors
`CLAUDE_CONFIG_DIR`, but it shares a single dev-state file
(`~/.coding-friend/dev-state.json`) across config directories — so if you
previously ran `cf dev on` against the default `~/.claude`, re-point it by
turning dev mode off and on again **with the variable set**:

```bash
CLAUDE_CONFIG_DIR=~/.claude-work cf dev off
CLAUDE_CONFIG_DIR=~/.claude-work cf dev on ~/git/coding-friend
CLAUDE_CONFIG_DIR=~/.claude-work cf dev sync
CLAUDE_CONFIG_DIR=~/.claude-work claude
```

Always keep `cf dev` and `claude` on the same `CLAUDE_CONFIG_DIR`.

## Codex

Artifact mode. Codex CLI ≥ 0.130.0. Canonical source is still `plugin/`.

```
plugin/            ← ONLY source (Claude-native)
   │  npm run build:codex   (scripts/build-codex-plugin.js)
   ▼
plugin-codex/      ← GENERATED artifact (committed)
   │  marketplace add <repo>  +  /plugins install
   ▼
~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/   ← Codex COPIES here
```

- Marketplace: `.agents/plugins/marketplace.json` → `source: local, path: ./plugin-codex`
  (Claude's is `.claude-plugin/marketplace.json` → `./plugin`).
- The build converts `/cf-x` → `$cf-x`, `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}`,
  `subagent_type` → custom agent, model alias → reasoning effort,
  `CLAUDE.md` → `AGENTS.md`, …
- Guards: `npm run lint:codex` (no leftover Claude-isms),
  `npm run verify:codex-drift` (committed artifact matches the build).
  Pre-commit rebuilds + stages `plugin-codex/`.
- Host-aware CLI: `cli/src/lib/host.ts`, `cli/src/lib/codex-config.ts`, and the
  Codex branches of `install` / `uninstall` / `enable` / `disable` / `update` /
  `init` / `permission`.

**Cache.** Codex copies the plugin into
`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` — it does **not**
read the repo. The cache is keyed by version. `npm run ud-plugin-local` rebuilds
the artifact and deletes that cache so the next launch re-copies. Editing
`plugin/` + `build:codex` alone is not enough.

**Sandbox:** prefix every `codex` command with `CODEX_HOME=/tmp/cf-codex-dev`
(same value for the whole session) to avoid touching `~/.codex`.

**Off.** There is no `cf dev off` for Codex. Uninstall in `/plugins`, then
`codex plugin marketplace remove coding-friend-marketplace` and
`cf disable --agent codex`. To use the published plugin again:
`cf install --agent codex`.

## omp

Bridge mode _(beta)_. [oh-my-pi](https://omp.sh/). There is **no**
`plugin-omp/` artifact. [`plugin/omp/extension.ts`](../plugin/omp/extension.ts)
`spawnSync`s [`plugin/hooks/*.sh`](../plugin/hooks/) with `CF_HOST=omp`. Runtime
details: [`plugin/omp/README.md`](../plugin/omp/README.md).

| Layer      | How omp receives it                                                                      | What it does not do                      |
| ---------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| Skills     | Inherit from `~/.claude` (priority **80**; omp native = 100, Claude-plugins cache = 70)  | Does not copy `plugin/skills/`           |
| Agents     | Convert 12 `plugin/agents/cf-*.md` → `~/.omp/agent/agents/cf-*.md` (flat, not recursive) | Does **not** inherit `~/.claude/agents/` |
| Hooks      | Shim `spawnSync`s live `plugin/hooks/*.sh`                                               | No bash → TS port                        |
| MCP        | Writes `~/.omp/agent/mcp.json` (no `omp mcp add`)                                        | —                                        |
| Statusline | Skipped                                                                                  | `cf statusline` / `cf permission`        |

**Correct agent path:** `~/.omp/agent/agents/*.md` — discovery is
**non-recursive**. Do **not** deploy into `~/.omp/agents/coding-friend/`.
`ompUserAgentsDir()` in [`cli/src/lib/paths.ts`](../cli/src/lib/paths.ts) is
the right helper; `ompCodingFriendAgentsDir()` is unused.

`systemPrompt` = the **markdown body** after frontmatter (`name` +
`description` required). Do not put `systemPrompt` in the YAML. Converter:
`convertClaudeAgentToOmp()` in [`cli/src/lib/omp-config.ts`](../cli/src/lib/omp-config.ts).

```
plugin/                ← ONLY source
├── skills/            ← omp inherits from ~/.claude
├── agents/cf-*.md     ← convert at install → ~/.omp/agent/agents/
└── hooks/*.sh         ← shared bash
       ▲
plugin/omp/extension.ts  (pi.on → spawnSync, CF_HOST=omp)
       ▲
~/.omp/agent/extensions/coding-friend.ts  (re-export shim)
```

The shim is a `// CODING_FRIEND_PLUGIN_ROOT=<abs>` comment then
`export { default } from "<abs-to-plugin/omp/extension.ts>"`.
`plugin/omp/` is **not** in `.claude-plugin/marketplace.json`.

| omp event                                                                                          | Claude hook   | Script                                                      |
| -------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| `session_start`                                                                                    | SessionStart  | `session-init.sh` → `pi.sendMessage`                        |
| `tool_call`                                                                                        | PreToolUse    | `privacy-block.sh` → `scout-block.cjs` → `auto-approve.cjs` |
| `session_before_compact` / `session.compacting` / `session_compact` (+ alias `session_compacting`) | PreCompact    | `memory-capture.sh`                                         |
| `session_shutdown`                                                                                 | Stop          | `session-log.sh`                                            |
| `before_agent_start`                                                                               | SubagentStart | `agent-tracker.sh`                                          |

Privacy/scout **fail closed** (missing script / spawn error → `{ block: true }`).

`--project` / `--local` → project scope (`<cwd>/.omp/agents/cf-*.md`,
`<cwd>/.omp/extensions/coding-friend.ts`). Default = user. Memory MCP **always**
writes `~/.omp/agent/mcp.json` (user).

**Sandbox:** `OMP_HOME=/tmp/cf-omp-dev` for every `cf`/`omp` command in the
session.

### Files written (`cf install --agent omp`, user scope)

| Path                                                           | Contents                             |
| -------------------------------------------------------------- | ------------------------------------ |
| `~/.omp/agent/agents/cf-*.md`                                  | 12 converted agents                  |
| `~/.omp/agent/extensions/coding-friend.ts`                     | Re-export shim                       |
| `~/.omp/agent/mcp.json` → `mcpServers["coding-friend-memory"]` | `npx -y coding-friend-cli mcp-serve` |

`cf disable --agent omp` only upserts `task.disabledAgents` (block
`# coding-friend-managed`) in `~/.omp/agent/config.yml` (user) or
`<cwd>/.omp/config.yml` (project). Files stay.

`cf update` with no `--agent` updates every installed host (Claude → Codex →
omp → agy). `--agent omp` / `--omp` = omp only.

### Uninstall (`cf uninstall --agent omp`)

| Artifact                      | User (`--user` / default)                                    | Project (`--project` / `--local`)               |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `cf-*.md` agents              | Delete `^cf-.*\.md$` in `~/.omp/agent/agents/` (keep others) | Same for `<cwd>/.omp/agents/`                   |
| `coding-friend.ts` shim       | Delete `~/.omp/agent/extensions/coding-friend.ts`            | Delete `<cwd>/.omp/extensions/coding-friend.ts` |
| `coding-friend-memory` MCP    | Remove from `~/.omp/agent/mcp.json`                          | Does **not** unregister                         |
| `coding-friend-learn` MCP     | Unregister if written by `cf config`/`cf learn`              | Does **not** unregister                         |
| `~/.claude/**`, `~/.codex/**` | Untouched                                                    | Untouched                                       |
| `config.yml` `disabledAgents` | Not reverted                                                 | Not reverted                                    |

Nothing to remove → `"Nothing to uninstall"`. Restart omp after uninstall.

### omp gotchas

1. **Agent frontmatter** — `parseAgent` takes `systemPrompt` from the body.
   Converter keeps `model` ∈ `{haiku, sonnet, opus}`. Missing
   `name`/`description` → that file is skipped.
2. **Skills inheritance** — omp reads user/project `.claude/skills/*/SKILL.md`
   (priority 80) **and** the marketplace cache via `installed_plugins.json`
   (priority 70). Native omp skills are 100. Coding Friend `cf-*` live in the
   Claude plugin cache, not `~/.claude/skills/`. A machine with no Claude
   install will not see `cf-*`.
3. **`.omp/` false-positive on Claude** —
   [`session-init.sh`](../plugin/hooks/session-init.sh) when `CF_HOST` is empty:
   `CODEX_SESSION_ID` > `OMP_SESSION_ID` > `$PWD/.omp` > `claude`.
   `cf init --agent omp` creates `.omp/` → a Claude session in the same repo
   can be detected as `CF_HOST=omp`. Mitigation: `CF_HOST=claude` when
   launching Claude on a mixed-host repo. The omp extension always sets
   `CF_HOST=omp`.
4. **`--omp` vs `--agent`** — `.option("--agent <agent>")` must not default to
   `"claude"` or `cf install --omp` conflicts. Default host with no flag is
   `"claude"` in `cli/src/lib/host.ts`.
5. **`cf permission --agent omp`** — no-op; omp owns approval-mode.
6. **No official `OMP_SESSION_ID`** — the probe uses the env if present, then
   `.omp/` in cwd.

### omp troubleshooting

| Symptom                                 | Check                                                                     | Fix                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `omp CLI not found`                     | `command -v omp`                                                          | [omp.sh](https://omp.sh/)                                                   |
| 0 agents after install                  | `ls ~/.omp/agent/agents/cf-*.md` — **not** `~/.omp/agents/coding-friend/` | Run from this repo or after a Claude `cf install`                           |
| Agent not showing                       | Non-recursive discovery; `cf disable --agent omp`                         | `cf enable --agent omp`; restart                                            |
| `cf-*` skills disappear                 | Claude not installed / cache empty                                        | Install the Claude plugin; `cf dev sync` in dev                             |
| Hook not running                        | Shim `CODING_FRIEND_PLUGIN_ROOT` must be a real file                      | `cat ~/.omp/agent/extensions/coding-friend.ts`                              |
| Privacy blocks every tool               | Fail closed when the script is missing                                    | Root must contain `hooks/privacy-block.sh`                                  |
| Claude session shows `HOST: omp`        | Repo has `.omp/`                                                          | `CF_HOST=claude` when launching Claude                                      |
| `--omp` conflicts with `--agent claude` | Old Commander default                                                     | Use `--omp` **or** `--agent omp`                                            |
| MCP does not connect                    | `jq . ~/.omp/agent/mcp.json`                                              | Need `coding-friend-memory`; project uninstall does not remove the user MCP |
| `cf update` skips omp                   | `isOmpAgentInstalled`                                                     | Need at least one user or project `cf-*.md`                                 |

```bash
ls ~/.omp/agent/agents/cf-*.md | wc -l          # 12
cat ~/.omp/agent/extensions/coding-friend.ts
jq '.mcpServers["coding-friend-memory"]' ~/.omp/agent/mcp.json
```

session-init log: `${TMPDIR:-/tmp}/coding-friend-session-init.log`.

## Antigravity

Artifact mode _(beta)_. Google Antigravity (`agy` ≥ 1.1.0). Unlike omp, agy
does **not** inherit the Claude marketplace and has no TypeScript shim.

```
plugin/                      ← ONLY source
   │  npm run build:agy      (scripts/build-antigravity-plugin.js)
   ▼
plugin-antigravity/          ← GENERATED artifact (committed)
   │  cf install --agent agy
   ▼
~/.gemini/config/plugins/coding-friend/   ← runtime (IDE + agy CLI)
```

(`cf` honors `ANTIGRAVITY_HOME`, default `~/.gemini`.)

| Layer      | How agy receives it                                                       | What it does not do                        |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| Skills     | Copy `plugin-antigravity/skills/<name>/SKILL.md` → slash `/cf-*`          | Does not inherit `~/.claude`               |
| Agents     | Copy `agents/cf-*.md` (`model`: `flash` / `pro` / `inherit`)              | Does not deploy `~/.gemini/config/agents/` |
| Hooks      | `hooks.json` **at the plugin root**; cwd = plugin dir; `CF_HOST=agy`      | No bash → TS port; no `AGY_PLUGIN_ROOT`    |
| MCP        | `mcp_config.json` inside the plugin — **no** `agy mcp add`                | —                                          |
| Rules      | `rules/AGENTS.md` always-on (rendered from Claude `context/bootstrap.md`) | Does not ship `context/`                   |
| Statusline | Skipped                                                                   | `cf statusline` / `cf update --statusline` |

Guards: `npm run lint:agy`, `npm run verify:agy-drift`. Pre-commit rebuilds +
`git add`s the artifact when `plugin/` changes.

Enable state: `~/.gemini/config/config.json` →
`plugins["coding-friend"].enabled` (`cf enable --agy` / `cf disable --agy`).
No user / project / local scope — `--project` / `--local` are ignored.

`cf install` / `cf update --agent agy` resolve the source in this order:

1. **dev** — `cf dev on <repo>` → `<localPath>/plugin-antigravity/`
2. **marketplace** — clone that contains `plugin-antigravity/`
3. **clone** — `git clone --depth 1` into
   `~/.coding-friend/agy-src/plugin-antigravity/`

Local-dev **must** run `cf dev on .` first; otherwise steps 2/3 can deploy a
stale artifact from `main`. Hook `command`s run `sh -c` with cwd = the
directory that contains `hooks.json`. Scripts infer `PLUGIN_ROOT` from
`$(dirname "$0")/..`, then `cd` to `workspacePaths[0]`. stdin/stdout are
**camelCase** JSON.

**Sandbox:** `ANTIGRAVITY_HOME=/tmp/cf-agy-dev` for every `cf` command in the
session. The `agy` CLI itself still reads `~/.gemini`.

Manual copy (if you skip `ud-plugin-local`):

```bash
npm run build:agy
cp -R plugin-antigravity/. ~/.gemini/config/plugins/coding-friend/
agy plugin validate ~/.gemini/config/plugins/coding-friend
```

### Hook map (5 AGY events)

agy has five events. Coding Friend uses three; the other two stay empty.

| AGY event                                                                                                                                           | Script                                         | Claude hook               | Notes                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PreInvocation` (`invocationNum` 0 or 1)                                                                                                            | `session-init.agy.sh`                          | SessionStart              | `injectSteps.ephemeralMessage` header `HOST: agy` (cap 12 000 chars). Does not inject `bootstrap.md`.      |
| `PreInvocation` (`invocationNum` 4, 8, 12, …)                                                                                                       | `rules-reminder.agy.sh`                        | UserPromptSubmit          | Turns 0/1 left empty so they do not collide with session-init.                                             |
| `PreToolUse` matcher `view_file\|grep_search\|find_by_name\|list_dir\|write_to_file\|replace_file_content\|multi_replace_file_content\|run_command` | `privacy-block.agy.sh` → `scout-block.agy.cjs` | PreToolUse                | stdout `{decision: allow\|deny}`. Bad JSON → **fail open**. Disable: `privacyBlock` / `scoutBlock: false`. |
| `PreToolUse` matcher `*`                                                                                                                            | `auto-approve.agy.cjs`                         | PreToolUse (auto-approve) | Opt-in `autoApprove: true`. Default / missing → `{decision: "ask"}`. Deterministic, no LLM.                |
| `Stop`                                                                                                                                              | `session-log.agy.sh`                           | Stop                      | Append `/tmp/cf-session-${conversationId}.jsonl`; stdout `{decision:""}`.                                  |
| `PostToolUse` / `PostInvocation`                                                                                                                    | —                                              | —                         | Not registered.                                                                                            |

Shared modules in `plugin-antigravity/hooks/` but **not** wired into
`hooks.json`: `auto-approve.cjs`, `scout-block.cjs` (`require`d from the
`.agy.cjs` adapters).

No AGY equivalent (generator excludes them via `AGY_EXCLUDED_SOURCE_PATHS`):

| Claude hook                  | Source              | Reason                                                                       |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| TaskCreated / TaskCompleted  | `task-tracker.sh`   | No Task\* event                                                              |
| SubagentStart / SubagentStop | `agent-tracker.sh`  | No Subagent\* event                                                          |
| PreCompact                   | `memory-capture.sh` | No compact event → no auto-capture. `session-log.agy.sh` still writes jsonl. |
| Statusline                   | `statusline.sh`     | agy has no Claude statusline                                                 |

`/cf-session` on agy points at native `/resume` (IDE) or `agy --continue` —
it does not copy the transcript. `--with-codex` / `review.withCodex` are
ignored.

### Files written (`cf install --agent agy`)

| Path                                                        | Contents                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `~/.gemini/config/plugins/coding-friend/`                   | Artifact tree: `plugin.json`, `hooks.json`, `mcp_config.json`, `skills/`, `agents/`, `hooks/`, … |
| `…/installed_version.json`                                  | `{ version, installedAt, source }`                                                               |
| `…/mcp_config.json` → `mcpServers["coding-friend-memory"]`  | `npx -y coding-friend-cli mcp-serve`                                                             |
| `~/.gemini/config/config.json` → `plugins["coding-friend"]` | `{ enabled: true }`                                                                              |

`cf init --agent agy` creates `docs/{plans,memory,research,sessions,reviews,warm}/`,
`.coding-friend/config.json` if missing, and `AGENTS.md` if it does not already
exist. It does not write a project `.agy/` directory.

### Uninstall (`cf uninstall --agent agy`)

| Artifact                                              | Behavior                       |
| ----------------------------------------------------- | ------------------------------ |
| Plugin tree `~/.gemini/config/plugins/coding-friend/` | Delete the whole directory     |
| `coding-friend-memory` MCP                            | Remove before deleting the dir |
| `config.json` `plugins["coding-friend"]`              | Delete the key                 |
| `~/.claude/**`, `~/.codex/**`, `~/.omp/**`            | Untouched                      |
| Project `AGENTS.md` / `docs/`                         | Untouched                      |

### Antigravity gotchas

1. **Artifact, not a bridge** — forget `ud-plugin-local` + restart and the
   runtime stays stale.
2. **`cf dev on .` selects the source** — without it, install/update may pick
   a marketplace clone / GitHub `main`.
3. **No `AGY_PLUGIN_ROOT`** — skill docs use the `<plugin-root>` token in
   `rules/AGENTS.md`. `./hooks` in `hooks.json` is relative because cwd =
   plugin dir.
4. **stdin is camelCase** — `toolCall.args` (`AbsolutePath`, `TargetFile`,
   `CommandLine`, …), not Claude `tool_input`.
5. **Privacy/scout fail open** — broken JSON stdin → allow. omp **fails
   closed**. Matcher misses some tools (`invoke_subagent`, `search_web`); the
   auto-approve matcher `*` still runs.
6. **`cf permission --agent agy`** — no-op; agy manages `/permissions`.
   Auto-approve is only the shared `autoApprove` config key.
7. **`rules/AGENTS.md` is gitignored** at the repo root (AI Sync
   `AGENTS.md` rule). Pre-commit runs
   `git add -f -- plugin-antigravity/rules/AGENTS.md`.
8. **One install location** — no project plugin `.agents/plugins/`. Does not
   call `agy plugin install`.
9. **`agy -p` (print mode) does not run tools/hooks** — do not use it to test
   privacy-block.
10. **`agy plugin list` = "No imported plugins"** when copied into
    `~/.gemini/config/plugins/` — that does not mean unloaded; use
    `agy plugin validate` + `agy agents`.

### Antigravity troubleshooting

| Symptom                                | Check                                                                     | Fix                                                           |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `agy CLI not found`                    | `command -v agy`                                                          | [antigravity.google](https://antigravity.google/)             |
| Version unsupported                    | `agy --version`                                                           | Need ≥ 1.1.0                                                  |
| 0 skills/agents after install          | `ls ~/.gemini/config/plugins/coding-friend/{skills,agents}`               | `cf dev on .` then `cf install --agy` from this repo          |
| Plugin not showing                     | `jq '.plugins["coding-friend"]' ~/.gemini/config/config.json`             | `cf enable --agy`; restart                                    |
| Hook not running                       | `grep hooks_manager ~/.gemini/antigravity-cli/cli.log`                    | Restart; `agy plugin validate`; `test -x` the `.agy.sh` files |
| Privacy does not block `.env`          | Matcher + fail-open; `privacyBlock: false`                                | Synthetic pipe below; local/global config                     |
| Auto-approve does not allow            | `autoApprove` defaults off                                                | Set `true` in `.coding-friend/config.json`                    |
| MCP does not connect                   | `jq '.mcpServers' ~/.gemini/config/plugins/coding-friend/mcp_config.json` | Must have `coding-friend-memory`                              |
| `cf update` skips agy                  | `isAgyPluginInstalled` (`plugin.json` in the plugin dir)                  | `cf install --agy` first                                      |
| `ud-plugin-local` “agy update skipped” | `agy` / `cf` on PATH; plugin already installed                            | Install agy, `cf install --agy`, retry                        |
| Hook edit not visible                  | agy reads the **copy**, not the repo                                      | `npm run ud-plugin-local` + restart                           |
| `agy plugin validate` ≠ 0              | validate stdout                                                           | Files stay installed; treat as a warning, not a rollback      |

Hook logs: `~/.gemini/antigravity-cli/cli.log` (and
`~/.gemini/antigravity-cli/log/cli-*.log`) — grep `hooks_manager`.
`session-init.agy.sh` does **not** write
`${TMPDIR}/coding-friend-session-init.log`.

```bash
agy plugin validate ~/.gemini/config/plugins/coding-friend

printf '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"/x/.env"}},"workspacePaths":["/x"]}' \
  | (cd ~/.gemini/config/plugins/coding-friend && CF_HOST=agy ./hooks/privacy-block.agy.sh)
# expect: {"decision":"deny", ...}

printf '{"invocationNum":1,"workspacePaths":["'"$PWD"'"]}' \
  | (cd ~/.gemini/config/plugins/coding-friend && CF_HOST=agy ./hooks/session-init.agy.sh)
# expect: injectSteps contains HOST: agy
```

## Token counts

Each skill and agent consumes context tokens when loaded. The script
`scripts/generate-token-counts.ts` measures this and writes
`website/src/generated/token-counts.json`.

```bash
npm run generate:tokens
```

**What it does:**

1. Reads every `SKILL.md` in `plugin/skills/<name>/`
2. Reads every agent `.md` in `plugin/agents/`
3. Reads the bootstrap context (`plugin/context/bootstrap.md`)
4. Counts tokens using `@lenml/tokenizer-claude`
5. Assigns a context tier: `⚡` low (<1,500), `⚡⚡` medium (1,500–3,000),
   `⚡⚡⚡` high (>3,000)
6. Writes everything to `website/src/generated/token-counts.json`

The website imports this JSON (via `website/src/lib/token-data.ts`) to display
context footprint info on skill and agent doc pages.

**When to run:** after any `SKILL.md` or agent `.md` file is added, removed, or
modified — and before release to keep website data in sync.

## Release Workflow

### Packages

| Package | Version file                                              | Changelog             | Tag pattern |
| ------- | --------------------------------------------------------- | --------------------- | ----------- |
| Plugin  | `plugin/.claude-plugin/plugin.json` + root `package.json` | `plugin/CHANGELOG.md` | `v*`        |
| CLI     | `cli/package.json`                                        | `cli/CHANGELOG.md`    | `cli-v*`    |

> Learn MCP, Learn Host, and CF Memory are bundled libs inside CLI — versioned
> and released as part of CLI.

### Normal Workflow with release process

```
# 1. Code (repeat as needed)
/cf-commit                        # commit (includes secret scan on staged changes)

# 2. Review (before release prep)
# Normally, it will be automatically triggered after each implementation or fix.
/cf-review                        # 5-layer review with proportional security depth

# 3. Prep release (when ready to publish)
/cf-ship                          # bump + changelog + commit + PR (via cf-ship-custom guide)
# → merge PR on GitHub

# 4. Publish (after PR merge)
git checkout main && git pull     # switch to main with latest changes
/release                          # finalize changelogs, create git tags, push → CI publishes
```

`/cf-ship` accepts args for package filter: `/cf-ship cli patch`,
`/cf-ship learn-mcp`, etc.

### Bump levels

| Level             | When                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| **PATCH** (x.x.1) | Bug fix, typo, docs update                                           |
| **MINOR** (x.1.0) | New feature, new skill, new hook (backward compatible)               |
| **MAJOR** (1.0.0) | Breaking change (config format, removed skill, changed CLI behavior) |

## References

- [architecture.md](architecture.md) — plugin vs CLI overview
- [plugin/README.md](../plugin/README.md) — Claude `--plugin-dir` and `cf dev`
- [plugin/omp/README.md](../plugin/omp/README.md) — omp bridge runtime
- Codex design notes: [plans/2026-05-16-codex-support/HOW-IT-WORKS.md](plans/2026-05-16-codex-support/HOW-IT-WORKS.md),
  [PARITY-GAPS.md](plans/2026-05-16-codex-support/PARITY-GAPS.md)
- Builds: `scripts/build-codex-plugin.js`, `scripts/build-antigravity-plugin.js`,
  `scripts/update-plugin-local.js`
- Host CLI: `cli/src/lib/host.ts`, `cli/src/lib/codex-config.ts`,
  `cli/src/lib/omp-config.ts`, `cli/src/lib/agy-config.ts`,
  `cli/src/lib/paths.ts`
- agy docs: [antigravity.google/docs](https://antigravity.google/docs)
