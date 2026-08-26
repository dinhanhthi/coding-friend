# Working with Codex (local dev)

> Standalone reference for developing/testing Coding Friend on **Codex CLI**.
> Detailed release/probe notes: [plans/2026-05-16-codex-support/NEXT-STEPS.md](plans/2026-05-16-codex-support/NEXT-STEPS.md).
> Shared dual-host dev process: [plugin-dev.md](plugin-dev.md).

**Updated:** 2026-06-14 · Codex CLI requires ≥ 0.130.0.

---

## 1. Architecture: source → artifact → Codex

```
plugin/            ← ONLY source (Claude-native, raw)
   │  npm run build:codex   (scripts/build-codex-plugin.js)
   ▼
plugin-codex/      ← GENERATED artifact for Codex (committed to the repo)
   │  codex plugin marketplace add <repo>  +  /plugins install
   ▼
~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/   ← Codex COPIES here to run
```

- **Do not edit `plugin-codex/` by hand** — always edit `plugin/` then `npm run build:codex`.
- Codex marketplace: `.agents/plugins/marketplace.json` → `source: local, path: ./plugin-codex`.
  (The Claude marketplace is `.claude-plugin/marketplace.json` → `./plugin`, separate.)
- The build converts automatically: `/cf-x` → `$cf-x`, `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}`,
  `subagent_type: "..."` → custom agent, model alias → reasoning effort, `CLAUDE.md` → `AGENTS.md`…
- Guards: `npm run lint:codex` (artifact has no remaining Claude-isms), `npm run verify:codex-drift`
  (the committed artifact matches the build). The pre-commit hook rebuilds + stages `plugin-codex/`.

---

## 2. Local-dev workflow for Codex

> `cf dev on/off/sync` **only supports Claude** (`cli/src/commands/dev.ts` hardcodes `claude`).
> Codex has no matching command yet — do it by hand as below. The two hosts are independent
> (`~/.claude` vs `~/.codex`) and can run in parallel; the `cf` CLI is shared.

### A. One-time setup (into the real `~/.codex`)

```bash
cd cli && npm run build && cd ..                       # 1. local CLI (cf already npm-linked)
npm run build:codex                                    # 2. generate plugin-codex/
codex plugin marketplace add /Users/thi/git/coding-friend   # 3. LOCAL marketplace
cf enable --agent codex                                # 4. enable in ~/.codex/config.toml
#    5. in Codex:  /plugins → install coding-friend (0.130.0 cannot be scripted yet)
cf init --agent codex --trust-project                  # 6. per project that should use it
```

⚠️ **Do not** use `cf install --agent codex` to add the marketplace in step 3 — it adds the
**GitHub** marketplace (`dinhanhthi/coding-friend` = `main`, which has no Codex code until
merge). You must add the **local** path.

> Optional sandbox: prefix every `codex` command with `CODEX_HOME=/tmp/cf-codex-dev` so you
> do not touch the real `~/.codex` (use the same value for _every_ `codex` command in the session).

### B. Inner loop (after each edit)

- Edit `cli/src/**` → `cd cli && npm run build` (skip if `npm run watch` is already running).
  `npm run watch` **only** watches `cli/src`, and does **not** touch `plugin-codex/`.
- Edit `plugin/**` → `npm run build:codex` (there is NO watcher that does this), then reload
  in Codex (see §3 for the cache mechanism).

### C. Disable / clean up

```bash
# in Codex: /plugins → uninstall coding-friend
codex plugin marketplace remove coding-friend-marketplace
cf disable --agent codex
```

> There is not yet a "remote" to switch back to (Codex code is not on `main`) → "off" = remove it entirely.
> After merge + release: "off" = re-add the GitHub marketplace via `cf install --agent codex`.

---

## 3. How Codex caches the plugin (verified on disk, NOT live)

Evidence from `~/.codex` (the `openai-bundled` plugin has `source_type = "local"` in
`config.toml` and still has a full copy in the cache):

- Codex **copies** the plugin into `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`
  — it does **not** read the local repo directly. Same as Claude (`~/.claude/plugins/cache/.../<version>/`).
- The cache is keyed by **version**. There is a git-SHA sync mechanism (`~/.codex/.tmp/plugins.sha`,
  `plugins-clone-*`).

→ Consequence: editing `plugin/` → `build:codex` is **not enough**; you must push a new copy into
the cache before Codex will see it (the Claude equivalent is `cf dev sync`, but here it is manual).

---

## 4. Open questions — confirm during live testing (not yet verified)

At the time of writing, the local `coding-friend` marketplace had **not** been added to
`~/.codex`, so the points below are inferred from other plugins and need live confirmation:

1. **Cache refresh trigger**: does Codex re-sync a local source on startup?
   - If YES → inner loop = `build:codex` + **restart Codex**.
   - If NO → you must **reinstall** via `/plugins` (that is the real `cf dev sync`).
2. **Version keying**: if you do not bump the version in `plugin-codex/.codex-plugin/plugin.json`,
   will Codex overwrite the old version-dir with the new copy?
3. **4 required probes** (details in [NEXT-STEPS.md §1.3](plans/2026-05-16-codex-support/NEXT-STEPS.md)):
   privacy-block via `apply_patch`, matcher catching `apply_patch`, memory MCP precedence,
   auto-approve `autoApprove`.

Record results in [plans/2026-05-16-codex-support/probe-results.md](plans/2026-05-16-codex-support/probe-results.md).

---

## 5. Future upgrades (not done yet)

- **`cf dev --agent codex`**: give Codex a one-command toggle like Claude (on/sync/off). Should
  be done **after** settling question §4.1 (copy into cache vs Codex re-syncs itself) — avoid
  coding against a wrong cache assumption. Claude's cache is confirmed as a pure copy (verified),
  so `cf dev sync` is safe; Codex's cache is not yet.
- **Watcher for `plugin-codex/`**: auto-run `build:codex` when `plugin/` changes (weigh this —
  the build is a bit heavy if it fires continuously).

---

## 6. References

- [plans/2026-05-16-codex-support/NEXT-STEPS.md](plans/2026-05-16-codex-support/NEXT-STEPS.md) — release runbook + probes
- [plans/2026-05-16-codex-support/HOW-IT-WORKS.md](plans/2026-05-16-codex-support/HOW-IT-WORKS.md) — dual-host design
- [plans/2026-05-16-codex-support/PARITY-GAPS.md](plans/2026-05-16-codex-support/PARITY-GAPS.md) — Claude vs Codex differences
- [plugin-dev.md](plugin-dev.md) — shared dev/release process
- Host-aware CLI: `cli/src/lib/host.ts`, `cli/src/lib/codex-config.ts`; build: `scripts/build-codex-plugin.js`
