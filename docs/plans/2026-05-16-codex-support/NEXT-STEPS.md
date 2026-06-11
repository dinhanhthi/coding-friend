# Next Steps — Codex Support

**Cập nhật:** 2026-06-11
**Bối cảnh:** Toàn bộ implementation (Phase 0–9) đã xong, các fix từ DEEP
`/cf-review` ngày 2026-06-10 đã được commit lên branch `codex-support`
(`3bb5ebf`, `b0d93ca`, `cf65608`, `2899fac`, `121e06f`). Working tree sạch.
Còn lại: test live trên Codex, merge, release gate (Phase 10.4), và vá vài
trang website docs bị stale.

---

## 1. Test Codex support ở dev mode (local)

### 1.1 Kiểm tra offline (đã xanh — chạy lại sau mỗi lần đổi code)

```bash
npm run build:codex        # generate plugin-codex/ từ plugin/
npm run lint:codex         # placeholder + host-compat lint
npm run test:scripts       # test build/conversion (node:test, 13 test)
npm run verify:codex-drift # artifact committed khớp với build
cd cli && npm test         # vitest CLI + hooks (866 + 568)
```

### 1.2 Test live với Codex CLI (chưa làm — code review không thể verify)

Yêu cầu: Codex CLI ≥ 0.130.0. **Không cần merge vào `main`** — Codex chấp
nhận marketplace từ local path (probe 0.6), và `.agents/plugins/marketplace.json`
trỏ `source: local, path: ./plugin-codex` nên artifact trên branch này dùng
được ngay.

1. **Dùng CLI bản dev** (bản npm global chưa có code Codex):

   ```bash
   cd cli && npm run build && npm link   # hoặc gọi node cli/dist/index.js
   ```

2. **Đăng ký marketplace từ local repo** (khuyến nghị cô lập bằng
   `CODEX_HOME` để không đụng config Codex thật):

   ```bash
   CODEX_HOME=/tmp/cf-codex-dev codex plugin marketplace add /Users/thi/git/coding-friend
   ```

   Hoặc chạy thẳng `cf install --agent codex` rồi gỡ marketplace GitHub và
   add lại local path — bước marketplace là phần duy nhất khác nhau.

3. **Cài plugin thủ công**: mở `codex` → `/plugins` → install
   `coding-friend` (Codex 0.130.0 chưa cho script bước này).

4. **Init một project scratch**:

   ```bash
   cf init --agent codex --trust-project
   ```

   Kiểm tra: `AGENTS.md` được tạo, `.codex/config.toml` có
   `[mcp_servers.coding-friend-memory]` (chỉ project, KHÔNG ghi global),
   `.codex/agents/` có TOML.

5. **Chạy 4 probe bắt buộc** và ghi kết quả vào
   [probe-results.md](./probe-results.md):
   - **privacy-block end-to-end**: nhờ Codex sửa `.env` qua `apply_patch`
     → hook phải block (exit 2).
   - **Matcher**: xác nhận matcher `Read|Write|Edit|Glob|Grep|apply_patch`
     bắt được event `apply_patch`.
   - **Memory MCP precedence**: khi cả `.mcp.json` bundled trong plugin
     (relative `docs/memory`) và project `.codex/config.toml` (absolute
     path) cùng tồn tại, xem Codex load cái nào và có resolve đúng project
     không.
   - **Auto-approve**: bật `autoApproveCodex: true` → `apply_patch` trong
     project được approve, ngoài project rơi về native prompt.

6. **Smoke test skill/hook**: mở thread mới, `/hooks` để trust hooks, chạy
   `$cf-plan`, `$cf-review`, `$cf-fix`; xác nhận memory Codex ghi ra đọc
   được từ Claude (cùng `docs/memory/`).

7. **Dọn dẹp**: xoá `CODEX_HOME` tạm, hoặc
   `codex plugin marketplace remove coding-friend-marketplace`.

---

## 2. Có cần merge vào `main` không?

- **Để test local: KHÔNG.** Mục 1.2 chạy hoàn toàn từ branch
  `codex-support` qua local path — `plugin-codex/` đã commit sẵn trên branch.
- **Để chạy production: CÓ.** `cf install --agent codex` của người dùng chạy
  `codex plugin marketplace add dinhanhthi/coding-friend`, tức fetch từ
  GitHub theo default branch (`main`). Chừng nào chưa merge, người dùng
  ngoài sẽ không nhận được code Codex.
- **Tag/release cũng chờ merge.** Phase 10.4 đã chốt: không tag từ feature
  branch; `v0.36.0`, `codex-v0.36.0`, `cli-v1.37.0` chỉ push sau khi merge.
- Mở PR trước khi merge để `tests.yml` và `codex-drift.yml` chạy lần đầu
  trên GitHub Actions (chúng mới chỉ được verify local).

---

