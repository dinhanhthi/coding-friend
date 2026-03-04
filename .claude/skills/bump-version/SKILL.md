---
name: bump-version
description: Bump version, update changelogs, commit, and ship for coding-friend packages
disable-model-invocation: true
argument-hint: "[patch|minor|major] [plugin|cli|learn-mcp|learn-host]"
model: haiku
---

# /bump-version

Bump version, update changelogs, commit, and create PR. Hint: **$ARGUMENTS**

## Packages

| Package        | Version files                                                                                               | Changelog                         | Git tag pattern                            |
| -------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------ |
| **Plugin**     | `plugin/.claude-plugin/plugin.json` + `package.json` (root) — MUST stay in sync                             | `plugin/CHANGELOG.md`             | `v*` (e.g. `v0.1.6`)                       |
| **CLI**        | `cli/package.json`                                                                                          | `cli/CHANGELOG.md`                | `cli-v*` (e.g. `cli-v1.0.4`)               |
| **Learn MCP**  | `cli/lib/learn-mcp/package.json` + `cli/lib/learn-mcp/src/index.ts` (McpServer version) — MUST stay in sync | `cli/lib/learn-mcp/CHANGELOG.md`  | `learn-mcp-v*` (e.g. `learn-mcp-v0.1.0`)   |
| **Learn Host** | `cli/lib/learn-host/package.json`                                                                           | `cli/lib/learn-host/CHANGELOG.md` | `learn-host-v*` (e.g. `learn-host-v0.1.0`) |

## Helper scripts

```bash
# Get bump context (tags, versions, state, changed packages)
bash .claude/skills/bump-version/scripts/bump-info.sh [package] [level]

# Bump version files for a package
bash .claude/skills/bump-version/scripts/bump.sh <package> <new_version>
```

## Workflow

### Step 1: Get bump context

Parse package and level from `$ARGUMENTS` (e.g. `cli patch`, `minor plugin`, `learn-mcp`).

Run the bump-info script:

```bash
bash .claude/skills/bump-version/scripts/bump-info.sh [package-arg] [level-arg]
```

Read the output. It tells you per package:
- **Latest tag** — the published version on origin
- **File version** — current version in source files
- **State** — `bump` (needs version bump) or `already-bumped` (file version > tag, only update changelog)
- **Has changes** — whether files changed since the last tag

### Step 2: Determine bump level

If `$ARGUMENTS` contains `patch`, `minor`, or `major`, use that.

Otherwise, analyze the changes and suggest:

| Level             | When                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| **PATCH** (x.x.1) | Bug fix, typo, docs update                                           |
| **MINOR** (x.1.0) | New feature, new skill, new hook (backward compatible)               |
| **MAJOR** (1.0.0) | Breaking change (config format, removed skill, changed CLI behavior) |

Ask the user to confirm the level before proceeding.

### Step 3: Bump version files

For each package that needs bumping (state = `bump`, NOT `already-bumped`):

```bash
bash .claude/skills/bump-version/scripts/bump.sh <package> <new_version>
```

### Step 4: Update changelogs

For each affected package:

#### 4a: Collect commits since published tag

Use the tags from bump-info output:

```bash
# Get repo URL
git remote get-url origin | sed 's|git@github.com:|https://github.com/|' | sed 's|\.git$||'

# Plugin
git log ${PLUGIN_TAG}..HEAD --oneline --no-merges -- 'plugin/' '.claude-plugin/' '.claude/' '.agents/'

# CLI (exclude learn-* libs)
git log ${CLI_TAG}..HEAD --oneline --no-merges -- 'cli/' ':!cli/lib/learn-host/' ':!cli/lib/learn-mcp/'

# Learn MCP
git log ${MCP_TAG}..HEAD --oneline --no-merges -- 'cli/lib/learn-mcp/'

# Learn Host
git log ${HOST_TAG}..HEAD --oneline --no-merges -- 'cli/lib/learn-host/'
```

If no published tag exists, use all commits: `git log --oneline --no-merges -- <paths>`

#### 4b: Deduplicate against existing changelog

Read the current changelog file. If a commit's intent is already captured by an existing bullet (even with different wording), skip it. One feature = one bullet point.

