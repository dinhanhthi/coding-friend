# CF help index

Read this before answering anything the `SKILL.md` catalog does not cover. Then Read the listed source. Never invent flags, config keys, hook names, or CLI commands.

Paths are relative to `${PLUGIN_ROOT}` (git checkout: `plugin/`). Repo-only `docs/…` are **not** shipped in the plugin.

---

## Topic → source

| Ask about | Read first | Then |
| --------- | ---------- | ---- |
| Skill steps / flags | `skills/<name>/SKILL.md` | `skills/<name>/modes/*` |
| An agent | `agents/<name>.md` | — |
| Hooks / events | this file + `hooks/hooks.json` | `hooks/<file>` |
| Auto-approve / fewer prompts | this file (native prompt reduction) | `auto-approve.cjs` / `.codex.cjs` / `.agy.cjs` |
| Config keys | this file | `.coding-friend/config.json` + `~/.coding-friend/config.json` |
| CLI commands | this file | `cf <cmd> --help` |
| Memory / MCP | this file | — |
| Custom guides | this file | `.coding-friend/skills/<name>-custom/SKILL.md` |
| CLI required? | `docs/cli-requirements.md` (repo) or CLI tiers below | — |
| Architecture | `docs/architecture.md` (repo) | — |
| Local plugin / host dev | `docs/plugin-dev.md` (repo) | — |
| Tokens / troubleshooting | https://cf.dinhanhthi.com/docs/reference/ | — |

Resolve plugin files as `${PLUGIN_ROOT}/<path>`. If that misses (developing this repo), try `plugin/<path>` from the workspace root.

---

## Skill flags and arguments

Strip flags from `$ARGUMENTS` before treating the rest as the topic. Aliases in parentheses.

| Skill | Args / flags |
| ----- | ------------ |
| `$cf-advise` | `[decision]` · `--quick` (`--fast`) · `--save` → `docs/memory/decisions/` |
| `$cf-ask` | `[question]` |
| `$cf-plan` | `[task]` · `--fast` (`--quick`) inline unless `--auto` · `--hard` extra discovery + rollback · `--auto` autopilot · `--inline` (`--no-file`) chat only, not with `--auto` · `--gui` (`--human`) overview · `--model <alias>` pin cf-planner (Claude `opus`/`sonnet`/`haiku`/`fable`; Codex model name; AGY `inherit`/`flash`/`pro`) · `--add-tests` (`--tdd`) to implementers. Resume = `$cf-plan-resume`, not a flag. |
| `$cf-plan-resume` | `<plan>` path, entry file, or slug. Honors `auto: true`. |
| `$cf-later-do` | `[item]` from `docs/later/` → `$cf-fix` or `$cf-plan` |
| `$cf-review` | `[target]` · `--quick` / `--deep` · `--with-codex` (`--codex`) · `--claude` · `--gemini` · `--cursor` · `--grok` · `--out` (no agent flags). Config: `review.withCodex`, `review.agentTimeout` (300s). |
| `$cf-review-out` | `[label]` → `docs/reviews/` prompt + diff |
| `$cf-review-in` | `<label> [service]` |
| `$cf-commit` | `[hint]` |
| `$cf-design` | mode: `scan [path]` · `[description]` · `modify [what] -- [how]` · empty → ask |
| `$cf-ship` | `[hint]` · `--dry-run` |
| `$cf-fix` | `[bug]` · `--add-tests` (`--tdd`) |
| `$cf-optimize` | `[target]` |
| `$cf-scan` | `[description]` optional focus |
| `$cf-remember` | `[topic]` |
| `$cf-learn` | `[topic]` · config `learn` |
| `$cf-teach` | `[topic]` · default `docs/learn` (not `$cf-learn`) |
| `$cf-research` | `[topic]` → `docs/research/YYYY-MM-DD-<slug>/` |
| `$cf-session` | `[label]` Claude → `docs/sessions/` |
| `$cf-warm` | `--user <name>` · `--n-commits <N>` (defaults: git user, 10) |
| `$cf-checkpoint` | `[additional-prompt]` → `docs/context/checkpoints/` |
| `$cf-checkpoint-from` | `<slug> [message]` · `--recap` |
| `$cf-help` | `[question]` |
| `cf-tdd` | `--add-tests` (`--tdd`) · `--no-tdd` (default) · `--auto`. Config `tdd: true`. |
| `cf-sys-debug` | no flags |
| `cf-verification` | no flags |

