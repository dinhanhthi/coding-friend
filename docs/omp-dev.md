# Làm việc với omp (local dev)

> Tài liệu tham khảo độc lập cho việc phát triển/​test Coding Friend trên **omp**
> ([oh-my-pi](https://omp.sh/)). omp là host thứ ba (beta), **bridge mode** —
> không có artifact `plugin-omp/` song song với `plugin-codex/`.
> Host Codex: [codex-dev.md](codex-dev.md). Quy trình dev chung: [plugin-dev.md](plugin-dev.md).

**Cập nhật:** 2026-08-24 · omp CLI ≥ 0.1.0 · labelled **beta**.

---

## 1. Overview — bridge model

omp **không** nhận Coding Friend như một Claude marketplace plugin. `cf install --agent omp` ghi file vào `~/.omp/` (hoặc `OMP_HOME`). Source canonical vẫn là `plugin/` (Claude-native).

| Lớp        | Cách omp nhận                                                                                             | Không làm gì                          |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Skills     | Inherit từ `~/.claude` (priority **80**; omp native = 100, Codex = 70)                                    | Không copy `plugin/skills/`           |
| Agents     | Convert 12 file `plugin/agents/cf-*.md` lúc install → `~/.omp/agent/agents/cf-*.md` (flat, không đệ quy)  | **Không** inherit `~/.claude/agents/` |
| Hooks      | [`plugin/omp/extension.ts`](../plugin/omp/extension.ts) `spawnSync` `plugin/hooks/*.sh` với `CF_HOST=omp` | Không port bash → TS từng hook        |
| MCP        | Ghi trực tiếp `~/.omp/agent/mcp.json` (không có `omp mcp add`)                                            | —                                     |
| Statusline | Bỏ qua — omp có TUI riêng                                                                                 | `cf statusline` / `cf permission`     |

**Path agent đúng (đã verify 2026-08-24):** `~/.omp/agent/agents/*.md` — discovery **non-recursive**. **Không** deploy vào `~/.omp/agents/coding-friend/` (sai parent **và** subdirectory không được scan). Helper `ompUserAgentsDir()` trong [`cli/src/lib/paths.ts`](../cli/src/lib/paths.ts) trỏ đúng chỗ; `ompCodingFriendAgentsDir()` là path cũ, **không dùng** lúc install.

`systemPrompt` = **markdown body** sau frontmatter (`name` + `description` bắt buộc). Không nhét `systemPrompt` vào YAML. Converter: `convertClaudeAgentToOmp()` trong [`cli/src/lib/omp-config.ts`](../cli/src/lib/omp-config.ts).

---

## 2. Kiến trúc: source → shim → spawn

```
plugin/                ← source DUY NHẤT (Claude-native)
├── skills/            ← omp inherit từ ~/.claude (priority 80)
├── agents/cf-*.md     ← convert lúc install → ~/.omp/agent/agents/cf-*.md
└── hooks/*.sh         ← shared bash
       ▲
plugin/omp/extension.ts  (pi.on → spawnSync, CF_HOST=omp)
       ▲
~/.omp/agent/extensions/coding-friend.ts  (re-export shim)
```

- Shim do `writeOmpExtensionEntry()` ghi: comment `// CODING_FRIEND_PLUGIN_ROOT=<abs>` rồi `export { default } from "<abs-to-plugin/omp/extension.ts>"`.
- Factory `(pi: HookAPI) => void` đăng ký `pi.on(...)`; mỗi handler `spawnSync` bash/`node` với env `CF_HOST=omp`, `CODING_FRIEND_PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`.
- `plugin/omp/` **không** nằm trong `.claude-plugin/marketplace.json` — không phải Claude plugin. Chi tiết runtime: [`plugin/omp/README.md`](../plugin/omp/README.md).

Map event (đã đối chiếu docs omp compact events):

| omp event                                                                                          | Claude hook   | Script                                                      |
| -------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| `session_start`                                                                                    | SessionStart  | `session-init.sh` → `pi.sendMessage`                        |
| `tool_call`                                                                                        | PreToolUse    | `privacy-block.sh` → `scout-block.cjs` → `auto-approve.cjs` |
| `session_before_compact` / `session.compacting` / `session_compact` (+ alias `session_compacting`) | PreCompact    | `memory-capture.sh`                                         |
| `session_shutdown`                                                                                 | Stop          | `session-log.sh`                                            |
| `before_agent_start`                                                                               | SubagentStart | `agent-tracker.sh`                                          |

Privacy/scout **fail closed** (missing script / spawn error → `{ block: true }`).

---

## 3. Quy trình local dev cho omp

> `cf dev on/off/sync` **chỉ hỗ trợ Claude** ([`plugin-dev.md`](plugin-dev.md)). omp không có cache copy kiểu Codex — shim re-export path tuyệt đối tới `plugin/omp/extension.ts`. Hai host độc lập (`~/.claude` / `~/.codex` / `~/.omp`); `cf` CLI dùng chung. Codex: [codex-dev.md](codex-dev.md).

### A. Setup một lần

```bash
cd cli && npm run build && cd ..          # 1. CLI local (cf đã npm link)
# omp CLI: https://omp.sh/  →  curl -fsSL https://omp.sh/install | sh
cf install --agent omp                    # 2. agents + shim + memory MCP
#    alias: cf install --omp
cf init --agent omp                       # 3. mỗi project: .omp/mcp.json + .coding-friend/
# restart omp / session mới
```

`--project` / `--local` → project scope (`<cwd>/.omp/agents/cf-*.md`, `<cwd>/.omp/extensions/coding-friend.ts`). Default = user. Memory MCP **luôn** ghi `~/.omp/agent/mcp.json` (user).

> Sandbox: `OMP_HOME=/tmp/cf-omp-dev` cho **mọi** lệnh `cf`/`omp` trong phiên (giống `CODEX_HOME` ở [codex-dev.md](codex-dev.md)).

### B. Inner loop (sau mỗi lần sửa)

- Sửa `cli/src/**` → `cd cli && npm run build` (hoặc `npm run watch`).
- Sửa `plugin/omp/extension.ts` → **restart omp** (shim trỏ file repo nếu install từ cwd).
- Sửa `plugin/hooks/*.sh` → lần spawn kế tiếp đã thấy (không rebuild).
- Sửa `plugin/agents/*.md` → `cf update --agent omp` (hoặc `cf install --agent omp`) để convert lại.
- Sửa `plugin/skills/**` → omp inherit Claude; inner loop Claude (`cf dev sync`) nếu inheritance đọc plugin cache (xem §5 R2).

### C. Tắt / dọn dẹp

```bash
cf disable --agent omp     # task.disabledAgents trong config.yml — file còn
cf enable --agent omp      # gỡ tên cf-* khỏi disabledAgents
cf uninstall --agent omp   # xóa agents + shim; MCP chỉ khi user scope
```

Claude/Codex **không** bị đụng. Không có marketplace omp để `remove`.

---

## 4. File `cf install --agent omp` ghi (user scope)

| Path                                                           | Nội dung                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.omp/agent/agents/cf-*.md`                                  | 12 agent đã convert: `cf-explorer`, `cf-implementer`, `cf-planner`, `cf-reviewer`, `cf-reviewer-plan`, `cf-reviewer-quality`, `cf-reviewer-reducer`, `cf-reviewer-rules`, `cf-reviewer-security`, `cf-reviewer-tests`, `cf-writer`, `cf-writer-deep` |
| `~/.omp/agent/extensions/coding-friend.ts`                     | Re-export shim → [`plugin/omp/extension.ts`](../plugin/omp/extension.ts)                                                                                                                                                                             |
| `~/.omp/agent/mcp.json` → `mcpServers["coding-friend-memory"]` | `{ command: "npx", args: ["-y", "coding-friend-cli", "mcp-serve"] }`                                                                                                                                                                                 |

`cf disable --agent omp` **không** xóa các file trên; chỉ upsert `task.disabledAgents` (block `# coding-friend-managed`) trong `~/.omp/agent/config.yml` (user) hoặc `<cwd>/.omp/config.yml` (project).

`cf update` **không** `--agent` → update mọi host đang cài (Claude → Codex → omp). `--agent omp` / `--omp` = chỉ omp.

---

## 5. Uninstall matrix

`cf uninstall --agent omp` ([`cli/src/commands/uninstall.ts`](../cli/src/commands/uninstall.ts)):

| Artifact                      | User (`--user` / default)                                                | Project (`--project` / `--local`)            |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `cf-*.md` agents              | Xóa file khớp `^cf-.*\.md$` trong `~/.omp/agent/agents/` (file khác giữ) | Tương tự `<cwd>/.omp/agents/`                |
| `coding-friend.ts` shim       | Xóa `~/.omp/agent/extensions/coding-friend.ts`                           | Xóa `<cwd>/.omp/extensions/coding-friend.ts` |
| `coding-friend-memory` MCP    | `removeOmpMcpEntry` trên `~/.omp/agent/mcp.json`                         | **Không** unregister                         |
| `coding-friend-learn` MCP     | Unregister nếu từng được `cf config`/`cf learn` ghi                      | **Không** unregister                         |
| `~/.claude/**`, `~/.codex/**` | Không đụng                                                               | Không đụng                                   |
| `config.yml` `disabledAgents` | Không revert (vô hại sau khi file agent đã xóa)                          | Không revert                                 |

Không có gì để gỡ → `"Nothing to uninstall"`. Restart omp sau uninstall.

---

## 6. Known gotchas

1. **Agent frontmatter / `systemPrompt` (R1)** — omp `parseAgent` lấy `systemPrompt` từ **body**, không phải YAML. Converter chỉ giữ `model` ∈ `{haiku, sonnet, opus}`. Thiếu `name`/`description` → skip file đó lúc deploy.
2. **Skills inheritance path (R2, verified 2026-08-24, omp 18.0.3)** — Không có `omp skills list` (chỉ flag launch `--skills=<glob>` / `--no-skills`). omp đọc **cả hai** bề mặt Claude: user/project `.claude/skills/*/SKILL.md` (provider `claude`, priority **80**) **và** marketplace cache `~/.claude/plugins/cache/` qua `installed_plugins.json` (provider `claude-plugins`, priority **70**). Native omp (`~/.omp/agent/skills`, `.omp/skills`) vẫn priority **100**. Skill `cf-*` của Coding Friend sống trong plugin cache Claude — **không** có trong `~/.claude/skills/` trừ khi user copy. User không cài Claude Code (cache trống) **không** thấy `cf-*`. Fallback (chưa ship): copy vào `~/.omp/agent/skills/` lúc install.
3. **TS extension API (R3)** — `pi.on` theo docs compact events chính thức: `session_before_compact`, `session.compacting`, `session_compact`; `session_compacting` chỉ là alias rẻ. Shim types: [`plugin/omp/pi-types.d.ts`](../plugin/omp/pi-types.d.ts). Nếu omp từ chối re-export `.ts` (R8), fallback: copy `extension.ts` vào `extensions/`.
4. **`.omp/` dir probe false-positive trên Claude (R4)** — [`plugin/hooks/session-init.sh`](../plugin/hooks/session-init.sh) khi `CF_HOST` trống: `CODEX_SESSION_ID` > `OMP_SESSION_ID` > `$PWD/.omp` > `claude`. `cf init --agent omp` tạo `.omp/` → session Claude trong cùng repo có thể bị detect `CF_HOST=omp`. Extension **luôn** set `CF_HOST=omp` khi spawn; Claude hooks.json thì không. Mitigation: export `CF_HOST=claude` khi chạy Claude trên repo mixed-host.
5. **`--omp` không được có Commander default trên `--agent` (đã fix)** — `.option("--agent <agent>", ...)` **không** default `"claude"`. Nếu default, `cf install --omp` thành `{ agent: "claude", omp: true }` → `resolveHost()` conflict. `cf update` còn `flagsForHostResolve()` để strip leftover `agent: "claude"` khi argv không có `--agent`. Default host khi không flag: `"claude"` trong [`cli/src/lib/host.ts`](../cli/src/lib/host.ts), không phải Commander.
6. **Sai path `~/.omp/agents/coding-friend/`** — omp không scan. Luôn flat `~/.omp/agent/agents/cf-*.md`.
7. **`cf permission --agent omp`** — no-op: omp tự quản approval-mode (`omp config`).
8. **Không `OMP_SESSION_ID` chính thức** — probe dùng env nếu có, rồi `.omp/` cwd. Đừng dựa vào session id.

---

## 7. Troubleshooting

| Triệu chứng                               | Kiểm tra                                                                      | Sửa                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `omp CLI not found`                       | `command -v omp`                                                              | [omp.sh](https://omp.sh/) / `curl -fsSL https://omp.sh/install \| sh`                                         |
| 0 agent sau install                       | `ls ~/.omp/agent/agents/cf-*.md`; **không** `ls ~/.omp/agents/coding-friend/` | Chạy từ repo coding-friend hoặc đã `cf install` Claude (source = `plugin/agents` hoặc plugin cache)           |
| Agent không hiện trong omp                | Discovery non-recursive; `cf disable --agent omp` có thể đã disable           | `ls` đúng dir; `cf enable --agent omp`; restart omp                                                           |
| Skills `cf-*` biến mất                    | R2: Claude chưa cài / cache trống                                             | Cài plugin Claude; `cf dev sync` nếu dev; ghi nhận path omp thực sự đọc                                       |
| Hook không chạy                           | Shim + `CODING_FRIEND_PLUGIN_ROOT` trỏ file thật                              | `cat ~/.omp/agent/extensions/coding-friend.ts`; `test -f` path `from "..."`                                   |
| Privacy block mọi tool                    | Fail closed khi script thiếu / spawn lỗi                                      | `CODING_FRIEND_PLUGIN_ROOT` phải chứa `hooks/privacy-block.sh`                                                |
| Session Claude bị `HOST: omp`             | R4: repo có `.omp/`                                                           | `CF_HOST=claude` khi launch Claude; hoặc đừng `cf init --agent omp` trên repo Claude-only                     |
| `--omp` báo conflict với `--agent claude` | Commander default cũ                                                          | `--agent` không được `.option(..., "claude")`; dùng `--omp` **hoặc** `--agent omp`                            |
| MCP không connect                         | `jq . ~/.omp/agent/mcp.json`                                                  | Phải có `coding-friend-memory`; `npx -y coding-friend-cli mcp-serve`; uninstall **project** không gỡ MCP user |
| `cf update` không đụng omp                | `isOmpAgentInstalled`                                                         | Cần ít nhất một `cf-*.md` user hoặc project                                                                   |
| Sửa hook/extension không thấy             | omp không copy cache như Codex                                                | Restart omp; agents thì `cf update --agent omp`                                                               |

Log session-init: `${TMPDIR:-/tmp}/coding-friend-session-init.log` — path omp in `detected CF_HOST=omp`.

```bash
# sanity user-scope
ls ~/.omp/agent/agents/cf-*.md | wc -l          # 12
cat ~/.omp/agent/extensions/coding-friend.ts
jq '.mcpServers["coding-friend-memory"]' ~/.omp/agent/mcp.json
```

---

## 8. Tham khảo

- [plugin-dev.md](plugin-dev.md) — quy trình dev/release chung (Claude + Codex)
- [codex-dev.md](codex-dev.md) — host Codex (artifact `plugin-codex/`, khác bridge omp)
- [architecture.md](architecture.md) — tổng quan plugin vs CLI
- [`plugin/omp/README.md`](../plugin/omp/README.md) — bridge runtime + event map
- [`plugin/omp/extension.ts`](../plugin/omp/extension.ts) — `pi.on` → `spawnSync`
- Host-aware CLI: [`cli/src/lib/host.ts`](../cli/src/lib/host.ts), [`cli/src/lib/omp-config.ts`](../cli/src/lib/omp-config.ts), [`cli/src/lib/paths.ts`](../cli/src/lib/paths.ts)
- Lifecycle: [`cli/src/commands/install.ts`](../cli/src/commands/install.ts), [`cli/src/commands/uninstall.ts`](../cli/src/commands/uninstall.ts)