#### 4c: Write changelog entries

**Section header format:**

```markdown
## v{version} (unpublished)
```

- If section already exists → append new bullet points (preserve existing)
- If section does not exist → insert new section at the top, after the file header

**Bullet point rules:**

- One bullet per logical change, not per commit
- Group commits about the same feature into one bullet
- Write from user perspective: what changed, not what file was edited
- Imperative tense: "Add X", "Fix Y", "Update Z"
- Append commit link(s) at the end of each bullet point

**Commit links:**

Format: `[#short_hash](REPO_URL/commit/short_hash)` — append after the bullet text.

Examples:

```markdown
- Add custom skill guides ([#a1b2c3d](https://github.com/dinhanhthi/coding-friend/commit/a1b2c3d))
- Fix hook error on new session ([#f4e5d6c](https://github.com/dinhanhthi/coding-friend/commit/f4e5d6c))
```

If a bullet groups multiple commits, include all links:

```markdown
- Redesign homepage with ecosystem section ([#a1b2c3d](https://github.com/dinhanhthi/coding-friend/commit/a1b2c3d), [#e5f6a7b](https://github.com/dinhanhthi/coding-friend/commit/e5f6a7b))
```

If commit hash is not available, omit the link (write the bullet without it).

### Step 5: Sync website docs

Check if any commits changed source files with corresponding website docs:

| Source path                     | Website doc                                     |
| ------------------------------- | ----------------------------------------------- |
| `plugin/skills/{name}/SKILL.md` | `website/src/content/docs/skills/{name}.mdx`    |
| `cli/src/commands/{name}.ts`    | `website/src/content/docs/cli/cf-{name}.mdx`    |
| `plugin/hooks/*.sh`             | `website/src/content/docs/reference/hooks.mdx`  |
| `plugin/agents/*.md`            | `website/src/content/docs/reference/agents.mdx` |
| `cli/src/commands/dev.ts`       | `website/src/content/docs/cli/cf-dev.mdx`       |

If source changed and website doc exists → update it to reflect current behavior.
Skip if no mapping exists or doc already matches.

**Sync:** new/changed workflow steps, options, parameters, examples.
**Don't sync:** internal implementation details, agent-only logic, changelog bullets.

### Step 6: Summarize

Print a summary table:

```
| Package    | Old Version | New Version | Changelog Section        |
|------------|------------|-------------|--------------------------|
| Plugin     | 0.1.5      | 0.1.6       | v0.1.6 (unpublished)     |
| CLI        | 1.0.3      | 1.0.4       | v1.0.4 (unpublished)     |
```

If website docs were synced, list them too.

### Step 7: Commit and ship

Check the current branch first:

```bash
git branch --show-current
```

**If on `main`:**

1. **Commit** — Use `/cf-commit` with a hint describing the version bump. Example hint: `bump cli to 1.0.4`
2. **Push** — Push directly to `main` (no PR needed).

**If on a feature branch:**

1. **Commit** — Use `/cf-commit` with a hint describing the version bump.
2. **Ship** — Use `/cf-ship` to push and create PR.

### Step 8: Suggest next steps

**If on `main`:** Remind the user to run `/release` to publish the new release.

**If a PR was created:** Remind the user:

1. Review the pull request on GitHub
2. Merge the PR, then run `/release` to publish the new release

## Rules

- Published tags on `origin` are the SINGLE SOURCE OF TRUTH for released versions
- NEVER bump a version that is already ahead of its published tag — update the existing `(unpublished)` changelog section instead
- ALWAYS keep `.claude-plugin/plugin.json` and root `package.json` versions in sync
- ALWAYS keep `cli/lib/learn-mcp/package.json` and `cli/lib/learn-mcp/src/index.ts` McpServer version in sync
- All 4 package versions are INDEPENDENT — they don't need to match each other
- If unsure about bump level, ASK the user
- Do NOT create git tags — that happens during `/release`
- A tag is only "published" if it exists on `origin`
- NEVER add duplicate changelog entries
- One feature = one bullet, even if it spans multiple commits
- ALWAYS mark unreleased sections as `(unpublished)`
- Do NOT create empty changelog sections — skip packages with no new commits
- NEVER include AI/agent attribution in commits
