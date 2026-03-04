# Release Workflow

## Packages

| Package    | Version file                                              | Changelog                         | Tag pattern     |
| ---------- | --------------------------------------------------------- | --------------------------------- | --------------- |
| Plugin     | `plugin/.claude-plugin/plugin.json` + root `package.json` | `plugin/CHANGELOG.md`             | `v*`            |
| CLI        | `cli/package.json`                                        | `cli/CHANGELOG.md`                | `cli-v*`        |
| Learn MCP  | `cli/lib/learn-mcp/package.json`                          | `cli/lib/learn-mcp/CHANGELOG.md`  | `learn-mcp-v*`  |
| Learn Host | `cli/lib/learn-host/package.json`                         | `cli/lib/learn-host/CHANGELOG.md` | `learn-host-v*` |

## Workflow

```
# 1. Code (repeat as needed)
/cf-commit                        # commit (includes secret scan on staged changes)

# 2. Review (before release prep)
/cf-review                        # 4-layer review with proportional security depth

# 3. Prep release (when ready to publish)
/cf-ship                          # bump + changelog + commit + PR (via cf-ship-custom guide)
# → merge PR on GitHub

# 4. Publish (after PR merge)
git checkout main && git pull     # switch to main with latest changes
/release                          # finalize changelogs, create git tags, push → CI publishes
```

`/cf-ship` accepts args for package filter: `/cf-ship cli patch`, `/cf-ship learn-mcp`, etc.

### Local plugin development

Recommended development workflow (Read more: [Plugin README](plugin/README.md)):

```bash
# One-time setup
cf dev on /path/to/coding-friend

# Inner loop (repeat as many times as needed)
# 1. Edit files
# 2. cf dev sync
# 3. Restart Claude Code and test

# When feature is done — bump version once and commit
```

## Bump levels

| Level             | When                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| **PATCH** (x.x.1) | Bug fix, typo, docs update                                           |
| **MINOR** (x.1.0) | New feature, new skill, new hook (backward compatible)               |
| **MAJOR** (1.0.0) | Breaking change (config format, removed skill, changed CLI behavior) |
