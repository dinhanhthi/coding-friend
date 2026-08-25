# Làm việc với agy (local dev)

> Tài liệu tham khảo độc lập cho việc phát triển/​test Coding Friend trên
> **Google Antigravity** (`agy`). agy là host thứ tư (beta), **artifact mode** —
> khác omp ([omp-dev.md](omp-dev.md), **bridge**, không có `plugin-omp/`).
> Host Codex (cùng kiểu artifact): [codex-dev.md](codex-dev.md). Quy trình dev
> chung: [plugin-dev.md](plugin-dev.md).

**Cập nhật:** 2026-08-25 · agy CLI ≥ 1.1.0 · labelled **beta**.

---

## 1. Overview — artifact mode

agy **không** inherit Claude marketplace như omp, cũng không có TypeScript
shim. Canonical source vẫn là `plugin/` (Claude-native). Generator
[`scripts/build-antigravity-plugin.js`](../scripts/build-antigravity-plugin.js)
tạo artifact `plugin-antigravity/` (đã commit). `cf install --agent agy` copy
cây đó vào một chỗ duy nhất:

`~/.gemini/config/plugins/coding-friend/`

(`cf` tôn trọng `ANTIGRAVITY_HOME`, mặc định `~/.gemini`.)

| Lớp        | Cách agy nhận                                                                                   | Không làm gì                                     |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Skills     | Copy `plugin-antigravity/skills/<name>/SKILL.md` → slash `/cf-*`                                | Không inherit `~/.claude`                        |
| Agents     | Copy 12 file `agents/cf-*.md` (frontmatter `model`: `flash` / `pro` / `inherit`)                | Không deploy `~/.gemini/config/agents/`          |
| Hooks      | `hooks.json` **ở root plugin** (không phải `hooks/hooks.json`); cwd = plugin dir; `CF_HOST=agy` | Không port bash → TS; không có `AGY_PLUGIN_ROOT` |
| MCP        | Ghi `mcp_config.json` trong plugin (plugin-scoped) — **không** có `agy mcp add`                 | —                                                |
| Rules      | `rules/AGENTS.md` always-on (bootstrap Claude `context/bootstrap.md` được render vào đây)       | Không ship `context/`                            |
| Statusline | Bỏ qua — agy không có statusline Claude                                                         | `cf statusline` / `cf update --statusline`       |

**Không sửa `plugin-antigravity/` bằng tay** — luôn sửa `plugin/` rồi
`npm run build:agy` (hoặc `npm run ud-plugin-local`). Guard:
`npm run lint:agy`, `npm run verify:agy-drift`. Pre-commit rebuild +
`git add` artifact khi source `plugin/` đổi.

Enable state: `~/.gemini/config/config.json` →
`plugins["coding-friend"].enabled` (`cf enable --agy` / `cf disable --agy`).
Không có user / project / local scope — `--project` / `--local` bị bỏ qua.

---

## 2. Kiến trúc: source → artifact → runtime

```
plugin/                      ← source DUY NHẤT (Claude-native)
   │  npm run build:agy      (scripts/build-antigravity-plugin.js)
   ▼
plugin-antigravity/          ← artifact GENERATE (đã commit)
   │  cf install --agent agy  (copy tree; alias: --agy)
   ▼
~/.gemini/config/plugins/coding-friend/   ← runtime (IDE + agy CLI)
```

`cf install` / `cf update --agent agy` resolve source theo thứ tự:

1. **dev** — `cf dev on <repo>` đã ghi `~/.coding-friend/dev-state.json` →
   `<localPath>/plugin-antigravity/`
2. **marketplace** — clone Claude marketplace chứa `plugin-antigravity/`
3. **clone** — `git clone --depth 1` repo GitHub vào
   `~/.coding-friend/agy-src/plugin-antigravity/`

Local-dev **phải** `cf dev on .` trước install/update; nếu không, bước 2/3
có thể deploy artifact stale từ `main`. `cf dev` vẫn là Claude-only cho cache
`~/.claude` — với agy nó chỉ đóng vai trò **chọn source**.

