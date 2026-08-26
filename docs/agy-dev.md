# Working with agy (local dev)

> Standalone reference for developing/testing Coding Friend on
> **Google Antigravity** (`agy`). agy is the fourth host (beta), **artifact mode** —
> unlike omp ([omp-dev.md](omp-dev.md), **bridge**, no `plugin-omp/`).
> Codex host (same artifact style): [codex-dev.md](codex-dev.md). Shared
> dev process: [plugin-dev.md](plugin-dev.md).

**Updated:** 2026-08-25 · agy CLI ≥ 1.1.0 · labelled **beta**.

---

## 1. Overview — artifact mode

agy does **not** inherit the Claude marketplace the way omp does, and has no
TypeScript shim. The canonical source is still `plugin/` (Claude-native). The
generator [`scripts/build-antigravity-plugin.js`](../scripts/build-antigravity-plugin.js)
produces the committed artifact `plugin-antigravity/`. `cf install --agent agy`
copies that tree to a single location:

`~/.gemini/config/plugins/coding-friend/`

(`cf` honors `ANTIGRAVITY_HOME`, default `~/.gemini`.)

| Layer      | How agy receives it                                                                             | What it does not do                              |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Skills     | Copy `plugin-antigravity/skills/<name>/SKILL.md` → slash `/cf-*`                                | Does not inherit `~/.claude`                     |
| Agents     | Copy 12 `agents/cf-*.md` files (frontmatter `model`: `flash` / `pro` / `inherit`)               | Does not deploy `~/.gemini/config/agents/`       |
| Hooks      | `hooks.json` **at the plugin root** (not `hooks/hooks.json`); cwd = plugin dir; `CF_HOST=agy`   | No bash → TS port; no `AGY_PLUGIN_ROOT`          |
| MCP        | Writes `mcp_config.json` inside the plugin (plugin-scoped) — **no** `agy mcp add`               | —                                                |
| Rules      | `rules/AGENTS.md` always-on (Claude `context/bootstrap.md` is rendered into this file)          | Does not ship `context/`                         |
| Statusline | Skipped — agy has no Claude statusline                                                          | `cf statusline` / `cf update --statusline`       |

**Do not edit `plugin-antigravity/` by hand** — always edit `plugin/` then
`npm run build:agy` (or `npm run ud-plugin-local`). Guards:
`npm run lint:agy`, `npm run verify:agy-drift`. Pre-commit rebuilds +
`git add`s the artifact when `plugin/` source changes.

Enable state: `~/.gemini/config/config.json` →
`plugins["coding-friend"].enabled` (`cf enable --agy` / `cf disable --agy`).
No user / project / local scope — `--project` / `--local` are ignored.

---

## 2. Architecture: source → artifact → runtime

```
plugin/                      ← ONLY source (Claude-native)
   │  npm run build:agy      (scripts/build-antigravity-plugin.js)
   ▼
plugin-antigravity/          ← GENERATED artifact (committed)
   │  cf install --agent agy  (copy tree; alias: --agy)
   ▼
~/.gemini/config/plugins/coding-friend/   ← runtime (IDE + agy CLI)
```

`cf install` / `cf update --agent agy` resolve the source in this order:

1. **dev** — `cf dev on <repo>` wrote `~/.coding-friend/dev-state.json` →
   `<localPath>/plugin-antigravity/`
2. **marketplace** — clone of the Claude marketplace that contains `plugin-antigravity/`
3. **clone** — `git clone --depth 1` of the GitHub repo into
   `~/.coding-friend/agy-src/plugin-antigravity/`

Local-dev **must** run `cf dev on .` before install/update; otherwise steps 2/3
can deploy a stale artifact from `main`. `cf dev` is still Claude-only for the
`~/.claude` cache — for agy it only **selects the source**.

Hook `command`s run `sh -c` with cwd = the directory that contains `hooks.json`
(the plugin dir). Scripts infer `PLUGIN_ROOT` from `$(dirname "$0")/..`, then
`cd` to `workspacePaths[0]`. stdin/stdout are **camelCase** JSON.

---

