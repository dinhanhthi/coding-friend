# Làm việc với Codex (local dev)

> Tài liệu tham khảo độc lập cho việc phát triển/​test Coding Friend trên **Codex CLI**.
> Phần release/probe chi tiết: [plans/2026-05-16-codex-support/NEXT-STEPS.md](plans/2026-05-16-codex-support/NEXT-STEPS.md).
> Quy trình dev chung cho cả hai host: [plugin-dev.md](plugin-dev.md).

**Cập nhật:** 2026-06-14 · Codex CLI yêu cầu ≥ 0.130.0.

---

## 1. Kiến trúc: source → artifact → Codex

```
plugin/            ← source DUY NHẤT (Claude-native, raw)
   │  npm run build:codex   (scripts/build-codex-plugin.js)
   ▼
plugin-codex/      ← artifact GENERATE cho Codex (đã commit vào repo)
   │  codex plugin marketplace add <repo>  +  /plugins install
   ▼
~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/   ← Codex COPY vào đây để chạy
```

- **Không sửa `plugin-codex/` bằng tay** — luôn sửa `plugin/` rồi `npm run build:codex`.
- Marketplace Codex: `.agents/plugins/marketplace.json` → `source: local, path: ./plugin-codex`.
  (Marketplace Claude là `.claude-plugin/marketplace.json` → `./plugin`, riêng biệt.)
- Build convert tự động: `/cf-x` → `$cf-x`, `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}`,
  `subagent_type: "..."` → custom agent, model alias → reasoning effort, `CLAUDE.md` → `AGENTS.md`…
- Guard: `npm run lint:codex` (artifact không còn Claude-ism), `npm run verify:codex-drift`
  (artifact đã commit khớp với build). Pre-commit hook tự rebuild + stage `plugin-codex/`.

---

## 2. Quy trình local dev cho Codex

> `cf dev on/off/sync` **chỉ hỗ trợ Claude** (`cli/src/commands/dev.ts` hardcode `claude`).
> Codex chưa có lệnh tương ứng — làm tay theo dưới. Hai host độc lập (`~/.claude` vs
> `~/.codex`), chạy song song được; `cf` CLI dùng chung.

### A. Setup một lần (vào `~/.codex` thật)

```bash
cd cli && npm run build && cd ..                       # 1. CLI local (cf đã npm link)
npm run build:codex                                    # 2. generate plugin-codex/
codex plugin marketplace add /Users/thi/git/coding-friend   # 3. marketplace LOCAL
cf enable --agent codex                                # 4. enable trong ~/.codex/config.toml
#    5. trong Codex:  /plugins → install coding-friend (0.130.0 chưa script được)
cf init --agent codex --trust-project                  # 6. mỗi project muốn dùng
```

⚠️ **Đừng** dùng `cf install --agent codex` để add marketplace ở bước 3 — nó add
marketplace **GitHub** (`dinhanhthi/coding-friend` = `main`, chưa có code Codex cho tới
khi merge). Phải add đường dẫn **local**.

> Sandbox tùy chọn: prefix mọi lệnh `codex` bằng `CODEX_HOME=/tmp/cf-codex-dev` để không
> đụng `~/.codex` thật (dùng cùng giá trị cho _mọi_ lệnh `codex` trong phiên).

### B. Inner loop (sau mỗi lần sửa)

- Sửa `cli/src/**` → `cd cli && npm run build` (bỏ qua nếu đang chạy `npm run watch`).
  `npm run watch` **chỉ** theo dõi `cli/src`, **không** đụng `plugin-codex/`.
- Sửa `plugin/**` → `npm run build:codex` (KHÔNG có watcher tự làm), rồi reload trong
  Codex (xem §3 về cơ chế cache).

### C. Tắt / dọn dẹp

```bash
# trong Codex: /plugins → uninstall coding-friend
codex plugin marketplace remove coding-friend-marketplace
cf disable --agent codex
```

> Chưa có "remote" để switch về (code Codex chưa lên `main`) → "off" = gỡ hẳn.
> Sau khi merge + release: "off" = add lại marketplace GitHub qua `cf install --agent codex`.

---

## 3. Cách Codex cache plugin (đã xác minh trên đĩa, KHÔNG live)

Bằng chứng từ `~/.codex` (plugin `openai-bundled` có `source_type = "local"` trong
`config.toml` vẫn có bản copy đầy đủ trong cache):

- Codex **copy** plugin vào `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`
  — **không** đọc trực tiếp repo local. Giống Claude (`~/.claude/plugins/cache/.../<version>/`).
- Cache khoá theo **version**. Có cơ chế sync theo git-SHA (`~/.codex/.tmp/plugins.sha`,
  `plugins-clone-*`).

→ Hệ quả: sửa `plugin/` → `build:codex` **chưa đủ**; phải đẩy bản mới vào cache thì Codex
mới thấy (tương đương `cf dev sync` của Claude, nhưng làm tay).

---

## 4. Câu hỏi mở — xác nhận khi test live (chưa verify được)

Tới thời điểm viết, marketplace `coding-friend` local **chưa được add** vào `~/.codex`,
nên các điểm sau suy ra từ plugin khác, cần kiểm chứng khi chạy thật:

1. **Trigger refresh cache**: Codex có tự re-sync nguồn local lúc khởi động không?
   - Nếu CÓ → inner loop = `build:codex` + **restart Codex**.
   - Nếu KHÔNG → phải **reinstall** qua `/plugins` (đây mới là `cf dev sync` thực sự).
2. **Version keying**: không bump version trong `plugin-codex/.codex-plugin/plugin.json`
   thì Codex có chịu copy đè bản mới lên version-dir cũ không?
3. **4 probe bắt buộc** (chi tiết ở [NEXT-STEPS.md §1.3](plans/2026-05-16-codex-support/NEXT-STEPS.md)):
   privacy-block qua `apply_patch`, matcher bắt `apply_patch`, memory MCP precedence,
   auto-approve `autoApproveCodex`.

Ghi kết quả vào [plans/2026-05-16-codex-support/probe-results.md](plans/2026-05-16-codex-support/probe-results.md).

---

## 5. Nâng cấp tương lai (chưa làm)

- **`cf dev --agent codex`**: cho Codex có toggle 1-lệnh như Claude (on/sync/off). Nên
  làm **sau** khi chốt câu hỏi §4.1 (copy vào cache vs Codex tự re-sync) — tránh code dựa
  trên giả định cache sai. Hiện cache Claude chắc chắn là copy-thuần (đã verify) nên
  `cf dev sync` an toàn; cache Codex thì chưa.
- **Watcher cho `plugin-codex/`**: tự `build:codex` khi `plugin/` đổi (cân nhắc vì build
  hơi nặng nếu trigger liên tục).

---

## 6. Tham khảo

- [plans/2026-05-16-codex-support/NEXT-STEPS.md](plans/2026-05-16-codex-support/NEXT-STEPS.md) — release runbook + probe
- [plans/2026-05-16-codex-support/HOW-IT-WORKS.md](plans/2026-05-16-codex-support/HOW-IT-WORKS.md) — thiết kế dual-host
- [plans/2026-05-16-codex-support/PARITY-GAPS.md](plans/2026-05-16-codex-support/PARITY-GAPS.md) — khác biệt Claude vs Codex
- [plugin-dev.md](plugin-dev.md) — quy trình dev/release chung
- Host-aware CLI: `cli/src/lib/host.ts`, `cli/src/lib/codex-config.ts`; build: `scripts/build-codex-plugin.js`
