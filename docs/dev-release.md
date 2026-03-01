# Release Workflow

How to version and release coding-friend packages during development.

## Packages

4 independent packages, each with its own version, changelog, and git tag:

| Package | Version file | Changelog | Tag pattern |
|---------|-------------|-----------|-------------|
| Plugin | `plugin/.claude-plugin/plugin.json` + root `package.json` | `plugin/CHANGELOG.md` | `v*` |
| CLI | `cli/package.json` | `cli/CHANGELOG.md` | `cli-v*` |
| Learn MCP | `cli/lib/learn-mcp/package.json` | `cli/lib/learn-mcp/CHANGELOG.md` | `learn-mcp-v*` |
| Learn Host | `cli/lib/learn-host/package.json` | `cli/lib/learn-host/CHANGELOG.md` | `learn-host-v*` |

## Workflow

### Phase 1 — Code (repeat as needed)

Just implement and commit. Don't think about changelogs or version numbers.

```
Ask Claude to implement → Claude writes code → /cf-commit → repeat
```

### Phase 2 — Prep release (when ready to publish)

```
/bump-version → /cf-commit → /cf-ship → merge PR on GitHub
```

- `/bump-version` is the **single entry point** for release prep
- It handles both version bumping and changelog updates (triggers `/changelog` automatically)
- It detects affected packages from commits since the last published git tag
- If a package was already bumped (file version > tag version), it skips the bump and only updates the changelog

### Phase 3 — Publish (after PR merge)

```
git checkout main && git pull → /release → done
```

- `/release` detects packages with `(unpublished)` changelogs
- Replaces `(unpublished)` with today's date
- Creates git tags matching each package's pattern
- Commits changelog updates and pushes tags
- CI/CD triggers automatically: GitHub Release for plugin, npm publish for CLI

### Standalone commands

- `/changelog` — preview/update changelogs without bumping versions
- `/release` — finalize changelogs and create tags without re-bumping

## Bump levels

| Level | When |
|-------|------|
| **PATCH** (x.x.1) | Bug fix, typo, docs update |
| **MINOR** (x.1.0) | New feature, new skill, new hook (backward compatible) |
| **MAJOR** (1.0.0) | Breaking change (config format, removed skill, changed CLI behavior) |
