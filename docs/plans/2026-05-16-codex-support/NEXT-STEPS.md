# Next Steps — Codex Support Release

**Created:** 2026-06-10
**Context:** A DEEP `/cf-review` of the `codex-support` branch (a7518c0..c11650c)
found 1 Critical, 6 Important, and 9 minor findings. All actionable findings
were fixed in the working tree on 2026-06-10. This document lists what was
fixed, what you must do before the release gate, and what remains as known,
accepted gaps.

## 1. What was just fixed (uncommitted — review & commit first)

| #   | Finding (severity)                                                                                                                     | Fix                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Build never rejected unresolved placeholders; lint wired into nothing (**Critical**, plan decision #3 deviation)                       | `buildCodexPlugin()` now runs `findCodexArtifactLintIssues()` and **throws** on any issue; new npm scripts `lint:codex` + `test:scripts`; lint step added to `codex-drift.yml` and `release-codex.yml` |
| 2   | No CI ran any test suite (**Important**)                                                                                               | New `.github/workflows/tests.yml`: placeholder lint + `scripts/__tests__` (node:test) + full CLI/hook vitest suites on every PR and main push                                                          |
| 3   | Drift check ignored untracked artifact files (**Important**)                                                                           | `verify-codex-drift.js` now also fails on untracked files under `plugin-codex/`                                                                                                                        |
| 4   | Global `~/.codex/config.toml` MCP entry pointed at the last-initialized project's memory — cross-project contamination (**Important**) | `cf init --agent codex` registers the memory MCP in the **project** `.codex/config.toml` only                                                                                                          |
| 5   | Privacy boundary did not cover Codex `apply_patch` (**Important**)                                                                     | Generated matchers gain `\|apply_patch`; `privacy-block.sh` and `scout-block.cjs` extract target paths from patch envelopes (format verified against `openai/codex` source)                            |
| 6   | Codex auto-approve could not classify file edits (**Important**)                                                                       | `auto-approve.codex.cjs` parses `apply_patch` envelopes: allow only when every path (incl. `Move to:` renames) stays inside the project; otherwise defer to native approval                            |
| 7   | `CODEX_HOME` in a shell profile flipped Claude sessions to `HOST: codex` (**Important**, Claude regression)                            | `session-init.sh` detects Codex only via session-scoped `CODEX_SESSION_ID`                                                                                                                             |
| 8   | Dead/self-contradictory files shipped in artifact                                                                                      | Build excludes Claude session scripts, nested-Codex review scripts, `task-tracker.sh`, Claude `memory-capture.sh`                                                                                      |
| 9   | Wrong host wording in generated files                                                                                                  | review-out prompt says "paste … to Codex"; `cf dev sync` removed from Codex cf-help; both backed by new lint patterns so wording drift fails the build                                                 |
| 10  | `cf uninstall --agent codex` left residue                                                                                              | Now removes deployed `~/.codex/agents/cf-*.toml` and the global memory MCP entry; remaining residue documented                                                                                         |
| 11  | PreCompact transcript search read every session JSONL                                                                                  | Newest-date-first walk, filename match preferred, stops at first hit                                                                                                                                   |
| 12  | `ensureGitignoreEntry("AGENTS.md")` ran even for user-committed files                                                                  | Gated on "we just created AGENTS.md"                                                                                                                                                                   |
| 13  | `cf-clean.mdx` described removed checkbox UX                                                                                           | Doc rewritten for the select-loop flow                                                                                                                                                                 |

Test/coverage additions: `auto-approve.codex.test.cjs` 4 → 11 tests
(apply_patch in/out of project, unparseable envelope, rename targets,
allowExtra passthrough, deny-overrides-allowExtra, env override),
`session-init.test.cjs` 1 → 3, `scout-block.test.cjs` +1,
`codex-config.test.ts` +2, `uninstall.test.ts` +1.

Verified locally: `npm run build:codex`, `npm run lint:codex`,
`npm run test:scripts` (13/13), `cd cli && npm test` (866 + 568), CLI build
(tsup + dts) — all green.

## 2. What YOU should do next (in order)

1. **Review and commit the fixes.** Everything is uncommitted in the working
   tree. The pre-commit hook regenerates `plugin-codex/` automatically (it
   already matches). Suggested split: one commit for the build/CI guard
   chain, one for the hook/CLI fixes, one for docs.
2. **Probe on a live Codex session** (the one thing code review cannot
   verify — see PARITY-GAPS §2 caveat):
   - `privacy-block.sh` end-to-end: ask Codex to edit `.env` via
     `apply_patch` in a scratch project → expect the hook to block (exit 2).
   - Matcher behavior: confirm `Read|Write|Edit|Glob|Grep|apply_patch`
     fires for `apply_patch` events.
   - Memory MCP precedence: with the plugin's bundled `.mcp.json`
     (relative `docs/memory`) and the project `.codex/config.toml`
     (absolute path) both present, confirm which one Codex loads and that
     it resolves to the right project. Record results in
     [probe-results.md](./probe-results.md).
   - Auto-approve: with `autoApproveCodex: true`, confirm an in-project
     `apply_patch` is approved and an out-of-project one falls back to the
     native prompt.
3. **Existing-install migration note.** Anyone who ran an earlier
   `cf init --agent codex` still has a stale global
   `[mcp_servers.coding-friend-memory]` entry pointing at one project.
   Either tell them to rerun `cf init --agent codex` in each project and
   delete the global entry, or have `cf init`/`cf update` remove it. Decide
   before GA; mention it in the release notes.
4. **Watch the first CI runs** of the new `tests.yml` workflow and the
   extended `codex-drift.yml` on the PR — they have never run in GitHub
   Actions yet.
5. **Proceed with the release gate** ([phase-10-release-plumbing.md](./phase-10-release-plumbing.md)):
   merge to `main`, then tag `v0.36.0` — `release.yml` chains
   `release-codex.yml`, which validates version parity + drift + lint and
   creates `codex-v0.36.0` at the same commit. Publish CLI `v1.37.0` via the
   `cli-v*` tag. (Changelog/version bumps are yours to do.)
6. **After GA, dogfood dual-host** in this repo: `cf install --agent codex`
   - `cf init --agent codex --trust-project`, then run `$cf-plan`,
     `$cf-review`, `$cf-fix` in Codex and confirm memory written by Codex is
     visible from Claude.

## 3. Known, accepted gaps (no action needed)

- Codex reads files through shell commands, so `privacy-block` covers reads
  only via its Bash `command` heuristics (PARITY-GAPS §2).
- Deterministic-only auto-approve on Codex — no LLM classifier port (locked
  decision #4).
- `agents.max_depth = 2`, project trust entries, and project-local `.codex/`
  files are intentionally left behind by `cf uninstall --agent codex`.
- The cf-plan rewrite (`--inline`, `--gui`, folder layout) rode along on
  this branch; it is Claude-side feature work, already covered by the same
  review, but worth a separate regression pass if anything in `/cf-plan`
  misbehaves after release.
- Hand-rolled TOML editing in `codex-config.ts` is fine for the CF-owned
  tables it touches; switch to a real TOML parser if the config surface
  grows.

## 4. Where things stand

- Plan decisions: **12 of 12** now verifiably implemented (decision #3 was
  the deviation; the lint is now enforced in the build itself, in CI, and in
  the release workflow).
- Drift guard is two-layer and meaningful: `verify:codex-drift` proves the
  committed artifact matches the build, and the in-build lint proves the
  build output is host-compatible — wording drift in `plugin/` can no longer
  silently no-op a transform.