## 3. Các GitHub Actions workflows mới

So với `main` có 3 workflow mới + 1 workflow sửa (xem
`git diff main...codex-support --stat -- .github/workflows/`):

### `tests.yml` (mới)

- **Trigger:** mọi PR, push lên `main`, manual dispatch.
- **Job `scripts`:** `npm ci` → `npm run lint:codex` (lint placeholder +
  host-compat trên artifact) → `npm run test:scripts` (test build/transform).
- **Job `cli`:** `cd cli` → `npm ci` → `npm test` (toàn bộ vitest CLI +
  hook suites).
- Đây là lần đầu repo có CI chạy test suite (fix Important #2 từ review).

### `codex-drift.yml` (mới)

- **Trigger:** mọi PR, push lên `main`, manual dispatch.
- Chạy `npm run verify:codex-drift`: regenerate `plugin-codex/` và fail nếu
  khác artifact đã commit — kể cả file untracked. Sau đó chạy thêm
  `npm run lint:codex`.
- Mục đích: chống quên rebuild artifact (rủi ro "build artifact drift"
  trong plan). Lớp thứ hai là pre-commit hook `.githooks/pre-commit` tự
  rebuild + stage khi commit local.

### `release-codex.yml` (mới)

- **Trigger:** push tag `codex-v*`, HOẶC được `release.yml` gọi qua
  `workflow_call` (đường chính).
- **Các bước:** checkout đúng `target_sha` → validate version khớp ở cả 3
  nơi (`package.json`, `plugin/.claude-plugin/plugin.json`,
  `plugin-codex/.codex-plugin/plugin.json`) → regenerate + verify drift +
  lint → yêu cầu tag Claude `v$VERSION` tồn tại ở cùng commit → zip
  `plugin-codex/` thành `coding-friend-codex-vX.Y.Z.zip` → tạo GitHub
  release `codex-vX.Y.Z` (kèm tag, dùng `gh release create --target`).
- Lý do gọi trực tiếp thay vì tag-triggers-tag: tag tạo bằng
  `GITHUB_TOKEN` không kích hoạt workflow thứ hai một cách đáng tin cậy.

### `release.yml` (sửa)

- Vẫn trigger trên tag `v*`, tạo Claude release từ changelog như cũ.
- **Mới:** job `release-codex` chạy sau, gọi `release-codex.yml` với
  `target_sha` + `version` → một lần push tag `v0.36.0` tự sinh ra cả
  release `codex-v0.36.0` cùng commit. Bạn không cần tự tag `codex-v*`.

### `publish-cli.yml` (không đổi)

- Vẫn như cũ: tag `cli-v*` → publish `coding-friend-cli` lên npm.

---

## 4. Đưa lên production (GA) — thứ tự thực hiện

1. **Chạy xong mục 1.2** (probe live) — đây là gate duy nhất còn lại trước
   release theo review.
2. **Mở PR `codex-support` → `main`.** Theo dõi lần chạy đầu của
   `tests.yml` + `codex-drift.yml` trên PR; fix nếu đỏ.
3. **Merge vào `main`.**
4. **Kiểm tra version đã chốt** (đã nằm sẵn trên branch): plugin `0.36.0`
   (root `package.json` + plugin manifests), CLI `1.37.0`
   (`cli/package.json`), changelog tương ứng.
5. **Tag từ `main`:**

   ```bash
   git tag v0.36.0 && git push origin v0.36.0       # → release.yml → tự sinh codex-v0.36.0
   git tag cli-v1.37.0 && git push origin cli-v1.37.0  # → publish-cli.yml → npm
   ```

6. **Verify từ môi trường sạch:** `npm i -g coding-friend-cli@1.37.0` →
   `cf install --agent codex` → `/plugins` install → `cf init --agent codex`
   trong một project mới → chạy thử `$cf-plan`.
7. **Release notes phải kèm migration note:** ai từng chạy bản
   `cf init --agent codex` cũ còn entry global
   `[mcp_servers.coding-friend-memory]` trỏ vào một project cố định —
   hướng dẫn xoá entry global và rerun `cf init --agent codex` trong từng
   project (hoặc quyết định cho `cf update` tự dọn trước GA).
8. **Sau GA, dogfood dual-host** ngay trong repo này (xem mục 5).

---

## 5. Chạy song song Claude Code + Codex trên cùng một máy

Thiết kế đã hỗ trợ sẵn — hai host độc lập hoàn toàn
(xem [HOW-IT-WORKS.md §1.2](./HOW-IT-WORKS.md)):

1. **Cài đặt** (Claude đã có sẵn, chỉ cần thêm Codex):

   ```bash
   cf install                 # Claude — đã cài, không cần làm lại
   cf install --agent codex   # Codex — không đụng gì tới ~/.claude/
   ```

2. **Trong mỗi project dùng chung:**

   ```bash
   cf init                                  # nếu chưa init cho Claude
   cf init --agent codex --trust-project    # thêm AGENTS.md + .codex/
   ```

   Project sẽ có cả `CLAUDE.md` lẫn `AGENTS.md`, và **một** cây
   `docs/memory/` chung.

3. **Memory dùng chung tự động:** cùng một MCP daemon, đăng ký với cả hai
   host (Claude qua `.mcp.json`, Codex qua project `.codex/config.toml`).
   Memory ghi từ Codex đọc được từ Claude và ngược lại. SQLite WAL xử lý
   việc hai host cùng đọc/ghi.

4. **Những thứ giữ riêng theo host:**
   - State plugin: `~/.claude/` vs `~/.codex/` — `cf enable|disable|
     uninstall --agent codex` không ảnh hưởng Claude và ngược lại.
   - Auto-approve: `autoApprove` (Claude, có LLM classifier) vs
     `autoApproveCodex` (deterministic-only) — hai opt-in độc lập trong
     `.coding-friend/config.json`.
   - Host detection: `session-init.sh` chỉ nhận diện Codex qua
     `CODEX_SESSION_ID` của session — có `CODEX_HOME` trong shell profile
     cũng không làm Claude session bị nhận nhầm thành Codex (đã fix).

5. **Versioning khoá cặp:** plugin Claude `vX.Y.Z` và Codex `codex-vX.Y.Z`
   luôn cùng số — khi update, chạy `cf update` cho Claude và
   `cf update --agent codex` cho Codex.

---

## 6. Website docs cần cập nhật (đã rà soát — kế hoạch cụ thể)

Phase 9 đã phủ phần lớn website. Nhưng các fix sau review (commit `cf65608`)
**đổi behavior mà 3 trang docs chưa được sửa theo** — commit docs `121e06f`
chỉ sửa cf-clean/cf-config/cf-review:

| #   | File                                                            | Vấn đề                                                                                                                                                                  | Sửa                                                                                                            |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `website/src/content/docs/getting-started/codex.mdx` (dòng ~48) | Nói memory MCP được đăng ký "in both `~/.codex/config.toml` and project `.codex/config.toml`" — sai sau fix #4 (chỉ project-scoped để tránh cross-project contamination) | Sửa thành project-only + một câu giải thích vì sao không ghi global                                                |
| 2   | `website/src/content/docs/cli/cf-uninstall.mdx` (dòng ~52)      | Chỉ nói disable plugin + `--remove-marketplace`; thiếu hành vi mới của fix #10                                                                                            | Bổ sung: uninstall xoá cả `~/.codex/agents/cf-*.toml` và entry memory MCP global; liệt kê residue cố ý để lại       |
| 3   | `website/src/content/docs/cli/cf-init.mdx` (dòng ~33)           | "Registers the memory MCP server in Codex config" — mơ hồ                                                                                                                 | Ghi rõ: chỉ ghi vào project `.codex/config.toml`, cần `--trust-project` (hoặc trust thủ công) thì MCP mới được load |
| 4   | `website/src/content/docs/reference/auto-approve.mdx` (tùy chọn) | Chưa nhắc Codex auto-approve giờ parse được `apply_patch` envelope (fix #6)                                                                                              | Thêm một câu: edit qua `apply_patch` trong project được approve, ngoài project defer về native                     |
| 5   | `codex.mdx` — mục Troubleshooting (tùy chọn)                    | Thiếu migration note cho người dùng bản init cũ                                                                                                                            | Thêm mục: cách xoá entry `[mcp_servers.coding-friend-memory]` global bị stale                                       |

Sau khi sửa:

```bash
cd website && npm run build                       # phải pass (68 trang)
npx tsx scripts/generate-llms-txt.ts              # regenerate llms.txt / llms-full.txt
```

Lưu ý: `cd website && npm run lint` đang fail sẵn ở `DocsSidebar.tsx`
(lỗi `react-hooks/set-state-in-effect` có từ trước, không liên quan).

---

## 7. Known, accepted gaps (không cần làm gì)

- Codex đọc file qua shell, nên `privacy-block` chỉ chặn read qua heuristic
  lệnh Bash (PARITY-GAPS §2).
- Auto-approve Codex deterministic-only — không port LLM classifier
  (locked decision #4).
- `agents.max_depth = 2`, project trust entries, và file `.codex/`
  project-local được cố ý giữ lại sau `cf uninstall --agent codex`.
- Bản rewrite cf-plan (`--inline`, `--gui`, folder layout) đi kèm branch
  này — là feature Claude-side, đã review chung, nhưng đáng một vòng
  regression riêng nếu `/cf-plan` có gì lạ sau release.
- TOML editing tự viết trong `codex-config.ts` đủ dùng cho các bảng
  CF-owned; chuyển sang TOML parser thật nếu config surface phình ra.
