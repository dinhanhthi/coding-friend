# Phase 10: Release plumbing

**Plan:** [README.md](./README.md)
**Type:** sequential
**Goal:** Wire CI/CD for Codex plugin release tracking + drift guard. After this phase, releasing a new Claude plugin version also auto-produces a matching Codex release.

## Progress

| Status  | Task                                                  |
| ------- | ----------------------------------------------------- |
| ✅ DONE | 10.1 Add `codex-v*` tag pattern + GA workflow         |
| ✅ DONE | 10.2 Pre-commit hook for `plugin-codex/` regeneration |
| ✅ DONE | 10.3 CI drift check on every PR                       |
| ⏸ READY | 10.4 First locked release (`v$NEW` + `codex-v$NEW`)   |

## Tasks

1. **10.1 GA workflow for `codex-v*`**
   - Files: `.github/workflows/release-codex.yml` (new), `.github/workflows/release.yml` (edit)
   - Trigger: push to a tag matching `codex-v*`, or a direct reusable-workflow call from the existing `v*` release.
   - Job: checkout, install Node, validate all plugin versions against the requested tag, regenerate and verify `plugin-codex/`, require the matching Claude tag at the same commit, zip the artifact, and create the Codex GitHub release with a link to the matching Claude release.
   - Implementation note: the Claude release calls the reusable Codex workflow directly. A tag created with `GITHUB_TOKEN` does not reliably start a second workflow, so `gh release create --target` creates the locked `codex-v*` tag and release in the same called workflow. Codex CLI itself is not installed because artifact generation and validation are offline and do not invoke it.
   - Verify: YAML parses; release archive passes `unzip -t`; version/tag invariants were reviewed against the release candidate.
   - Rollback: delete workflow file; revert plugin workflow edit.

2. **10.2 Pre-commit hook**
   - Files: `.githooks/pre-commit`, `scripts/install-git-hooks.js`, `package.json`
   - Dependency-free tracked hook installed through the root `prepare` script. It preserves an existing custom `core.hooksPath`.
   - On commit: if a generator input is staged, reject mixed staged/unstaged source state, run `npm run build:codex`, and stage resulting `plugin-codex/` changes.
   - Verify: exercised against the staged v0.36.0 source changes; generated manifest/changelog changes were auto-staged. An untracked plugin input was also rejected with a clear error.
   - Rollback: revert hook.

3. **10.3 CI drift check**
   - Files: `.github/workflows/codex-drift.yml`, `scripts/verify-codex-drift.js`
   - Runs `npm run verify:codex-drift` on every pull request and pushes to `main`.
   - The verifier regenerates the artifact and prints a clear `npm run build:codex` remediation when the working tree differs.
   - Verify: local synchronized run passes; workflow YAML parses.
   - Rollback: revert workflow.

4. **10.4 First locked release**
   - Release candidate versions: plugin `v0.36.0`, CLI `v1.37.0`.
   - Files: root/plugin/CLI manifests and locks, plugin and CLI changelogs, regenerated Codex manifest/changelog.
   - CLI packaging was tightened after the release dry-run exposed nested development dependencies in the tarball. The final prepublish guard reports 129 files / 245,310 bytes, and a fresh temporary install reports CLI `1.37.0`.
   - Codex archive: `plugin-codex/` zipped and validated successfully.
   - Release gate: create and push `v0.36.0`, `codex-v0.36.0`, and `cli-v1.37.0` after this branch is merged. Tags/releases were intentionally not published from the unmerged feature branch.
   - Rollback: untag locally with `git tag -d`; delete GitHub releases via `gh release delete`

## Exit criteria

- ✅ Tagging `v$NEW` is wired to create the matching `codex-v$NEW` tag and release
- ✅ Pre-commit hook regenerates `plugin-codex/` on every relevant change
- ✅ CI rejects pull requests with stale `plugin-codex/`
- ✅ Release candidate versions, Codex archive, CLI package, and fresh CLI install are verified
- ⏸ GitHub/npm publication and fresh remote marketplace installs wait for merge + tag push
