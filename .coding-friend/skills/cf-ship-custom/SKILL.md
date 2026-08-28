## Before

This is a **version bump + ship + release** operation. Run these steps BEFORE the standard cf-ship workflow.

**Args** (optional): `[patch|minor|major] [plugin|cli]`

### Step B1: Get bump context

**Run this ALWAYS — even when the working tree is clean.** A clean working tree means changes are already committed and pushed; it does NOT mean there is nothing to release. Tags may not yet exist for the current file versions.

```bash
bash .coding-friend/skills/cf-ship-custom/scripts/bump-info.sh [package-arg] [level-arg]
```

Read the output. It tells you: which packages changed, current vs tag version, whether to bump or just update changelog, and path→package mapping.

### Step B2: Determine bump level and filter packages

If level not in args, analyze the changes and determine patch/minor/major automatically. Do NOT ask for confirmation — proceed immediately.

**Bump level taxonomy — match changelog labels:**

- **PATCH** (x.x.Z): improvements or refinements to existing behavior (expanding allow-lists, tweaking output, polishing UX, bug fixes, typos, docs) — changelog label "Improved" or "Fixed". Example: expanding `auto-approve` allow-list → PATCH, not MINOR.
- **MINOR** (x.Y.0): new capability a user can invoke or opt into — new skill, new CLI command, new hook, new feature flag — changelog label "Added" or "New".
- **MAJOR** (X.0.0): breaking change (config format change, removed skill, changed CLI behavior).

**Default to PATCH. Bias strongly toward PATCH over MINOR.**

- When in doubt between PATCH and MINOR, choose PATCH.
- A single new capability alongside improvements → still PATCH unless the new capability is substantial and user-facing on its own.
- MINOR is reserved for releases where new capabilities are the dominant story — multiple new skills, commands, or features added, not just one incidental addition alongside fixes.
- Small additions that extend existing behavior (new option to an existing command, new entry in an existing list, new config key for an existing feature) → PATCH, not MINOR.

**Rule of thumb:** if all commits in a version only improve/refine/fix existing things (no new user-facing capability), the bump is PATCH. If only one minor new thing was added among many improvements, still prefer PATCH.

**Cross-cutting commits — primary package attribution:**
When a commit touches paths in multiple packages, determine which package owns the change by looking at where the **essence** of the change lives — not just which paths were touched:

- If a commit is primarily a CLI feature/fix (most changed files are in `cli/`, the feature is a CLI command, the tests are CLI tests) and only incidentally updates a plugin file (e.g., a hook reads new config) → it is a **CLI-only change**. Do NOT bump or changelog the plugin for it.
- If a commit independently changes both packages (e.g., adds a new plugin skill AND a new CLI command) → attribute to both, with separate package-appropriate descriptions.
- **Key signal:** if the plugin changelog entry would describe CLI commands/features (e.g., `cf statusline`, `cf config`) rather than plugin-specific behavior, it's a CLI change — not a plugin change.

After filtering, if a package flagged by bump-info.sh has NO commits that are primarily its own, skip bumping it entirely.

### Step B3: Bump version files

For each package that needs bumping (state = "bump", not "already-bumped"):

```bash
bash .coding-friend/skills/cf-ship-custom/scripts/bump.sh <package> <new_version>
```

### Step B4: Update changelogs

For each affected package, collect commits since its last tag and write entries under `## v{version} (TODAY'S DATE)` — e.g. `## v0.15.0 (2026-03-26)`. Use `date +%Y-%m-%d` to get today's date. Use backticks for inline code references (skill names like `cf-plan`, agent names like `cf-code-reviewer`, commands like `/cf-commit`, file names, config keys, CLI commands, technical identifiers). Append commit links `[#hash](repo/commit/hash)`. Deduplicate against existing entries.

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

