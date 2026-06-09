# Phase 10: Release plumbing

**Plan:** [README.md](./README.md)
**Type:** sequential
**Goal:** Wire CI/CD for Codex plugin release tracking + drift guard. After this phase, releasing a new Claude plugin version also auto-produces a matching Codex release.

## Progress

| Status  | Task                                                  |
| ------- | ----------------------------------------------------- |
| ⬜ TODO | 10.1 Add `codex-v*` tag pattern + GA workflow         |
| ⬜ TODO | 10.2 Pre-commit hook for `plugin-codex/` regeneration |
| ⬜ TODO | 10.3 CI drift check on every PR                       |
| ⬜ TODO | 10.4 First locked release (`v$NEW` + `codex-v$NEW`)   |

## Tasks

1. **10.1 GA workflow for `codex-v*`**
   - Files: `.github/workflows/release-codex.yml` (new — modeled on existing `release-plugin.yml`)
   - Trigger: push to tag matching `codex-v*`
   - Job: checkout, install Node + Codex CLI, run `npm run build:codex`, create GitHub release with `plugin-codex/` zipped, point release notes at the matching Claude `v$X.$Y.$Z` for parity
   - Also: extend `release-plugin.yml` to, after successful Claude release, automatically tag `codex-v$X.$Y.$Z` and push (triggering this workflow) — keeps versions locked
   - Verify: dry-run by tagging a `codex-v0.0.0-test` and observing the workflow
   - Rollback: delete workflow file; revert plugin workflow edit.

2. **10.2 Pre-commit hook**
   - Files: `.husky/pre-commit` (edit, or create if missing), `package.json` (edit if husky setup needed)
   - On commit: if files under `plugin/` (excluding `plugin-codex/`) are staged, run `npm run build:codex` and stage any resulting `plugin-codex/` changes.
   - Verify: stage a SKILL.md edit, attempt commit, observe `plugin-codex/` files auto-staged.
   - Rollback: revert hook.

3. **10.3 CI drift check**
   - Files: `.github/workflows/ci.yml` (edit — add a step) or new `.github/workflows/codex-drift.yml`
   - Step: `npm run verify:codex-drift` — fails PR if regeneration produces a diff
   - Verify: open a PR that touches `plugin/` without rebuilding → CI must fail with clear message pointing at `npm run build:codex`
   - Rollback: revert workflow.

4. **10.4 First locked release**
   - Files: `plugin/package.json` (bump), `cli/package.json` (bump if CLI commands changed), `plugin/CHANGELOG.md` (add entry), `cli/CHANGELOG.md` (add entry), `plugin-codex/.codex-plugin/plugin.json` (auto-regenerated)
   - Steps: bump versions (minor — new feature), regenerate `plugin-codex/`, commit, tag `v$NEW` AND `codex-v$NEW`, push tags
   - Verify: both GitHub releases appear; `cf install` (Claude) and `cf install --codex` both pull the new version cleanly on a fresh machine
   - Rollback: untag locally with `git tag -d`; delete GitHub releases via `gh release delete`

## Exit criteria

- Tagging `v$NEW` automatically tags `codex-v$NEW` and produces both releases
- Pre-commit hook regenerates `plugin-codex/` on every relevant change
- CI fails any PR with stale `plugin-codex/`
- Users can install both hosts from the marketplace cleanly