Hook `command` chạy `sh -c` với cwd = thư mục chứa `hooks.json` (plugin
dir). Script tự suy `PLUGIN_ROOT` từ `$(dirname "$0")/..`, rồi `cd` sang
`workspacePaths[0]`. stdin/stdout là JSON **camelCase**.

---

## 3. Hook map — 5 event AGY

agy chỉ có năm event. Coding Friend dùng ba; hai còn lại để trống.

| Event AGY                                                                                                                                           | Script (trong `plugin-antigravity/hooks/`)                                                                                                            | Hook Claude tương ứng     | Ghi chú                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PreInvocation` (`invocationNum` 0 hoặc 1)                                                                                                          | [`session-init.agy.sh`](../plugin-antigravity/hooks/session-init.agy.sh)                                                                              | SessionStart              | `injectSteps.ephemeralMessage` header `HOST: agy` (cap 12 000 chars). Không inject `bootstrap.md`.                     |
| `PreInvocation` (`invocationNum` 4, 8, 12, …)                                                                                                       | [`rules-reminder.agy.sh`](../plugin-antigravity/hooks/rules-reminder.agy.sh)                                                                          | UserPromptSubmit          | Cùng text reminder; lần 0/1 để trống để không đụng session-init.                                                       |
| `PreToolUse` matcher `view_file\|grep_search\|find_by_name\|list_dir\|write_to_file\|replace_file_content\|multi_replace_file_content\|run_command` | [`privacy-block.agy.sh`](../plugin-antigravity/hooks/privacy-block.agy.sh) → [`scout-block.agy.cjs`](../plugin-antigravity/hooks/scout-block.agy.cjs) | PreToolUse                | stdout `{decision: allow\|deny}`. JSON lỗi → **fail open**. Tắt: `privacyBlock` / `scoutBlock: false`.                 |
| `PreToolUse` matcher `*`                                                                                                                            | [`auto-approve.agy.cjs`](../plugin-antigravity/hooks/auto-approve.agy.cjs)                                                                            | PreToolUse (auto-approve) | Opt-in `autoApprove: true` (cùng key với Claude). Default / thiếu key → `{decision: "ask"}`. Deterministic, không LLM. |
| `Stop`                                                                                                                                              | [`session-log.agy.sh`](../plugin-antigravity/hooks/session-log.agy.sh)                                                                                | Stop                      | Append `/tmp/cf-session-${conversationId}.jsonl`; stdout `{decision:""}`.                                              |
| `PostToolUse`                                                                                                                                       | —                                                                                                                                                     | —                         | Không đăng ký.                                                                                                         |
| `PostInvocation`                                                                                                                                    | —                                                                                                                                                     | —                         | Không đăng ký.                                                                                                         |

Module dùng chung (có trong `plugin-antigravity/hooks/` nhưng **không**
wire vào `hooks.json`): [`auto-approve.cjs`](../plugin-antigravity/hooks/auto-approve.cjs)
(`require` từ `auto-approve.agy.cjs`), [`scout-block.cjs`](../plugin-antigravity/hooks/scout-block.cjs)
(`require` từ `scout-block.agy.cjs`).

### Không có tương đương AGY

Không có event AGY cho các hook Claude sau — generator **cố ý loại** chúng
khỏi artifact (`AGY_EXCLUDED_SOURCE_PATHS`):

| Claude hook                  | Script source                    | Lý do                                                                                                                                  |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TaskCreated / TaskCompleted  | `plugin/hooks/task-tracker.sh`   | Không có event Task\*                                                                                                                  |
| SubagentStart / SubagentStop | `plugin/hooks/agent-tracker.sh`  | Không có event Subagent\*                                                                                                              |
| PreCompact                   | `plugin/hooks/memory-capture.sh` | Không có compact event → không auto-capture memory lúc compact. `session-log.agy.sh` vẫn ghi jsonl nhưng không có consumer PreCompact. |
| Statusline                   | `plugin/hooks/statusline.sh`     | agy không có statusline Claude. `cf statusline` / `cf update --statusline --agent agy` skip.                                           |

---

## 4. Skills / agents / MCP / rules

| Thành phần      | Artifact                                         | Runtime                                                                                                                                                                            |
| --------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills** (26) | `plugin-antigravity/skills/<name>/SKILL.md`      | Slash `/cf-*` (agy coi skill = slash command). Placeholder `{{cf:slash cf-x}}` → `/cf-x`.                                                                                          |
| **Agents** (12) | `plugin-antigravity/agents/cf-*.md`              | `invoke_subagent` với `name` trong frontmatter. `model`: haiku→`flash`, sonnet/opus→`pro`. Không khai `tools` (inherit all).                                                       |
| **MCP**         | `plugin-antigravity/mcp_config.json`             | Sau `cf install`/`cf update`: `mcpServers["coding-friend-memory"]` = `{ command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] }`. Plugin-scoped — không có `agy mcp add`. |
| **Rules**       | `plugin-antigravity/rules/AGENTS.md`             | Always-on. Gồm `HOST: agy` + note `<plugin-root>` + bootstrap đã render.                                                                                                           |
| **Manifest**    | `plugin.json` (`name`, `version`, `description`) | Discovery: thư mục plugin = `coding-friend`.                                                                                                                                       |

Agents (đúng 12 file): `cf-explorer`, `cf-implementer`, `cf-planner`,
`cf-reviewer`, `cf-reviewer-plan`, `cf-reviewer-quality`,
`cf-reviewer-reducer`, `cf-reviewer-rules`, `cf-reviewer-security`,
`cf-reviewer-tests`, `cf-writer`, `cf-writer-deep`.

Skills slash: `/cf-advise`, `/cf-ask`, `/cf-plan`, `/cf-plan-resume`,
`/cf-later-do`, `/cf-checkpoint`, `/cf-checkpoint-from`, `/cf-review`,
`/cf-review-out`, `/cf-review-in`, `/cf-commit`, `/cf-design`, `/cf-ship`,
`/cf-fix`, `/cf-optimize`, `/cf-scan`, `/cf-remember`, `/cf-learn`,
`/cf-teach`, `/cf-research`, `/cf-session`, `/cf-warm`, `/cf-help`.
Auto-invoke (không slash): `cf-tdd`, `cf-sys-debug`, `cf-verification`.

`/cf-session` trên agy **không** copy transcript — trỏ native `/resume`
(IDE) hoặc `agy --continue`. `--with-codex` / `review.withCodex` bị ignore.

---

## 5. Quy trình local dev cho agy

> `cf dev on/off/sync` **chỉ hỗ trợ Claude cache**
> ([`plugin-dev.md`](plugin-dev.md)). agy đọc bản **copy** trong
> `~/.gemini/config/plugins/coding-friend/`, không đọc thẳng repo. Bốn host
> độc lập (`~/.claude` / `~/.codex` / `~/.omp` / `~/.gemini`); `cf` CLI dùng
> chung.

### A. Setup một lần

```bash
cd cli && npm run build && cd ..   # 1. CLI local (cf đã npm link)
cf dev on .                        # 2. source = ./plugin-antigravity/
npm run build:agy                  # 3. generate artifact (cũng chạy trong ud-plugin-local)
# agy CLI: https://antigravity.google/  →  agy --version  ≥ 1.1.0
cf install --agent agy             # 4. copy + MCP + enabled: true
#    alias: cf install --agy
agy plugin validate ~/.gemini/config/plugins/coding-friend
cf init --agent agy                # 5. wizard: docs/language/gitignore/learn/autoApprove/privacyBlock + AGENTS.md
# restart Antigravity / session `agy` mới
```

`agy plugin validate` kỳ vọng skills / agents / mcpServers / hooks đều
processed. Warning từ validate không rollback file đã copy.

> Sandbox: `ANTIGRAVITY_HOME=/tmp/cf-agy-dev` cho **mọi** lệnh `cf` trong
> phiên (giống `CODEX_HOME` / `OMP_HOME`). `agy` CLI tự đọc
> `~/.gemini` — prefix env chỉ đổi path mà `cf` ghi.

### B. Inner loop (sau mỗi lần sửa)

```bash
npm run ud-plugin-local
```

Script làm: `build:codex` → `build:agy` → `cf dev sync` (Claude) →
`cf update --agent omp --plugin` → `cf update --agent agy --plugin` → xóa
cache Codex. Bước agy **skip** nếu `agy`/`cf` không có trên PATH.

Rồi **restart Antigravity** (hoặc session `agy` mới) — copy trong
`~/.gemini/config/plugins/coding-friend/` mới được load.

- Sửa `cli/src/**` → `cd cli && npm run build` (hoặc `npm run watch`).
- Sửa `plugin/**` → `ud-plugin-local` + restart. Đừng sửa
  `plugin-antigravity/` tay.
- Sửa chỉ hook `.agy.*` trong `plugin/hooks/` → vẫn phải `build:agy` rồi
  copy (agy không spawn file repo).

### C. Tắt / dọn dẹp

```bash
cf disable --agent agy     # plugins["coding-friend"].enabled = false — file còn
cf enable --agent agy      # enabled = true
cf uninstall --agent agy   # xóa plugin dir + MCP entry + key config.json
```

Claude / Codex / omp **không** bị đụng. Không có marketplace agy để
`remove`.

---

## 6. File `cf install --agent agy` ghi

| Path                                                        | Nội dung                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.gemini/config/plugins/coding-friend/`                   | Cây artifact: `plugin.json`, `hooks.json`, `mcp_config.json`, `skills/`, `agents/`, `hooks/`, `lib/`, `rules/AGENTS.md`, `README.md`, `CHANGELOG.md` |
| `…/installed_version.json`                                  | `{ version, installedAt, source }` do CLI ghi thêm sau copy                                                                                          |
| `…/mcp_config.json` → `mcpServers["coding-friend-memory"]`  | `{ command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] }`                                                                                 |
| `~/.gemini/config/config.json` → `plugins["coding-friend"]` | `{ enabled: true }`                                                                                                                                  |

`cf disable --agent agy` **không** xóa các file trên; chỉ `enabled: false`.

`cf update` **không** `--agent` → update mọi host đang cài (Claude → Codex
→ omp → agy). `--agent agy` / `--agy` = chỉ agy. `--plugin` redeploy artifact
mà không đụng CLI npm.

`cf init --agent agy` (per-project): tạo `docs/{plans,memory,research,sessions,reviews,warm}/`,
`.coding-friend/config.json` nếu thiếu, `AGENTS.md` (slash `/cf-*`) nếu chưa
có. Không ghi `.agy/` project dir.

---

## 7. Uninstall matrix

`cf uninstall --agent agy`
([`cli/src/commands/uninstall.ts`](../cli/src/commands/uninstall.ts)):

| Artifact                                              | Hành vi                               |
| ----------------------------------------------------- | ------------------------------------- |
| Plugin tree `~/.gemini/config/plugins/coding-friend/` | Xóa cả thư mục                        |
| `coding-friend-memory` MCP                            | `removeAgyMcpEntry` trước khi xóa dir |
| `config.json` `plugins["coding-friend"]`              | Xóa key; key khác giữ                 |
| `~/.claude/**`, `~/.codex/**`, `~/.omp/**`            | Không đụng                            |
| `AGENTS.md` / `docs/` trong project                   | Không đụng (`cf init` đã tạo)         |

Không có gì để gỡ → `"Nothing to uninstall"`. Restart Antigravity sau
uninstall.

---

## 8. Checklist verify thủ công

Chạy trên repo sau `cf dev on .` + `cf install --agent agy` + restart:

1. Mở `agy` trong repo (hoặc Antigravity IDE).
2. Gõ `/cf-help` — skill load, liệt kê slash `/cf-*` (không `$cf-*`).
3. `agy agents` (hoặc UI agents) — thấy `cf-explorer` và các `cf-*`.
4. Yêu cầu đọc `.env` (`view_file` / `run_command cat .env`) — privacy-block
   **deny**.
5. `invoke_subagent` `cf-explorer` — subagent chạy (model `flash`).

Synthetic (không cần TUI), cwd = plugin đã install:

```bash
agy plugin validate ~/.gemini/config/plugins/coding-friend

printf '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"/x/.env"}},"workspacePaths":["/x"]}' \
  | (cd ~/.gemini/config/plugins/coding-friend && CF_HOST=agy ./hooks/privacy-block.agy.sh)
# kỳ vọng: {"decision":"deny", ...}

printf '{"invocationNum":1,"workspacePaths":["'"$PWD"'"]}' \
  | (cd ~/.gemini/config/plugins/coding-friend && CF_HOST=agy ./hooks/session-init.agy.sh)
# kỳ vọng: injectSteps chứa HOST: agy
```

Sau khi start `agy` một lần:

```bash
grep hooks_manager ~/.gemini/antigravity-cli/cli.log | tail -1
# kỳ vọng: loaded N named hooks, có coding-friend
```

### Đã verify (2026-08-25, máy local, `agy` 1.1.19, `cf dev` ON)

Tự động (không cần TUI):

- `cf install --agent agy` (dev source) → 77 files; `agy plugin validate ~/.gemini/config/plugins/coding-friend` → skills 26, agents 12, mcpServers 1, hooks 1 (commands skipped — không ship workflow stubs).
- `agy agents` liệt kê đủ 12 `cf-*` (`cf-explorer` … `cf-writer-deep`).
- Synthetic `privacy-block.agy.sh` `view_file` `/x/.env` → `{"decision":"deny",…}`.
- Synthetic `session-init.agy.sh` `invocationNum:1` → `injectSteps` chứa `HOST: agy` + `MAIN_REPO_ROOT`.
- `hooks_manager.go`: `loaded 1 named hooks from 1 hooks.json file(s)` (group `coding-friend`).
- `agy plugin list` in `No imported plugins.` — plugin sống dưới `~/.gemini/config/plugins/` (config scan), không phải “imported” via `agy plugin install`. Agents vẫn list.

Cần session `agy` tương tác (chưa chạy ở đây): `/cf-help`, đọc `.env` bị chặn trong TUI, `invoke_subagent` `cf-explorer`.

---

## 9. Known differences / gotchas

1. **Artifact, không bridge** — omp spawn `plugin/hooks/*.sh` live; agy
   **copy** artifact. Sửa `plugin/` mà quên `ud-plugin-local` + restart thì
   runtime cũ.
2. **`cf dev on .` chọn source** — không bật dev mode, `resolveAgyPluginSource`
   có thể lấy marketplace clone / GitHub `main` (stale). Inner loop local
   luôn cần bước 2 ở §5.A.
3. **Không `AGY_PLUGIN_ROOT`** — skill hướng dẫn dùng token `<plugin-root>`
   (định nghĩa trong `rules/AGENTS.md`). `./hooks` trong `hooks.json` là
   relative vì cwd = plugin dir.
4. **stdin camelCase** — `toolCall.args` (`AbsolutePath`, `TargetFile`,
   `CommandLine`, …), không phải Claude `tool_input`. Adapter `.agy.*` quét
   mọi string path-like, không hardcode một key.
5. **Privacy/scout fail open** — JSON stdin hỏng → allow. omp **fail
   closed**. Matcher không bắt mọi tool (ví dụ `invoke_subagent`,
   `search_web` không đi qua privacy/scout; auto-approve matcher `*` vẫn
   chạy).
6. **`autoApprove` opt-in** — cùng key với Claude; trên AGY deterministic,
   default `ask`. `cf permission --agent agy` là no-op: agy tự quản
   `/permissions`; auto-approve CF chỉ là config key.
7. **Không task / agent tracker, không PreCompact memory-capture, không
   statusline** — xem §3.
8. **`/cf-session`** → native `agy --continue` / IDE `/resume`. Không parse
   transcript agy.
9. **`--with-codex` ignored** trên `/cf-review`.
10. **`rules/AGENTS.md` bị gitignore gốc** — `.gitignore` có rule `AGENTS.md`
    (AI Sync). Pre-commit `git add -f -- plugin-antigravity/rules/AGENTS.md`.
    Drift check không thấy file untracked nếu ignore còn hiệu lực.
11. **Một install location** — không project plugin `.agents/plugins/`. Không
    gọi `agy plugin install` subprocess.
12. **`agy -p` (print mode) không chạy tool/hook** — đừng dùng `-p` để test
    privacy-block.
13. **`agy plugin list` = "No imported plugins"** khi copy vào
    `~/.gemini/config/plugins/` — không có nghĩa plugin không load; dùng
    `agy plugin validate` + `agy agents`.

---

## 10. Troubleshooting

| Triệu chứng                            | Kiểm tra                                                                    | Sửa                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `agy CLI not found`                    | `command -v agy`                                                            | [antigravity.google](https://antigravity.google/)                          |
| Version unsupported                    | `agy --version`                                                             | Cần ≥ 1.1.0 (`AGY_MIN_VERSION`)                                            |
| 0 skill/agent sau install              | `ls ~/.gemini/config/plugins/coding-friend/{skills,agents}`                 | `cf dev on .` rồi `cf install --agy` lại từ repo                           |
| Plugin không hiện                      | `jq '.plugins["coding-friend"]' ~/.gemini/config/config.json`; `cf disable` | `cf enable --agy`; restart                                                 |
| Hook không chạy                        | `grep hooks_manager ~/.gemini/antigravity-cli/cli.log`                      | Restart `agy`; `agy plugin validate` path install; `test -x` các `.agy.sh` |
| Privacy không chặn `.env`              | Matcher + fail-open; `privacyBlock: false`                                  | Synthetic pipe §8; config local/global                                     |
| Auto-approve không allow               | `autoApprove` default off                                                   | Set `true` trong `.coding-friend/config.json`                              |
| MCP không connect                      | `jq '.mcpServers' ~/.gemini/config/plugins/coding-friend/mcp_config.json`   | Phải có `coding-friend-memory`; `npx -y coding-friend-cli mcp-serve`       |
| `cf update` skip agy                   | `isAgyPluginInstalled` (`plugin.json` trong plugin dir)                     | `cf install --agy` trước                                                   |
| `ud-plugin-local` “agy update skipped” | `agy` / `cf` trên PATH; plugin đã install                                   | Cài agy, `cf install --agy`, chạy lại                                      |
| Sửa hook không thấy                    | agy đọc **copy**, không phải repo                                           | `npm run ud-plugin-local` + restart                                        |
| Session Claude bị nhầm host            | Probe `.omp/` / env (omp R4)                                                | `CF_HOST=agy` được set trong `hooks.json`; Claude hooks.json thì không     |
| `agy plugin validate` ≠ 0              | stdout validate                                                             | File vẫn installed; xem warning, không phải rollback                       |

Log hook: `~/.gemini/antigravity-cli/cli.log` (và `~/.gemini/antigravity-cli/log/cli-*.log`)
— grep `hooks_manager`. `session-init.agy.sh` không ghi
`${TMPDIR}/coding-friend-session-init.log` (log đó thuộc Claude
`plugin/hooks/session-init.sh`).

```bash
# sanity
ls ~/.gemini/config/plugins/coding-friend/agents/cf-*.md | wc -l   # 12
ls ~/.gemini/config/plugins/coding-friend/hooks/*.agy.*            # 6 adapter
jq '.plugins["coding-friend"]' ~/.gemini/config/config.json
jq '.mcpServers["coding-friend-memory"]' \
  ~/.gemini/config/plugins/coding-friend/mcp_config.json
agy plugin validate ~/.gemini/config/plugins/coding-friend
```

---

## 11. Tham khảo

- [plugin-dev.md](plugin-dev.md) — quy trình dev/release chung
- [codex-dev.md](codex-dev.md) — host Codex (cùng artifact mode)
- [omp-dev.md](omp-dev.md) — host omp (bridge, đối lập artifact)
- [architecture.md](architecture.md) — tổng quan plugin vs CLI
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
- Docs agy: [antigravity.google/docs](https://antigravity.google/docs)

Cập nhật: 2026-08-25 · agy ≥ 1.1.0 · beta