# For cross-cutting commits, check the full stat to determine primary package
git show <hash> --stat
```

**Cross-cutting commit attribution:** A commit that touches paths in multiple packages will appear in both `git log` results. Attribute it to the **primary** package only (see Step B2). Do NOT write duplicate entries across changelogs for the same commit.

**Only edit `plugin/CHANGELOG.md` and `cli/CHANGELOG.md`.** `plugin-codex/CHANGELOG.md` and `plugin-antigravity/CHANGELOG.md` are **generated mirrors** of `plugin/CHANGELOG.md` — the `.githooks/pre-commit` hook reruns `npm run build:codex` + `npm run build:agy` and stages the result whenever `plugin/` or `package.json` is staged. Never hand-edit them (the codex mirror rewrites `/cf-*` to `$cf-*`). Same for the generated manifests `plugin-codex/.codex-plugin/plugin.json` and `plugin-antigravity/plugin.json`: they inherit their version from root `package.json` at build time, so `bump.sh plugin` is all you need.

These package changelogs (`plugin/CHANGELOG.md`, `cli/CHANGELOG.md`) are the source for GitHub Releases. The public changelog is the [GitHub Releases](https://github.com/dinhanhthi/coding-friend/releases) page (`/changelog` on the website redirects there). Do **not** update `website/src/content/index.md` or any other website markdown as part of ship.

### Step B5: Ship (commit + push)

Proceed with the **standard cf-ship workflow** (verify → commit → push). Use `bump <packages> to <versions>` as the commit hint.

**Verification — run ALL of these, this repo has two separate test suites and root-only checks miss the CLI one:**

```bash
npm run test:scripts        # root: generator/catalog tests (~29)
(cd cli && npm test)        # CLI + hooks: what tests.yml actually runs (~67 + ~15 files)
npm run verify:codex-drift  # plugin-codex artifact in sync
npm run verify:agy-drift    # plugin-antigravity artifact in sync
npm run lint:codex
npm run lint:agy
```

`npm run test:scripts` alone is NOT enough — `.github/workflows/tests.yml` has a separate `cli` job running `npm test` inside `cli/`, and a release shipped on a red CLI suite before because only the root suite was run. Never report "verification passed" without the `cli` line above.

**IMPORTANT:** If already on the `main` branch, do NOT create a new branch. Commit and push directly to `main` — no PR needed.

### Step B6: Create tags and push

After the commit is pushed, create git tags and push them to trigger CI/CD.

**You only push these by hand** (never invent extra host tags):

| What you push | Tag | What it triggers |
| ------------- | --- | ---------------- |
| Plugin | `v{version}` e.g. `v0.15.0` | One GitHub Release covering Claude + Codex + AGY (generated trees in the same tagged commit) |
| CLI (if CLI was bumped) | `cli-v{version}` e.g. `cli-v1.24.0` | npm publish + GitHub Release |

How it works: `.github/workflows/release.yml` (trigger `v*`) verifies locked versions (`package.json`, `plugin/.claude-plugin/plugin.json`, `plugin-codex/.codex-plugin/plugin.json`, `plugin-antigravity/plugin.json`) plus Codex/AGY drift and lint, then publishes **one** GitHub Release for that `v*` tag. Codex (`plugin-codex/`) and Antigravity (`plugin-antigravity/`) ship as generated artifacts in the tagged commit — not as extra tags.

**The repo may have more than one remote** (e.g. a contributor fork). Always name `origin` explicitly in tag pushes and confirm it points at the canonical repo first: `git remote get-url origin`.

```bash
# Create tags (one per released package)
git tag <tag>

# Push each tag individually — plugin tag MUST be pushed last.
# Order: 1. cli-v* (first)  2. v* (plugin — always last)
git push origin <tag>
```

**Verify the tag actually landed** — a push that prints success is not proof the release started:

```bash
git ls-remote --tags origin | grep -F "<tag>"        # hand-pushed tag present on origin?
gh run list --workflow=release.yml --limit 3         # release workflow triggered?
```

If the hand-pushed tag is missing or no `release.yml` run appeared, report it — do NOT silently re-push or assume success.

**IMPORTANT**: Do NOT use `git push origin main --tags`. Pushing multiple tags at once may fail to trigger GitHub Actions workflows. Push each tag individually. When both CLI and plugin tags exist, **always push the plugin tag (`v*`) last** — the plugin GitHub Release workflow updates the marketplace cache, which must include the latest CLI version.

### Step B7: Print summary

```
Released:
  Plugin v0.15.0   → tag v0.15.0 pushed (you) → one GitHub Release (Claude + Codex + AGY)
  Codex            → ships on the same v0.15.0 tag (`plugin-codex/` in the tagged commit)
  Antigravity      → ships on the same v0.15.0 tag (`plugin-antigravity/` in the tagged commit)
  CLI v1.24.0      → tag cli-v1.24.0 pushed (you) → npm publish + GitHub Release

Check CI/CD status:
  https://github.com/dinhanhthi/coding-friend/actions
```

Always list Codex and AGY in this summary when a plugin `v*` was pushed — they ship on that same tag, not as extra tags. If `release.yml` has not finished, point at the run; do not treat that as a missed step.

**NO CONFIRMATIONS:** Do NOT ask for confirmation at any step — not for bump level, not for pushing, not for creating PRs, not for tagging. Analyze, decide, and execute autonomously.

## Rules

- Published tags on `origin` = single source of truth. Run `git fetch --tags` first (bump-info.sh does this).
- NEVER bump if file version > tag version — only update changelog.
- ALWAYS keep `plugin/.claude-plugin/plugin.json` + root `package.json` in sync.
- NEVER add duplicate changelog entries. One feature = one bullet. Entries must reflect net changes vs the previous released version — do NOT list intermediate additions/removals that cancel each other out within the same version.
- Changelog sections use today's date directly — NEVER use `(unpublished)`.
- Do NOT update website markdown (`website/src/content/index.md` or any `website/` content). The site is a single page; `/changelog` redirects to GitHub Releases.
- If a tag already exists, do NOT force-create tags — error and stop.
- NEVER hand-edit generated artifacts: `plugin-codex/**` and `plugin-antigravity/**` are rebuilt from `plugin/` + root `package.json` by `.githooks/pre-commit`. Edit the source, not the mirror.
- Only `v*` and `cli-v*` are pushed by hand. Do not invent extra host tags.
- Push tags without asking for confirmation — the `## After` NO CONFIRMATIONS rule applies here too.

## After

**NO CONFIRMATIONS:** Do NOT ask for confirmation at any step — not for bump level, not for pushing, not for creating PRs, not for tagging. Analyze, decide, and execute autonomously.
