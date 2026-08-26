# CF help index

Read this file before answering any question the catalog in `SKILL.md` does not fully cover. Then Read the source file listed here. Never invent flags, config keys, hook names, or CLI commands.

Paths below are relative to the plugin root (`${PLUGIN_ROOT}`). When working in the coding-friend git checkout, the same files live under `plugin/`. Repo-only docs (`docs/…` at the repo root) are listed separately — they are **not** shipped inside the installed plugin.

---

## How CF works

Coding Friend is two packages:

| Package | npm name                          | What it is                                                                     |
| ------- | --------------------------------- | ------------------------------------------------------------------------------ |
| Plugin  | `coding-friend`                   | Skills, agents, hooks, lib scripts. Installed into a host. Fully usable alone. |
| CLI     | `coding-friend-cli` (binary `cf`) | Optional. Memory MCP, learn-host, `cf init` / install / config / statusline.   |

Skills never call the `cf` binary. They use MCP tools (`memory_search`, `memory_store`, …) when present, otherwise grep + file writes.

**Philosophy:** check skills first → optional TDD (`--add-tests` or `tdd: true`) → verify before claiming done → conventional commits with a clear "why".

**Hosts:** Claude Code (default, 100%), omp / oh-my-pi (beta), Codex CLI (beta, invoke `$cf-*`), Google Antigravity (beta, `cf install --agent agy`). Cursor and Grok Build run Claude or Codex underneath.

**Invocation:** slash `/cf-*` (Claude / omp / agy) or `$cf-*` (Codex). Auto-invoked skills load from their `description`. Agents run in a forked session. Distinguish _doing_ a skill now from _talking about_ a skill — `$cf-help` is the talk-about path.

---

## Topic → source

| Ask about               | Read first                                                 | Then                                                                    |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| A skill's steps / flags | `skills/<name>/SKILL.md`                                   | `skills/<name>/modes/*` if present                                      |
| An agent                | `agents/<name>.md`                                         | —                                                                       |
| Hooks / events          | this file + `hooks/hooks.json`                             | `hooks/<file>`                                                          |
| Config keys             | this file                                                  | project `.coding-friend/config.json` and `~/.coding-friend/config.json` |
| CLI commands            | this file                                                  | `cf <cmd> --help` if the CLI is installed                               |
| Memory / MCP            | this file                                                  | —                                                                       |
| Custom guides           | this file                                                  | `.coding-friend/skills/<name>-custom/SKILL.md`                          |
| CLI required?           | `docs/cli-requirements.md` (repo) or the CLI section below | —                                                                       |
| Architecture            | `docs/architecture.md` (repo)                              | —                                                                       |
| Local plugin / host dev | `docs/plugin-dev.md` (repo)                                | Claude, Codex, omp, Antigravity                                         |
| Public overview         | https://cf.dinhanhthi.com/                                 | —                                                                       |
| Tokens / context tiers  | https://cf.dinhanhthi.com/docs/reference/context-usage/    | —                                                                       |
| Troubleshooting         | https://cf.dinhanhthi.com/docs/reference/troubleshooting/  | —                                                                       |

Resolve plugin files as `${PLUGIN_ROOT}/<path>`. If that miss (developing this repo), try `plugin/<path>` from the workspace root.

---

## Skill flags and arguments

Strip flags from `$ARGUMENTS` before treating the rest as the topic. Aliases are listed in parentheses.

