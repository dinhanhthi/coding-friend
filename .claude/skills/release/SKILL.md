---
name: release
description: Finalize changelogs, create git tags, and push to trigger CI/CD releases
disable-model-invocation: true
argument-hint: "[plugin|cli|all]"
model: haiku
---

# /release

Finalize and publish releases. Hint: **$ARGUMENTS**

## Packages

| Package    | Version file                        | Changelog             | Tag pattern | CI/CD trigger                |
| ---------- | ----------------------------------- | --------------------- | ----------- | ---------------------------- |
| **Plugin** | `plugin/.claude-plugin/plugin.json` | `plugin/CHANGELOG.md` | `v*`        | GitHub Release               |
| **CLI**    | `cli/package.json`                  | `cli/CHANGELOG.md`    | `cli-v*`    | npm publish + GitHub Release |

> **Note:** Learn MCP, Learn Host, and CF Memory are bundled libs inside CLI — their changes are versioned and released as part of the CLI package.

## Helper script

```bash
bash .claude/skills/release/scripts/release.sh <package>
# package: plugin | cli
```

The script: reads version from package files, replaces `(unpublished)` with today's date in changelog. Does NOT create tags or push.

## Workflow

### Step 1: Pre-check

Verify you're in the right state:

```bash
git branch --show-current          # Must be "main"
git status                          # Must be clean
git fetch origin main
git log HEAD..origin/main --oneline # Must be empty (up to date)
```

If NOT on `main`, tell the user:

> You must be on the `main` branch with a clean working tree. Run:
> `git checkout main && git pull origin main`

### Step 2: Detect packages to release

If `$ARGUMENTS` names a specific package (`plugin`, `cli`), use **only** that package — still verify its changelog has an `(unpublished)` section before proceeding.

If `$ARGUMENTS` is `all` or empty, scan all changelogs for `(unpublished)` sections:

```bash
grep -l "(unpublished)" plugin/CHANGELOG.md cli/CHANGELOG.md 2>/dev/null
```

If no packages have `(unpublished)` sections, tell the user there's nothing to release.

### Step 3: Confirm with user

Show a table of what will be released:

```
| Package    | Version | Tag          | Changelog                        |
|------------|---------|--------------|----------------------------------|
| Plugin     | 0.0.2   | v0.0.2       | plugin/CHANGELOG.md              |
| CLI        | 1.2.1   | cli-v1.2.1   | cli/CHANGELOG.md                 |
```

Ask the user to confirm before proceeding.

### Step 4: Run release script

For each package to release:

```bash
bash .claude/skills/release/scripts/release.sh <package>
```

This updates the changelog. It does NOT create tags — tags are created after committing.

**If the script reports a version mismatch** (package.json version != changelog version), fix the package version file to match the changelog version, then re-run the script. Use the bump helper:

```bash
bash .coding-friend/skills/cf-ship-custom/scripts/bump.sh <package> <correct_version>
```

### Step 5: Commit changelog updates

Stage and commit only the modified changelogs:

```bash
git add <changed-changelog-files>
git commit -m "chore: finalize changelogs for release"
```

### Step 6: Create tags

After committing, create tags so they point to the finalized commit:

```bash
git tag <tag1>
git tag <tag2>
# ... one per package
```

**Tag ordering**: Always create and push tags in this fixed priority order (skip any that aren't part of this release):

1. `cli-v*`
2. `v*` (plugin — always last)

### Step 7: Push

Ask the user before pushing:

> Ready to push to `origin/main` with tags. This will trigger CI/CD:
>
> - `v0.0.2` → GitHub Release (plugin)
> - `cli-v1.2.1` → npm publish + GitHub Release (CLI)
>
> Proceed?

If confirmed:

```bash
# Push the commit first
git push origin main

# Then push each tag individually in priority order (skip missing):
# 1. cli-v*
# 2. v* (plugin — always last)
git push origin <tag1>
git push origin <tag2>
# ... one per package, in the order above
```

**IMPORTANT**: Do NOT use `git push origin main --tags`. Pushing multiple tags at once may fail to trigger GitHub Actions workflows. Push each tag individually, following the priority order defined in Step 6.

### Step 8: Report

Show summary:

```
Released:
  Plugin v0.0.2   → tag v0.0.2 pushed → GitHub Release will be created
  CLI v1.2.1      → tag cli-v1.2.1 pushed → npm publish + GitHub Release

Check CI/CD status:
  https://github.com/dinhanhthi/coding-friend/actions
```

## Rules

- MUST be on `main` branch with clean working tree
- NEVER create tags for packages without `(unpublished)` changelogs
- NEVER push without user confirmation
- NEVER include AI/agent attribution in commits
- If a tag already exists, the script will error — do NOT force-create tags
- If a version mismatch is detected, fix the package version file BEFORE retrying — do NOT manually create tags to bypass
