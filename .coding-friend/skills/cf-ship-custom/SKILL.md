## Before

This is a **version bump + ship** operation. Run these steps BEFORE the standard cf-ship workflow.

**Args** (optional): `[patch|minor|major] [plugin|cli|learn-mcp|learn-host]`

### Step B1: Get bump context

```bash
bash .coding-friend/skills/cf-ship-custom/scripts/bump-info.sh [package-arg] [level-arg]
```

Read the output. It tells you: which packages changed, current vs tag version, whether to bump or just update changelog, and path→package mapping.

### Step B2: Confirm bump level

If level not in args, analyze the changes and suggest patch/minor/major. Ask the user to confirm before proceeding.

### Step B3: Bump version files

For each package that needs bumping (state = "bump", not "already-bumped"):

```bash
bash .coding-friend/skills/cf-ship-custom/scripts/bump.sh <package> <new_version>
```

### Step B4: Update changelogs

For each affected package, collect commits since its last tag and write entries under `## v{version} (unpublished)`. One bullet per logical change. Use backticks for inline code references (skill names like `cf-plan`, agent names like `cf-code-reviewer`, commands like `/cf-commit`, file names, config keys, CLI commands, technical identifiers). Append commit links `[#hash](repo/commit/hash)`. Deduplicate against existing entries.

```bash
# Get repo URL
git remote get-url origin | sed 's|git@github.com:|https://github.com/|' | sed 's|\.git$||'

# Commits per package (use tag from bump-info output)
git log <TAG>..HEAD --oneline --no-merges -- <paths>
```

### Step B5: Sync website docs

If source files changed, update corresponding website docs:

- `plugin/skills/{name}/SKILL.md` → `website/src/content/docs/skills/{name}.mdx`
- `cli/src/commands/{name}.ts` → `website/src/content/docs/cli/cf-{name}.mdx`
- `plugin/hooks/*.sh` → `website/src/content/docs/reference/hooks.mdx`

### Step B6: Print summary table

```
| Package | Old | New | Changelog            |
|---------|-----|-----|----------------------|
| plugin  | ... | ... | v... (unpublished)   |
```

Then proceed with the **standard cf-ship workflow** (verify → commit → push → PR). Use `bump <packages> to <versions>` as the commit hint.

**IMPORTANT:** If already on the `main` branch, do NOT create a new branch. Commit and push directly to `main` — no PR needed.

## After

After the standard cf-ship workflow completes successfully, automatically run `/release` if the following conditions are met:

1. The current branch is `main`
2. The working tree is clean (commit + push already done)

If these conditions are met, invoke the `/release` skill immediately — do not ask the user whether to run it. The `/release` skill itself will handle user confirmation before pushing tags.

If the ship created a PR (not on `main`), skip auto-release and remind the user: "Merge the PR on GitHub, then run `/release`."

## Rules

- Published tags on `origin` = single source of truth. Run `git fetch --tags` first (bump-info.sh does this).
- NEVER bump if file version > tag version — only update changelog.
- ALWAYS keep `plugin/.claude-plugin/plugin.json` + root `package.json` in sync.
- ALWAYS keep `cli/lib/learn-mcp/package.json` + `src/index.ts` McpServer version in sync.
- Do NOT create git tags — that happens during `/release`.
- NEVER add duplicate changelog entries. One feature = one bullet.
- ALWAYS mark unreleased sections `(unpublished)`.
- After ship on `main`: auto-trigger `/release`. After ship via PR: remind user to merge then `/release`.