| Skill                 | Args / flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$cf-advise`          | `[decision]` · `--quick` (`--fast`) fewer questions · `--save` write to `docs/memory/decisions/`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `$cf-ask`             | `[question]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `$cf-plan`            | `[task]` · `--fast` (`--quick`) inline, no file unless `--auto` · `--hard` extra discovery + rollback · `--auto` autopilot after approval · `--inline` (`--no-file`) chat only, incompatible with `--auto` · `--gui` (`--human`) human overview doc · `--model <alias>` pin cf-planner (`opus`/`sonnet`/`haiku`/`fable` on Claude; Codex model name on Codex; `inherit`/`flash`/`pro` on Antigravity) · `--add-tests` (`--tdd`) forwarded to every implementer. Resume is **not** a flag — use `$cf-plan-resume`. |
| `$cf-plan-resume`     | `<plan>` folder path, entry file, or bare slug. Honors `auto: true` in the plan frontmatter.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `$cf-later-do`        | `[item]` pick a `docs/later/` file; routes to `$cf-fix` or `$cf-plan`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `$cf-review`          | `[target]` · `--quick` / `--deep` (else auto from diff size) · `--with-codex` (`--codex`) · `--claude` · `--gemini` · `--cursor` · `--grok` · `--out` (exports a review-out prompt; cannot combine with agent flags). Config: `review.withCodex`, `review.agentTimeout` (default 300s).                                                                                                                                                                                                                           |
| `$cf-review-out`      | `[label]` writes `docs/reviews/` prompt + diff                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `$cf-review-in`       | `<label> [service]` reads that result file                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `$cf-commit`          | `[hint]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `$cf-design`          | first word is the mode: `scan [path]` · `[description]` · `modify [what] -- [how]` · empty → ask                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `$cf-ship`            | `[hint]` · `--dry-run` simulate, no commit/push/PR                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `$cf-fix`             | `[bug]` · `--add-tests` (`--tdd`) write a failing test first if none exists                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `$cf-optimize`        | `[target]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `$cf-scan`            | `[description]` optional focus (token-heavy)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `$cf-remember`        | `[topic]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `$cf-learn`           | `[topic]` language / output / categories from config `learn`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `$cf-teach`           | `[topic]` narrative; default output `docs/learn` (not the same as `$cf-learn`)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `$cf-research`        | `[topic]` → `docs/research/YYYY-MM-DD-<slug>/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `$cf-session`         | `[label]` Claude-only save to `docs/sessions/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `$cf-warm`            | `--user <name>` (default `git config user.name`) · `--n-commits <N>` (default 10)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `$cf-checkpoint`      | `[additional-prompt]` create or update `docs/context/checkpoints/`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `$cf-checkpoint-from` | `<slug> [message]` · `--recap` print restored-context summary                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `$cf-help`            | `[question]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `cf-tdd`              | `--add-tests` (`--tdd`) TDD mode · `--no-tdd` direct (default) · `--auto` review + fix + commit after implementation. Config `tdd: true` enables TDD by default.                                                                                                                                                                                                                                                                                                                                                  |
| `cf-sys-debug`        | no flags — 4-phase debug                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cf-verification`     | no flags — evidence gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Shared: `--add-tests` / `--tdd` on plan / fix / tdd / implementer.

---

## Agents

| Agent                  | Model   | Does                                                                                                      | Dispatched by                        |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `cf-explorer`          | haiku   | Maps the repo, writes context files                                                                       | `$cf-plan`, `$cf-fix`, `$cf-ask`     |
| `cf-planner`           | inherit | Approaches + phased tasks                                                                                 | `$cf-plan` (`--model` pins this one) |
| `cf-implementer`       | inherit | Writes code; TDD with `--add-tests`. Returns `[CF-RESULT: success\|failure]`. Does **not** own autopilot. | `$cf-plan`, `$cf-fix`, `cf-tdd`      |
| `cf-reviewer`          | inherit | Orchestrates 5 specialists + reducer                                                                      | `$cf-review`, `$cf-ship`             |
| `cf-reviewer-plan`     | sonnet  | Diff vs plan                                                                                              | `cf-reviewer`                        |
| `cf-reviewer-security` | sonnet  | Security                                                                                                  | `cf-reviewer`                        |
| `cf-reviewer-quality`  | haiku   | Quality + slop                                                                                            | `cf-reviewer`                        |
| `cf-reviewer-tests`    | haiku   | Coverage                                                                                                  | `cf-reviewer`                        |
| `cf-reviewer-rules`    | haiku   | AGENTS.md MUST/SHOULD/ALWAYS/NEVER                                                                        | `cf-reviewer`                        |
| `cf-reviewer-reducer`  | haiku   | Dedup + rank                                                                                              | `cf-reviewer`                        |
| `cf-writer`            | haiku   | Straightforward markdown                                                                                  | learn / remember / scan / fix / ask  |
| `cf-writer-deep`       | sonnet  | Nuanced technical docs                                                                                    | `$cf-learn`                          |

Review depth is QUICK / STANDARD / DEEP (auto from change size, or `--quick` / `--deep`).

---

## Hooks

Source of truth: `hooks/hooks.json`. Host adapters: `*.agy.*` (Antigravity), Codex uses a transformed `hooks.json`. Toggle via config keys in parentheses.

| File                | Event                                  | Purpose                                                                                                                      |
| ------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `session-init.sh`   | SessionStart                           | Bootstrap paths, `bootstrap.md`, ignore. `CF_HOST=omp` on omp.                                                               |
| `rules-reminder.sh` | UserPromptSubmit                       | Inject core rules (`devRulesReminder`)                                                                                       |
| `privacy-block.sh`  | PreToolUse (Read/Write/Edit/Glob/Grep) | Block `.env`, keys, credentials (`privacyBlock`)                                                                             |
| `scout-block.cjs`   | PreToolUse (same)                      | Block `.coding-friend/ignore` paths (`scoutBlock`)                                                                           |
| `auto-approve.cjs`  | PreToolUse                             | Opt-in approve safe calls (`autoApprove`). Claude: rules → working-dir → LLM. Codex / agy: deterministic only; unknowns ask. |
| `session-log.sh`    | Stop                                   | Turn log for memory capture                                                                                                  |
| `task-tracker.sh`   | TaskCreated / TaskCompleted            | Statusline progress (Claude)                                                                                                 |
| `agent-tracker.sh`  | SubagentStart / SubagentStop           | Statusline active agent                                                                                                      |
| `memory-capture.sh` | PreCompact                             | Episode capture (`memory.autoCapture`). Skips silently if MCP is down. Codex: `memory-capture.codex.sh`.                     |
| `statusline.sh`     | Statusline (Claude)                    | Installed by `cf statusline`, not via `hooks.json`                                                                           |

Env overrides for auto-approve: `CF_AUTO_APPROVE_ENABLED=1`, `CF_AUTO_APPROVE_LLM_TIMEOUT` (default 45000), `CF_AUTO_APPROVE_CACHE_FILE`.

---

## CLI (`cf`)

Optional. Scope flags on lifecycle commands: `--user` / `--global` / `--project` / `--local`. Host: `--agent claude|codex|omp|agy` or `--codex` / `--omp` / `--agy`.

| Command                                                      | What                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `cf install` / `uninstall` / `enable` / `disable` / `update` | Plugin lifecycle. `update` also `--cli` `--plugin` `--statusline`. `uninstall --remove-marketplace`.                                   |
| `cf init`                                                    | Per-project `docs/`, `.coding-friend/config.json`                                                                                      |
| `cf config`                                                  | Interactive config (docsDir, language, tdd, autoApprove, learn, review, memory, …)                                                     |
| `cf permission`                                              | Host permission / approval (`--all`, `--user`, `--agent`)                                                                              |
| `cf statusline`                                              | Install Claude statusline renderer                                                                                                     |
| `cf memory`                                                  | `status` `search <q>` `list` [`--projects`] `rm` `--project-id` / `--all` `init` `config` `rebuild` `mcp` `start-daemon` `stop-daemon` |
| `cf learn host [path]`                                       | Learn-doc site, `-p/--port` default 3333                                                                                               |
| `cf learn push [path]`                                       | Commit + push learn docs                                                                                                               |
| `cf mcp`                                                     | Register Learn + Memory MCP at user scope                                                                                              |
| `cf mcp-serve [memoryDir]`                                   | Internal — Memory MCP stdio                                                                                                            |
| `cf status`                                                  | Install / config / memory status                                                                                                       |
| `cf clean`                                                   | Sweep generated files under `docs/` (completed plans, etc.)                                                                            |
| `cf session save` / `load`                                   | Cross-machine Claude sessions (`-l/--label`)                                                                                           |
| `cf guide create <skill>` / `list`                           | Custom skill guides                                                                                                                    |
| `cf dev on\|off\|status\|sync\|restart [path]`               | Local plugin source while developing CF                                                                                                |

`cf host` is a hidden alias for `cf learn host`.

---

## Config

Layered: `~/.coding-friend/config.json` (global) + `<project>/.coding-friend/config.json` (local). Local overrides global at the **top-level key**. Nested objects (e.g. `learn`) are replaced whole if present locally.

| Key                     | Default                                     | Meaning                                                                              |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `language`              | `en`                                        | Language for plans, memory, research, ask (`en`, `vi`, or any name)                  |
| `docsDir`               | `docs`                                      | Plans / memory / research / reviews / later / checkpoints (not default learn output) |
| `tdd`                   | `false`                                     | Default TDD mode for `cf-tdd` / implementers                                         |
| `devRulesReminder`      | `true`                                      | Rules-reminder hook                                                                  |
| `autoApprove`           | `false`                                     | Auto-approve hook (Claude + Codex + agy)                                             |
| `privacyBlock`          | `true`                                      | Privacy-block hook                                                                   |
| `scoutBlock`            | `true`                                      | Scout-block hook                                                                     |
| `autoApproveAllowExtra` | `[]`                                        | Extra Bash prefixes to auto-approve                                                  |
| `autoApproveIgnore`     | `[]`                                        | Bash prefixes that always ask (Claude only)                                          |
| `disableGUIPlan`        | `true`                                      | Hide `$cf-plan` human overview unless `--gui`                                        |
| `guiPlanFormat`         | `html`                                      | `html` or `md`                                                                       |
| `learn.language`        | falls back to `language`                    | `$cf-learn` language                                                                 |
| `learn.outputDir`       | `~/.coding-friend/learn`                    | Learn notes. `/`, `~/`, or project-relative                                          |
| `learn.categories`      | concepts/patterns/languages/tools/debugging | Folder + description                                                                 |
| `learn.autoCommit`      | `false`                                     | Git-commit after writing learn docs                                                  |
| `learn.readmeIndex`     | `false`                                     | `false` / `true` / `"per-category"`                                                  |
| `review.withCodex`      | `false`                                     | Always add a Codex second opinion on `$cf-review`                                    |
| `review.agentTimeout`   | `300`                                       | Seconds per external reviewer                                                        |
| `memory.tier`           | `auto`                                      | `auto` / `full` / `lite` / `markdown`                                                |
| `memory.embedding`      | —                                           | `{ provider: transformers\|ollama, model, ollamaUrl }`                               |
| `memory.autoCapture`    | `false`                                     | PreCompact episode capture                                                           |
| `memory.autoStart`      | —                                           | Start memory daemon when MCP connects                                                |

Ignore list: `.coding-friend/ignore` (gitignore syntax) — scout-block skips these paths.

---

## Memory and MCP

Markdown in `{docsDir}/memory/` is the source of truth.

| Type         | Folder            | Use                                  |
| ------------ | ----------------- | ------------------------------------ |
| `fact`       | `features/`       | Features, facts                      |
| `preference` | `conventions/`    | Conventions (also sync to AGENTS.md) |
| `context`    | `decisions/`      | Architecture decisions               |
| `episode`    | `bugs/`           | Bugs / debug sessions                |
| `procedure`  | `infrastructure/` | Infra procedures                     |

Search tiers (first available wins): SQLite FTS5 + vectors → MiniSearch daemon → grep.

MCP tools (when `coding-friend-cli` is installed and `cf mcp` / `cf init` registered them): `memory_store`, `memory_search`, `memory_retrieve`, `memory_list`, `memory_update`, `memory_delete`. Resources: `memory://index`, `memory://stats`.