## 3. Hook map — 5 AGY events

agy has only five events. Coding Friend uses three; the other two are left empty.

| AGY event                                                                                                                                           | Script (in `plugin-antigravity/hooks/`)                                                                                                               | Matching Claude hook      | Notes                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PreInvocation` (`invocationNum` 0 or 1)                                                                                                            | [`session-init.agy.sh`](../plugin-antigravity/hooks/session-init.agy.sh)                                                                              | SessionStart              | `injectSteps.ephemeralMessage` header `HOST: agy` (cap 12 000 chars). Does not inject `bootstrap.md`.                  |
| `PreInvocation` (`invocationNum` 4, 8, 12, …)                                                                                                       | [`rules-reminder.agy.sh`](../plugin-antigravity/hooks/rules-reminder.agy.sh)                                                                          | UserPromptSubmit          | Same reminder text; turns 0/1 are left empty so they do not collide with session-init.                                 |
| `PreToolUse` matcher `view_file\|grep_search\|find_by_name\|list_dir\|write_to_file\|replace_file_content\|multi_replace_file_content\|run_command` | [`privacy-block.agy.sh`](../plugin-antigravity/hooks/privacy-block.agy.sh) → [`scout-block.agy.cjs`](../plugin-antigravity/hooks/scout-block.agy.cjs) | PreToolUse                | stdout `{decision: allow\|deny}`. Bad JSON → **fail open**. Disable: `privacyBlock` / `scoutBlock: false`.             |
| `PreToolUse` matcher `*`                                                                                                                            | [`auto-approve.agy.cjs`](../plugin-antigravity/hooks/auto-approve.agy.cjs)                                                                            | PreToolUse (auto-approve) | Opt-in `autoApprove: true` (same key as Claude). Default / missing key → `{decision: "ask"}`. Deterministic, no LLM.   |
| `Stop`                                                                                                                                              | [`session-log.agy.sh`](../plugin-antigravity/hooks/session-log.agy.sh)                                                                                | Stop                      | Append `/tmp/cf-session-${conversationId}.jsonl`; stdout `{decision:""}`.                                              |
| `PostToolUse`                                                                                                                                       | —                                                                                                                                                     | —                         | Not registered.                                                                                                        |
| `PostInvocation`                                                                                                                                    | —                                                                                                                                                     | —                         | Not registered.                                                                                                        |

Shared modules (present in `plugin-antigravity/hooks/` but **not** wired into
`hooks.json`): [`auto-approve.cjs`](../plugin-antigravity/hooks/auto-approve.cjs)
(`require`d from `auto-approve.agy.cjs`), [`scout-block.cjs`](../plugin-antigravity/hooks/scout-block.cjs)
(`require`d from `scout-block.agy.cjs`).

### No AGY equivalent

These Claude hooks have no AGY event — the generator **intentionally excludes**
them from the artifact (`AGY_EXCLUDED_SOURCE_PATHS`):

| Claude hook                  | Source script                    | Reason                                                                                                                                 |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TaskCreated / TaskCompleted  | `plugin/hooks/task-tracker.sh`   | No Task\* event                                                                                                                        |
| SubagentStart / SubagentStop | `plugin/hooks/agent-tracker.sh`  | No Subagent\* event                                                                                                                    |
| PreCompact                   | `plugin/hooks/memory-capture.sh` | No compact event → no auto-capture of memory at compact time. `session-log.agy.sh` still writes jsonl but has no PreCompact consumer.  |
| Statusline                   | `plugin/hooks/statusline.sh`     | agy has no Claude statusline. `cf statusline` / `cf update --statusline --agent agy` skip.                                             |

---

## 4. Skills / agents / MCP / rules

| Component       | Artifact                                         | Runtime                                                                                                                                                                            |
| --------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills** (26) | `plugin-antigravity/skills/<name>/SKILL.md`      | Slash `/cf-*` (agy treats a skill as a slash command). Placeholder `{{cf:slash cf-x}}` → `/cf-x`.                                                                                  |
| **Agents** (12) | `plugin-antigravity/agents/cf-*.md`              | `invoke_subagent` with the `name` in frontmatter. `model`: haiku→`flash`, sonnet/opus→`pro`. No `tools` declared (inherit all).                                                    |
| **MCP**         | `plugin-antigravity/mcp_config.json`             | After `cf install`/`cf update`: `mcpServers["coding-friend-memory"]` = `{ command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] }`. Plugin-scoped — no `agy mcp add`.     |
| **Rules**       | `plugin-antigravity/rules/AGENTS.md`             | Always-on. Includes `HOST: agy` + a `<plugin-root>` note + rendered bootstrap.                                                                                                     |
| **Manifest**    | `plugin.json` (`name`, `version`, `description`) | Discovery: plugin directory = `coding-friend`.                                                                                                                                     |

Agents (exactly 12 files): `cf-explorer`, `cf-implementer`, `cf-planner`,
`cf-reviewer`, `cf-reviewer-plan`, `cf-reviewer-quality`,
`cf-reviewer-reducer`, `cf-reviewer-rules`, `cf-reviewer-security`,
`cf-reviewer-tests`, `cf-writer`, `cf-writer-deep`.

Slash skills: `/cf-advise`, `/cf-ask`, `/cf-plan`, `/cf-plan-resume`,
`/cf-later-do`, `/cf-checkpoint`, `/cf-checkpoint-from`, `/cf-review`,
`/cf-review-out`, `/cf-review-in`, `/cf-commit`, `/cf-design`, `/cf-ship`,
`/cf-fix`, `/cf-optimize`, `/cf-scan`, `/cf-remember`, `/cf-learn`,
`/cf-teach`, `/cf-research`, `/cf-session`, `/cf-warm`, `/cf-help`.
Auto-invoke (no slash): `cf-tdd`, `cf-sys-debug`, `cf-verification`.

`/cf-session` on agy does **not** copy the transcript — it points at native
`/resume` (IDE) or `agy --continue`. `--with-codex` / `review.withCodex` are ignored.

---

## 5. Local-dev workflow for agy

> `cf dev on/off/sync` **only supports the Claude cache**
> ([`plugin-dev.md`](plugin-dev.md)). agy reads the **copy** in
> `~/.gemini/config/plugins/coding-friend/`, not the repo directly. The four
> hosts are independent (`~/.claude` / `~/.codex` / `~/.omp` / `~/.gemini`);
> the `cf` CLI is shared.

### A. One-time setup

```bash
cd cli && npm run build && cd ..   # 1. local CLI (cf already npm-linked)
cf dev on .                        # 2. source = ./plugin-antigravity/
npm run build:agy                  # 3. generate artifact (also runs in ud-plugin-local)
# agy CLI: https://antigravity.google/  →  agy --version  ≥ 1.1.0
cf install --agent agy             # 4. copy + MCP + enabled: true
#    alias: cf install --agy
agy plugin validate ~/.gemini/config/plugins/coding-friend
cf init --agent agy                # 5. wizard: docs/language/gitignore/learn/autoApprove/privacyBlock + AGENTS.md
# restart Antigravity / start a new `agy` session
```

`agy plugin validate` expects skills / agents / mcpServers / hooks to all be
processed. Validate warnings do not roll back files that were already copied.

> Sandbox: `ANTIGRAVITY_HOME=/tmp/cf-agy-dev` for **every** `cf` command in the
> session (same idea as `CODEX_HOME` / `OMP_HOME`). The `agy` CLI itself reads
> `~/.gemini` — the env prefix only changes the path that `cf` writes.

### B. Inner loop (after each edit)

```bash
npm run ud-plugin-local
```

The script does: `build:codex` → `build:agy` → `cf dev sync` (Claude) →
`cf update --agent omp --plugin` → `cf update --agent agy --plugin` → clear
the Codex cache. The agy step **skips** if `agy`/`cf` are not on PATH.

Then **restart Antigravity** (or start a new `agy` session) — the copy in
`~/.gemini/config/plugins/coding-friend/` is only loaded after that.

- Edit `cli/src/**` → `cd cli && npm run build` (or `npm run watch`).
- Edit `plugin/**` → `ud-plugin-local` + restart. Do not hand-edit
  `plugin-antigravity/`.
- Edit only `.agy.*` hooks in `plugin/hooks/` → still need `build:agy` then
  copy (agy does not spawn files from the repo).

### C. Disable / clean up

```bash
cf disable --agent agy     # plugins["coding-friend"].enabled = false — files remain
cf enable --agent agy      # enabled = true
cf uninstall --agent agy   # delete plugin dir + MCP entry + config.json key
```

Claude / Codex / omp are **not** touched. There is no agy marketplace to
`remove`.

---

## 6. Files written by `cf install --agent agy`

| Path                                                        | Contents                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.gemini/config/plugins/coding-friend/`                   | Artifact tree: `plugin.json`, `hooks.json`, `mcp_config.json`, `skills/`, `agents/`, `hooks/`, `lib/`, `rules/AGENTS.md`, `README.md`, `CHANGELOG.md` |
| `…/installed_version.json`                                  | `{ version, installedAt, source }` written by the CLI after the copy                                                                                 |
| `…/mcp_config.json` → `mcpServers["coding-friend-memory"]`  | `{ command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] }`                                                                                 |
| `~/.gemini/config/config.json` → `plugins["coding-friend"]` | `{ enabled: true }`                                                                                                                                  |

`cf disable --agent agy` does **not** delete the files above; it only sets `enabled: false`.

`cf update` with **no** `--agent` updates every installed host (Claude → Codex
→ omp → agy). `--agent agy` / `--agy` = agy only. `--plugin` redeploys the
artifact without touching the CLI npm package.

`cf init --agent agy` (per-project): creates `docs/{plans,memory,research,sessions,reviews,warm}/`,
`.coding-friend/config.json` if missing, and `AGENTS.md` (slash `/cf-*`) if it
does not already exist. Does not write a project `.agy/` directory.

---

## 7. Uninstall matrix

`cf uninstall --agent agy`
([`cli/src/commands/uninstall.ts`](../cli/src/commands/uninstall.ts)):

| Artifact                                              | Behavior                              |
| ----------------------------------------------------- | ------------------------------------- |
| Plugin tree `~/.gemini/config/plugins/coding-friend/` | Delete the whole directory            |
| `coding-friend-memory` MCP                            | `removeAgyMcpEntry` before deleting the dir |
| `config.json` `plugins["coding-friend"]`              | Delete the key; leave other keys      |
| `~/.claude/**`, `~/.codex/**`, `~/.omp/**`            | Untouched                             |
| Project `AGENTS.md` / `docs/`                         | Untouched (created by `cf init`)      |

Nothing to remove → `"Nothing to uninstall"`. Restart Antigravity after
uninstall.

---

## 8. Manual verify checklist

Run on the repo after `cf dev on .` + `cf install --agent agy` + restart:

1. Open `agy` in the repo (or the Antigravity IDE).
2. Type `/cf-help` — skill loads, lists slash `/cf-*` (not `$cf-*`).
3. `agy agents` (or the agents UI) — see `cf-explorer` and the other `cf-*`.
4. Ask it to read `.env` (`view_file` / `run_command cat .env`) — privacy-block
   **deny**.
5. `invoke_subagent` `cf-explorer` — subagent runs (model `flash`).

Synthetic (no TUI needed), cwd = the installed plugin:

```bash
agy plugin validate ~/.gemini/config/plugins/coding-friend

printf '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"/x/.env"}},"workspacePaths":["/x"]}' \
  | (cd ~/.gemini/config/plugins/coding-friend && CF_HOST=agy ./hooks/privacy-block.agy.sh)
# expect: {"decision":"deny", ...}

printf '{"invocationNum":1,"workspacePaths":["'"$PWD"'"]}' \
  | (cd ~/.gemini/config/plugins/coding-friend && CF_HOST=agy ./hooks/session-init.agy.sh)
# expect: injectSteps contains HOST: agy
```

After starting `agy` once:

```bash
grep hooks_manager ~/.gemini/antigravity-cli/cli.log | tail -1
# expect: loaded N named hooks, including coding-friend
```

### Verified (2026-08-25, local machine, `agy` 1.1.19, `cf dev` ON)

Automated (no TUI needed):

- `cf install --agent agy` (dev source) → 77 files; `agy plugin validate ~/.gemini/config/plugins/coding-friend` → skills 26, agents 12, mcpServers 1, hooks 1 (commands skipped — workflow stubs are not shipped).
- `agy agents` lists all 12 `cf-*` (`cf-explorer` … `cf-writer-deep`).
- Synthetic `privacy-block.agy.sh` `view_file` `/x/.env` → `{"decision":"deny",…}`.
- Synthetic `session-init.agy.sh` `invocationNum:1` → `injectSteps` contains `HOST: agy` + `MAIN_REPO_ROOT`.
- `hooks_manager.go`: `loaded 1 named hooks from 1 hooks.json file(s)` (group `coding-friend`).
- `agy plugin list` prints `No imported plugins.` — the plugin lives under `~/.gemini/config/plugins/` (config scan), not “imported” via `agy plugin install`. Agents still list.

Needs an interactive `agy` session (not run here): `/cf-help`, reading `.env` blocked in the TUI, `invoke_subagent` `cf-explorer`.

---

## 9. Known differences / gotchas

1. **Artifact, not a bridge** — omp spawns live `plugin/hooks/*.sh`; agy
   **copies** the artifact. Edit `plugin/` and forget `ud-plugin-local` + restart
   and the runtime stays stale.
2. **`cf dev on .` selects the source** — without dev mode, `resolveAgyPluginSource`
   may pick a marketplace clone / GitHub `main` (stale). The local inner loop
   always needs step 2 in §5.A.
3. **No `AGY_PLUGIN_ROOT`** — skill docs use the `<plugin-root>` token
   (defined in `rules/AGENTS.md`). `./hooks` in `hooks.json` is relative because
   cwd = plugin dir.
4. **stdin is camelCase** — `toolCall.args` (`AbsolutePath`, `TargetFile`,
   `CommandLine`, …), not Claude `tool_input`. `.agy.*` adapters scan every
   path-like string; they do not hardcode a single key.
5. **Privacy/scout fail open** — broken JSON stdin → allow. omp **fails
   closed**. The matcher does not catch every tool (e.g. `invoke_subagent`,
   `search_web` do not go through privacy/scout; the auto-approve matcher `*`
   still runs).
6. **`autoApprove` is opt-in** — same key as Claude; on AGY it is deterministic,
   default `ask`. `cf permission --agent agy` is a no-op: agy manages
   `/permissions` itself; CF auto-approve is only a config key.
7. **No task / agent tracker, no PreCompact memory-capture, no
   statusline** — see §3.
8. **`/cf-session`** → native `agy --continue` / IDE `/resume`. Does not parse
   the agy transcript.
9. **`--with-codex` ignored** on `/cf-review`.
10. **`rules/AGENTS.md` is gitignored at the repo root** — `.gitignore` has an
    `AGENTS.md` rule (AI Sync). Pre-commit runs `git add -f -- plugin-antigravity/rules/AGENTS.md`.
    The drift check will not see the file as untracked while the ignore still applies.
11. **One install location** — no project plugin `.agents/plugins/`. Does not
    call an `agy plugin install` subprocess.
12. **`agy -p` (print mode) does not run tools/hooks** — do not use `-p` to test
    privacy-block.
13. **`agy plugin list` = "No imported plugins"** when copied into
    `~/.gemini/config/plugins/` — that does not mean the plugin is unloaded; use
    `agy plugin validate` + `agy agents`.

---

## 10. Troubleshooting

| Symptom                                | Check                                                                       | Fix                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `agy CLI not found`                    | `command -v agy`                                                            | [antigravity.google](https://antigravity.google/)                          |
| Version unsupported                    | `agy --version`                                                             | Need ≥ 1.1.0 (`AGY_MIN_VERSION`)                                           |
| 0 skills/agents after install          | `ls ~/.gemini/config/plugins/coding-friend/{skills,agents}`                 | `cf dev on .` then `cf install --agy` again from the repo                  |
| Plugin not showing                     | `jq '.plugins["coding-friend"]' ~/.gemini/config/config.json`; `cf disable` | `cf enable --agy`; restart                                                 |
| Hook not running                       | `grep hooks_manager ~/.gemini/antigravity-cli/cli.log`                      | Restart `agy`; `agy plugin validate` the install path; `test -x` the `.agy.sh` files |
| Privacy does not block `.env`          | Matcher + fail-open; `privacyBlock: false`                                  | Synthetic pipe §8; local/global config                                     |
| Auto-approve does not allow            | `autoApprove` defaults off                                                  | Set `true` in `.coding-friend/config.json`                                 |
| MCP does not connect                   | `jq '.mcpServers' ~/.gemini/config/plugins/coding-friend/mcp_config.json`   | Must have `coding-friend-memory`; `npx -y coding-friend-cli mcp-serve`     |
| `cf update` skips agy                  | `isAgyPluginInstalled` (`plugin.json` in the plugin dir)                    | `cf install --agy` first                                                   |
| `ud-plugin-local` “agy update skipped” | `agy` / `cf` on PATH; plugin already installed                              | Install agy, `cf install --agy`, retry                                     |
| Hook edit not visible                  | agy reads the **copy**, not the repo                                        | `npm run ud-plugin-local` + restart                                        |
| Claude session detected as the wrong host | Probe `.omp/` / env (omp R4)                                             | `CF_HOST=agy` is set in `hooks.json`; Claude hooks.json does not set it    |
| `agy plugin validate` ≠ 0              | validate stdout                                                             | Files stay installed; treat as a warning, not a rollback                   |

Hook logs: `~/.gemini/antigravity-cli/cli.log` (and `~/.gemini/antigravity-cli/log/cli-*.log`)
— grep `hooks_manager`. `session-init.agy.sh` does not write
`${TMPDIR}/coding-friend-session-init.log` (that log belongs to Claude
`plugin/hooks/session-init.sh`).

```bash
# sanity
ls ~/.gemini/config/plugins/coding-friend/agents/cf-*.md | wc -l   # 12
ls ~/.gemini/config/plugins/coding-friend/hooks/*.agy.*            # 6 adapters
jq '.plugins["coding-friend"]' ~/.gemini/config/config.json
jq '.mcpServers["coding-friend-memory"]' \
  ~/.gemini/config/plugins/coding-friend/mcp_config.json
agy plugin validate ~/.gemini/config/plugins/coding-friend
```

---

## 11. References

- [plugin-dev.md](plugin-dev.md) — shared dev/release process
- [codex-dev.md](codex-dev.md) — Codex host (same artifact mode)
- [omp-dev.md](omp-dev.md) — omp host (bridge, opposite of artifact)
- [architecture.md](architecture.md) — plugin vs CLI overview
- Build: [`scripts/build-antigravity-plugin.js`](../scripts/build-antigravity-plugin.js),
  [`scripts/verify-agy-drift.js`](../scripts/verify-agy-drift.js),
  [`scripts/update-plugin-local.js`](../scripts/update-plugin-local.js)
- Host-aware CLI: [`cli/src/lib/host.ts`](../cli/src/lib/host.ts),
  [`cli/src/lib/agy-config.ts`](../cli/src/lib/agy-config.ts),
  [`cli/src/lib/paths.ts`](../cli/src/lib/paths.ts)
- Lifecycle: [`cli/src/commands/install.ts`](../cli/src/commands/install.ts),
  [`cli/src/commands/uninstall.ts`](../cli/src/commands/uninstall.ts),
  [`cli/src/commands/update.ts`](../cli/src/commands/update.ts)
- Artifact runtime: [`plugin-antigravity/hooks.json`](../plugin-antigravity/hooks.json)
- agy docs: [antigravity.google/docs](https://antigravity.google/docs)

Updated: 2026-08-25 · agy ≥ 1.1.0 · beta