Shared: `--add-tests` / `--tdd` on plan / fix / tdd / implementer.

---

## Agents

| Agent | Model | Dispatched by |
| ----- | ----- | ------------- |
| `cf-explorer` | haiku | `$cf-plan`, `$cf-fix`, `$cf-ask` |
| `cf-planner` | inherit | `$cf-plan` (`--model` pins this one) |
| `cf-implementer` | inherit | `$cf-plan`, `$cf-fix`, `cf-tdd` — writes code; `[CF-RESULT]`; no autopilot |
| `cf-reviewer` | inherit | `$cf-review`, `$cf-ship` |
| `cf-reviewer-plan` | sonnet | `cf-reviewer` |
| `cf-reviewer-security` | sonnet | `cf-reviewer` |
| `cf-reviewer-quality` | haiku | `cf-reviewer` |
| `cf-reviewer-tests` | haiku | `cf-reviewer` |
| `cf-reviewer-rules` | haiku | `cf-reviewer` (AGENTS.md MUST/SHOULD/ALWAYS/NEVER) |
| `cf-reviewer-reducer` | haiku | `cf-reviewer` |
| `cf-writer` | haiku | learn / remember / scan / fix / ask |
| `cf-writer-deep` | sonnet | `$cf-learn` |

Review depth: QUICK / STANDARD / DEEP (auto, or `--quick` / `--deep`).

---

## Hooks

Source: `hooks/hooks.json`. Adapters: `*.agy.*`; Codex uses a transformed manifest. Keys in parentheses.

| File | Event | Purpose |
| ---- | ----- | ------- |
| `session-init.sh` | SessionStart | Bootstrap + ignore. `CF_HOST=omp` on omp |
| `rules-reminder.sh` | UserPromptSubmit | Core rules (`devRulesReminder`) |
| `privacy-block.sh` | PreToolUse (Read/Write/Edit/Glob/Grep) | Block `.env` / keys (`privacyBlock`) |
| `scout-block.cjs` | PreToolUse (same) | `.coding-friend/ignore` (`scoutBlock`) |
| `auto-approve.cjs` | PreToolUse | Opt-in (`autoApprove`). Claude: rules → cwd → LLM only if `autoApproveLLM: true` (default false → unknown defers to native). Codex / agy: deterministic; unknowns ask |
| `session-log.sh` | Stop | Turn log |
| `task-tracker.sh` | TaskCreated / TaskCompleted | Statusline progress (Claude) |
| `agent-tracker.sh` | SubagentStart / SubagentStop | Statusline agent |
| `memory-capture.sh` | PreCompact | Episode (`memory.autoCapture`). Codex: `memory-capture.codex.sh` |
| `statusline.sh` | Statusline (Claude) | `cf statusline`, not `hooks.json` |

Env: `CF_AUTO_APPROVE_ENABLED=1`, `CF_AUTO_APPROVE_LLM_TIMEOUT` (45000), `CF_AUTO_APPROVE_CACHE_FILE`.

### Native prompt reduction (per host)

CF `autoApprove` is the plugin hook (first-call allowlist). Prefer native where it covers the case.