Without CLI: `grep -r '<query>' docs/memory/` and edit the markdown files directly. `cf memory rebuild` re-indexes later.

`$cf-remember` = project knowledge for **AI** recall. `$cf-learn` = educational notes for the **human** (default `~/.coding-friend/learn/`). `$cf-teach` = conversational story of the last task.

---

## Docs layout (under `docsDir`, default `docs/`)

| Path            | Written by                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| `memory/`       | `$cf-ask`, `$cf-remember`, `$cf-scan`, `$cf-advise --save`                                   |
| `plans/<slug>/` | `$cf-plan` (not `--inline` / lone `--fast`)                                                  |
| `context/`      | plan context JSON + `checkpoints/`                                                           |
| `research/`     | `$cf-research`                                                                               |
| `reviews/`      | `$cf-review-out`, `$cf-review --out`                                                         |
| `later/`        | `capture-later.sh` from plan/fix/debug/optimize/ship/implementer; resolved by `$cf-later-do` |
| `sessions/`     | `$cf-session` (Claude)                                                                       |
| `warm/`         | `$cf-warm`                                                                                   |
| `learn/`        | `$cf-teach` default (project). `$cf-learn` default is global `~/.coding-friend/learn/`       |

---

## Custom guides

- Local (wins): `.coding-friend/skills/<skill-name>-custom/SKILL.md`
- Global: `~/.coding-friend/skills/<skill-name>-custom/SKILL.md`
- Scaffold: `cf guide create <skill>` · list: `cf guide list`
- Sections (all optional): `## Before` · `## Rules` · `## After`
- Not merged — local file present ⇒ global ignored. Reloads on next skill run.

---

## Common workflows

- **Decide then build:** `$cf-advise` → `$cf-plan` → implement (`cf-tdd`) → `$cf-review` → `$cf-commit` → `$cf-ship`
- **Bug:** `$cf-fix` → (hard) `cf-sys-debug` → `$cf-commit`
- **Outside review:** `$cf-review-out` → external AI → `$cf-review-in` (or `$cf-review --gemini` etc. when the CLI is installed)
- **Resume work:** `$cf-checkpoint-from <slug> …` or `$cf-plan-resume <plan>`
- **Catch up:** `$cf-warm`
- **End of session:** `$cf-remember` + `$cf-learn` (and `$cf-teach` if you want the story)

---

## CLI requirement tiers

- **NONE** — zero CLI involvement
- **OPTIONAL** — memory MCP when present; grep + files otherwise
- **REQUIRED** — none today

Most knowledge skills are OPTIONAL. Hooks: `memory-capture` and `session-init` / `statusline` are OPTIONAL; the rest are NONE.
