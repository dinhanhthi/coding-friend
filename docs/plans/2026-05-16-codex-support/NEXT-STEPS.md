# Next Steps — Codex Support

**Cập nhật:** 2026-06-14
**Bối cảnh:** Toàn bộ implementation (Phase 0–9) đã xong. Branch `codex-support`
đã được **rebase lên `main`** (gộp các tính năng mới của main: progressive-disclosure
cf-plan/cf-tdd, memory MCP user-scope). Sau rebase, version chốt lại:
plugin **`0.36.0`**, CLI **`1.38.0`** (đổi từ 1.37.0 do collision với release của main).
Working tree sạch, mọi test offline xanh (xem 1.1).
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
cd cli && npm test         # vitest CLI + hooks (930 + 574)
```

### 1.2 Dùng bản CF local cho Codex (quy trình mặc định)

> **Đây là cách làm chuẩn để Codex luôn chạy bản CF trong repo này.**
> `cf dev on` / `cf dev off` **chỉ hỗ trợ Claude Code** (code trong
> `cli/src/commands/dev.ts` hardcode `claude`). Codex chưa có lệnh tương ứng,
> nên dùng các bước thủ công dưới đây — bản chất giống hệt `cf dev`, chỉ là làm tay.

Yêu cầu: Codex CLI ≥ 0.130.0. **Không cần merge vào `main`** — Codex nhận
marketplace từ local path, và `.agents/plugins/marketplace.json` trỏ
`source: local, path: ./plugin-codex` nên artifact trên branch này dùng được ngay.

**Bảng đối chiếu với Claude:**

| Việc                         | Claude Code                                            | Codex (làm tay)                                      |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Bật dùng bản local           | `cf dev on`                                            | mục **A** dưới                                       |
| Tắt → quay về remote         | `cf dev off`                                           | mục **C** dưới (gỡ marketplace local)                |
| Plugin payload               | `plugin/` (copy vào cache `~/.claude`)                 | `plugin-codex/` (**artifact generate** từ `plugin/`) |
| Reload sau khi sửa `plugin/` | `cf dev sync`                                          | `npm run build:codex` rồi reload trong Codex         |
| CLI (`cf`)                   | dùng chung — `cd cli && npm run build` (đã `npm link`) | dùng chung — y hệt                                   |

#### A. Setup một lần (vào `~/.codex` thật để Codex luôn dùng bản local)

```bash
# 1. CLI local — cf đã link sẵn về cli/, chỉ cần build dist
#    (hoặc chạy `npm run watch` ở cửa sổ riêng nếu vừa code vừa test)
cd cli && npm run build && cd ..

# 2. Generate artifact Codex từ plugin/
npm run build:codex

# 3. Đăng ký marketplace TRỎ VÀO REPO LOCAL.
#    KHÔNG dùng `cf install --agent codex` ở bước này — nó add marketplace GitHub
#    (`dinhanhthi/coding-friend` = main, chưa có code Codex). Add tay đường dẫn local:
codex plugin marketplace add /Users/thi/git/coding-friend