- **Claude:** native `auto` (default Pro/Max/Team); `acceptEdits` (edits + `mkdir` `touch` `rm` `rmdir` `mv` `cp` `sed` in cwd / `additionalDirectories`); sandboxed Bash via `/sandbox` or `sandbox.enabled` + `sandbox.autoAllowBashIfSandboxed` (default `true`); CF `autoApproveIgnore` (Claude-only always-ask prefixes; DENY still applies); CF `autoApproveLLM` default `false` (unknown → no hook decision, defer to native / `auto`; `true` restores Sonnet).
- **Codex:** `approval_policy` `untrusted` \| `on-request` \| `never` (**`on-failure` deprecated**). Preset: `sandbox_mode = "workspace-write"` + `on-request`. Experimental `rules` execpolicy: `.rules` in `~/.codex/rules/` or `<repo>/.codex/rules/` (`prefix_rule(...)`; `codex execpolicy check --rules <file> -- <command>`). Smart Approvals (default-on) may write `~/.codex/rules/default.rules`. `approvals_reviewer = "auto_review"` / **`--approve-for-me`** (0.147.0). CF `PermissionRequest` hook (`auto-approve.codex.cjs`) uses the current schema alongside native `rules` + Smart Approvals. `$cf-*` skills load from the plugin root (`plugin-codex/` or `~/.codex/plugins/cache/.../<ver>/`), not `~/.codex/prompts` (gone) or `~/.codex/skills`. `cf install --agent codex` registers marketplace + agents; it does not copy skills.
- **AGY:** IDE v2.5.0+ (2026-07-31) remembers approvals for the conversation (hook still needed first call / new chats); `always-proceed` (CLI v1.1.21 also auto-approves MCP in that mode); hooks observed in `agy` CLI (PreInvocation `session-init` / `rules-reminder`) — treat IDE / 2.0 desktop as hook-less until verified; build emits `disable-slash-command: true` when source has `user-invocable: false` (CLI ≥1.1.12).
- **omp:** `tools.approvalMode` `always-ask` \| `write` \| **`yolo` (default)**; `--auto-approve` / `--yolo` force yolo. Per-tool `tools.approval.<name>: allow|deny|prompt` (`policy: deny` wins). `bash` still prompts in yolo for hardcoded dangers (`rm -rf /`, fork bombs, remote-fetch-then-execute, `/etc/passwd`, shutdown); `bash.patterns` apply to `bash` only, not `eval`. Subagents always `yolo`.

---

## CLI (`cf`)

Optional. Scope flags on lifecycle commands: `--user` / `--global` / `--project` / `--local`. Host: `--agent claude|codex|omp|agy` or `--codex` / `--omp` / `--agy`.

| Command | What |
| ------- | ---- |
| `cf install` / `uninstall` / `enable` / `disable` / `update` | Lifecycle. `update` also `--cli` `--plugin` `--statusline`. `uninstall --remove-marketplace` |
| `cf init` | Per-project `docs/` + `.coding-friend/config.json` |
| `cf config` | Interactive config |
| `cf permission` | Host approval (`--all`, `--user`, `--agent`) |
| `cf statusline` | Claude statusline renderer |
| `cf memory` | `status` `search` `list` `rm` `init` `config` `rebuild` `mcp` `start-daemon` `stop-daemon` |
| `cf learn host [path]` | Learn-doc site (`-p/--port` 3333) |
| `cf learn push [path]` | Commit + push learn docs |
| `cf mcp` | Register Learn + Memory MCP (user scope) |
| `cf mcp-serve [memoryDir]` | Internal Memory MCP stdio |
| `cf status` | Install / config / memory |
| `cf clean` | Sweep generated `docs/` files |
| `cf session save` / `load` | Cross-machine Claude sessions (`-l/--label`) |
| `cf guide create <skill>` / `list` | Custom skill guides |
| `cf dev on\|off\|status\|sync\|restart [path]` | Local plugin source |

`cf host` is a hidden alias for `cf learn host`.

---

## Config

Layered: `~/.coding-friend/config.json` (global) + `<project>/.coding-friend/config.json` (local). Local overrides global at the **top-level key**. Nested objects (e.g. `learn`) are replaced whole if present locally.

