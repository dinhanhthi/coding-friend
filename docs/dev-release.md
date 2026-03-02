# Release Workflow

## Packages

| Package | Version file | Changelog | Tag pattern |
|---------|-------------|-----------|-------------|
| Plugin | `plugin/.claude-plugin/plugin.json` + root `package.json` | `plugin/CHANGELOG.md` | `v*` |
| CLI | `cli/package.json` | `cli/CHANGELOG.md` | `cli-v*` |
| Learn MCP | `cli/lib/learn-mcp/package.json` | `cli/lib/learn-mcp/CHANGELOG.md` | `learn-mcp-v*` |
| Learn Host | `cli/lib/learn-host/package.json` | `cli/lib/learn-host/CHANGELOG.md` | `learn-host-v*` |

## Workflow

```
# 1. Code (repeat as needed)
/cf-commit                        # commit your changes, don't worry about versions

# 2. Prep release (when ready to publish)
/bump-version                     # bump + changelog + commit + PR (all-in-one)
# → merge PR on GitHub

# 3. Publish (after PR merge)
git checkout main && git pull     # switch to main with latest changes
/release                          # finalize changelogs, create git tags, push → CI publishes
```

`/bump-version` accepts a package filter: `/bump-version cli`, `/bump-version learn-mcp patch`, etc.

## Bump levels

| Level | When |
|-------|------|
| **PATCH** (x.x.1) | Bug fix, typo, docs update |
| **MINOR** (x.1.0) | New feature, new skill, new hook (backward compatible) |
| **MAJOR** (1.0.0) | Breaking change (config format, removed skill, changed CLI behavior) |