# 4. Bật enablement plugin trong ~/.codex/config.toml
cf enable --agent codex
```

Rồi cài plugin thủ công (Codex 0.130.0 chưa script được bước này):

```
codex → /plugins → install coding-friend
```

Và init từng project muốn dùng:

```bash
cf init --agent codex --trust-project
```

> **Sandbox tùy chọn:** nếu KHÔNG muốn đụng `~/.codex` thật, prefix mọi lệnh
> `codex` bằng `CODEX_HOME=/tmp/cf-codex-dev` (phải dùng cùng giá trị đó cho
> _mọi_ lệnh `codex` trong phiên, nếu không nó đọc `~/.codex` mặc định).

#### B. Sau mỗi lần sửa code (thay cho `cf dev sync`)

- Sửa `cli/src/**` → `cd cli && npm run build` (bỏ qua nếu đang chạy `npm run watch`).
- Sửa `plugin/**` → `npm run build:codex` để regenerate `plugin-codex/`, rồi
  reload trong Codex: `/plugins` → reinstall `coding-friend` (hoặc khởi động lại Codex).
  _(Cơ chế cache local marketplace của Codex 0.130.0 — đọc live hay phải reinstall
  — là một mục cần xác nhận ở probe 1.3.)_

#### C. Tắt / dọn dẹp (tương đương `cf dev off`)

```bash
# trong Codex: /plugins → uninstall coding-friend
codex plugin marketplace remove coding-friend-marketplace
cf disable --agent codex
```

> Hiện chưa có "remote" cho Codex để switch về (code Codex chưa lên `main`), nên
> "off" lúc này = gỡ hẳn. Sau khi merge + release, "off" = add lại marketplace
> GitHub bằng `cf install --agent codex`.

### 1.3 Probe checklist (chạy khi test live)

1. **Init một project scratch** (nếu chưa làm ở 1.2):

   ```bash
   cf init --agent codex --trust-project
   ```

   Kiểm tra: `AGENTS.md` được tạo, `.codex/config.toml` có
   `[mcp_servers.coding-friend-memory]` (chỉ project, KHÔNG ghi global),
   `.codex/agents/` có TOML.

2. **Chạy 4 probe bắt buộc** và ghi kết quả vào
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

3. **Smoke test skill/hook**: mở thread mới, `/hooks` để trust hooks, chạy
   `$cf-plan`, `$cf-review`, `$cf-fix`; xác nhận memory Codex ghi ra đọc
   được từ Claude (cùng `docs/memory/`).

---

## 2. Có cần merge vào `main` không?

- **Để test local: KHÔNG.** Mục 1.2 chạy hoàn toàn từ branch
  `codex-support` qua local path — `plugin-codex/` đã commit sẵn trên branch.
- **Để chạy production: CÓ.** `cf install --agent codex` của người dùng chạy
  `codex plugin marketplace add dinhanhthi/coding-friend`, tức fetch từ
  GitHub theo default branch (`main`). Chừng nào chưa merge, người dùng
  ngoài sẽ không nhận được code Codex.
- **Tag/release cũng chờ merge.** Phase 10.4 đã chốt: không tag từ feature
  branch; `v0.36.0`, `codex-v0.36.0`, `cli-v1.38.0` chỉ push sau khi merge.
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
   (root `package.json` + plugin manifests), CLI `1.38.0`
   (`cli/package.json`), changelog tương ứng.
5. **Tag từ `main`:**

   ```bash
   git tag v0.36.0 && git push origin v0.36.0       # → release.yml → tự sinh codex-v0.36.0
   git tag cli-v1.38.0 && git push origin cli-v1.38.0  # → publish-cli.yml → npm
   ```

6. **Verify từ môi trường sạch:** `npm i -g coding-friend-cli@1.38.0` →
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

| #   | File                                                             | Vấn đề                                                                                                                                                                   | Sửa                                                                                                                 |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `website/src/content/docs/getting-started/codex.mdx` (dòng ~48)  | Nói memory MCP được đăng ký "in both `~/.codex/config.toml` and project `.codex/config.toml`" — sai sau fix #4 (chỉ project-scoped để tránh cross-project contamination) | Sửa thành project-only + một câu giải thích vì sao không ghi global                                                 |
| 2   | `website/src/content/docs/cli/cf-uninstall.mdx` (dòng ~52)       | Chỉ nói disable plugin + `--remove-marketplace`; thiếu hành vi mới của fix #10                                                                                           | Bổ sung: uninstall xoá cả `~/.codex/agents/cf-*.toml` và entry memory MCP global; liệt kê residue cố ý để lại       |
| 3   | `website/src/content/docs/cli/cf-init.mdx` (dòng ~33)            | "Registers the memory MCP server in Codex config" — mơ hồ                                                                                                                | Ghi rõ: chỉ ghi vào project `.codex/config.toml`, cần `--trust-project` (hoặc trust thủ công) thì MCP mới được load |
| 4   | `website/src/content/docs/reference/auto-approve.mdx` (tùy chọn) | Chưa nhắc Codex auto-approve giờ parse được `apply_patch` envelope (fix #6)                                                                                              | Thêm một câu: edit qua `apply_patch` trong project được approve, ngoài project defer về native                      |
| 5   | `codex.mdx` — mục Troubleshooting (tùy chọn)                     | Thiếu migration note cho người dùng bản init cũ                                                                                                                          | Thêm mục: cách xoá entry `[mcp_servers.coding-friend-memory]` global bị stale                                       |

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