| Key | Default | Meaning |
| --- | ------- | ------- |
| `language` | `en` | Plans / memory / research / ask (`en`, `vi`, or any name) |
| `docsDir` | `docs` | Plans / memory / research / reviews / later / checkpoints |
| `tdd` | `false` | Default TDD for `cf-tdd` / implementers |
| `devRulesReminder` | `true` | Rules-reminder hook |
| `autoApprove` | `false` | Auto-approve hook (Claude + Codex + agy) |
| `autoApproveLLM` | `false` | Claude only. `false` defers unknowns to native / `auto`; `true` restores Sonnet |
| `privacyBlock` | `true` | Privacy-block hook |
| `scoutBlock` | `true` | Scout-block hook |
| `autoApproveAllowExtra` | `[]` | Extra Bash prefixes to auto-approve |
| `autoApproveIgnore` | `[]` | Bash prefixes that always ask (Claude only) |
| `disableGUIPlan` | `true` | Hide `$cf-plan` overview unless `--gui` |
| `guiPlanFormat` | `html` | `html` or `md` |
| `learn.language` | falls back to `language` | `$cf-learn` language |
| `learn.outputDir` | `~/.coding-friend/learn` | `/`, `~/`, or project-relative |
| `learn.categories` | concepts/patterns/languages/tools/debugging | Folder + description |
| `learn.autoCommit` | `false` | Git-commit after learn docs |
| `learn.readmeIndex` | `false` | `false` / `true` / `"per-category"` |
| `review.withCodex` | `false` | Always add Codex on `$cf-review` |
| `review.agentTimeout` | `300` | Seconds per external reviewer |
| `memory.tier` | `auto` | `auto` / `full` / `lite` / `markdown` |
| `memory.embedding` | — | `{ provider: transformers\|ollama, model, ollamaUrl }` |
| `memory.autoCapture` | `false` | PreCompact episode capture |
| `memory.autoStart` | — | Start daemon when MCP connects |

Ignore list: `.coding-friend/ignore` (gitignore syntax) — scout-block skips these paths.

---

## Memory and MCP

Markdown in `{docsDir}/memory/` is the source of truth: `fact`→`features/`, `preference`→`conventions/` (syncs to AGENTS.md), `context`→`decisions/`, `episode`→`bugs/`, `procedure`→`infrastructure/`.

Search: SQLite FTS5 + vectors → MiniSearch daemon → grep.

MCP (when CLI + `cf mcp` / `cf init`): `memory_store` `memory_search` `memory_retrieve` `memory_list` `memory_update` `memory_delete`. Resources: `memory://index`, `memory://stats`. Without CLI: `grep -r '<query>' docs/memory/` and edit files. `cf memory rebuild` re-indexes.

`$cf-remember` = project knowledge for **AI**. `$cf-learn` = notes for the **human** (`~/.coding-friend/learn/`). `$cf-teach` = story of the last task.

---

## Docs layout (under `docsDir`, default `docs/`)

`memory/` ← ask/remember/scan/advise `--save` · `plans/<slug>/` ← `$cf-plan` · `context/` + `checkpoints/` · `research/` · `reviews/` · `later/` (`capture-later.sh` / `$cf-later-do`) · `sessions/` (Claude) · `warm/` · `learn/` (`$cf-teach`; `$cf-learn` default is `~/.coding-friend/learn/`)

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
- **Outside review:** `$cf-review-out` → external AI → `$cf-review-in` (or `$cf-review --gemini` etc.)
- **Resume:** `$cf-checkpoint-from <slug> …` or `$cf-plan-resume <plan>`
- **Catch up:** `$cf-warm` · **End of session:** `$cf-remember` + `$cf-learn` (+ `$cf-teach` for the story)

---

CLI tiers: **NONE** / **OPTIONAL** (memory MCP or grep) / **REQUIRED** (none today). Most knowledge skills and `memory-capture` / `session-init` / `statusline` are OPTIONAL.
