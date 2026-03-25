## Before

This is a **version bump + ship** operation. Run these steps BEFORE the standard cf-ship workflow.

**Args** (optional): `[patch|minor|major] [plugin|cli]`

### Step B1: Get bump context

```bash
bash .coding-friend/skills/cf-ship-custom/scripts/bump-info.sh [package-arg] [level-arg]
```

Read the output. It tells you: which packages changed, current vs tag version, whether to bump or just update changelog, and path→package mapping.

### Step B2: Determine bump level

If level not in args, analyze the changes and determine patch/minor/major automatically. Do NOT ask for confirmation — proceed immediately.

### Step B3: Bump version files

For each package that needs bumping (state = "bump", not "already-bumped"):

```bash
bash .coding-friend/skills/cf-ship-custom/scripts/bump.sh <package> <new_version>
```

### Step B4: Update changelogs

For each affected package, collect commits since its last tag and write entries under `## v{version} (unpublished)`. Use backticks for inline code references (skill names like `cf-plan`, agent names like `cf-code-reviewer`, commands like `/cf-commit`, file names, config keys, CLI commands, technical identifiers). Append commit links `[#hash](repo/commit/hash)`. Deduplicate against existing entries.

**CRITICAL — Net changes only:** Changelog entries must reflect the **net difference vs the previous released version**, NOT individual commits. Before writing entries, consolidate all commits for the version and determine what actually changed end-to-end:

- If commit A adds feature X (with part Y) and commit B removes part Y → write ONE entry: "Add X (without Y)". Do NOT write a separate "Remove Y" entry — Y never existed in the previous version.
- If commit A adds something and commit B reverts it entirely → write NOTHING for that change.
- If commit A adds something and commit B improves/modifies it → write ONE entry describing the final state.
- Think of it as: **compare the codebase at the last tag vs HEAD** — only describe differences a user upgrading from the previous version would notice. Internal iteration within the version is invisible to users.

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

**NO CONFIRMATIONS:** Do NOT ask for confirmation at any step — not for bump level, not for pushing, not for creating PRs. Analyze, decide, and execute autonomously.

## Rules

- Published tags on `origin` = single source of truth. Run `git fetch --tags` first (bump-info.sh does this).
- NEVER bump if file version > tag version — only update changelog.
- ALWAYS keep `plugin/.claude-plugin/plugin.json` + root `package.json` in sync.
- Do NOT create git tags — that happens during `/release`.
- NEVER add duplicate changelog entries. One feature = one bullet. Entries must reflect net changes vs the previous released version — do NOT list intermediate additions/removals that cancel each other out within the same version.
- ALWAYS mark unreleased sections `(unpublished)`.
- After ship: remind user to run `/release` to publish.

## After

**NO CONFIRMATIONS:** Do NOT ask for confirmation at any step — not for bump level, not for pushing, not for creating PRs. Analyze, decide, and execute autonomously.
