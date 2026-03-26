# For plugin developers

## Daily workflow

From the repo root:

```bash
npm run dev            # Start all sub-projects in parallel (see ports below)
npm run format         # Format all code across the repo
npm run format:check   # Check formatting without modifying files
```

`npm run dev` runs these in parallel with colored output:

| Sub-project | Command             | Port                                           |
| ----------- | ------------------- | ---------------------------------------------- |
| CLI         | `npm run watch`     | — (tsup build watch)                           |
| Website     | `npm run dev`       | [http://localhost:3000](http://localhost:3000) |
| Learn Host  | `npm run dev`       | [http://localhost:3333](http://localhost:3333) |
| Learn MCP   | `npm run dev:watch` | — (tsc watch)                                  |

Each sub-project has its own README with more details, check section Further Reading. For daily workflow, check [dev-release.md](docs/dev-release.md).

## Update local plugin changes

Recommended development workflow (Read more: [Plugin README](plugin/README.md)):

```bash
# One-time setup
cf dev on /path/to/coding-friend

# Inner loop (repeat as many times as needed)
# 1. Go to root and run `npm run dev` (cli, website, mcp, host, memory are running)
# 2. Modify something
# 3. - If changes are related to plugin -> run `cf dev sync`
#    - If plugin version is upgraded -> run `cf dev update`
#    - If changes are related to CLI -> do nothing, `npm run dev` is working under the hook
#      - If there is new in cli -> run `cf init` and refresh autocompletion
# 4. When feature is done — bump version once and commit
```

## Token counts

Each skill and agent consumes context tokens when loaded. The script `scripts/generate-token-counts.ts` measures this and writes the result to `website/src/generated/token-counts.json`.

```bash
npm run generate:tokens
```

**What it does:**

1. Reads every `SKILL.md` in `plugin/skills/<name>/`
2. Reads every agent `.md` in `plugin/agents/`
3. Reads the bootstrap context (`plugin/context/bootstrap.md`)
4. Counts tokens using `@lenml/tokenizer-claude`
5. Assigns a context tier: `⚡` low (<1,000), `⚡⚡` medium (1,000–2,500), `⚡⚡⚡` high (>2,500)
6. Writes everything to `website/src/generated/token-counts.json`

The website imports this JSON (via `website/src/lib/token-data.ts`) to display context footprint info on skill and agent doc pages.

**When to run:** after any `SKILL.md` or agent `.md` file is added, removed, or modified — and before release to keep website data in sync.

## Release Workflow

### Packages

| Package | Version file                                              | Changelog             | Tag pattern |
| ------- | --------------------------------------------------------- | --------------------- | ----------- |
| Plugin  | `plugin/.claude-plugin/plugin.json` + root `package.json` | `plugin/CHANGELOG.md` | `v*`        |
| CLI     | `cli/package.json`                                        | `cli/CHANGELOG.md`    | `cli-v*`    |

> Learn MCP, Learn Host, and CF Memory are bundled libs inside CLI — versioned and released as part of CLI.

### Normal Workflow with release process

```
# 1. Code (repeat as needed)
/cf-commit                        # commit (includes secret scan on staged changes)

# 2. Review (before release prep)
# Normally, it will be automatically triggered after each implementation or fix.
/cf-review                        # 4-layer review with proportional security depth

# 3. Prep release (when ready to publish)
/cf-ship                          # bump + changelog + commit + PR (via cf-ship-custom guide)
# → merge PR on GitHub

# 4. Publish (after PR merge)
git checkout main && git pull     # switch to main with latest changes
/release                          # finalize changelogs, create git tags, push → CI publishes
```

`/cf-ship` accepts args for package filter: `/cf-ship cli patch`, `/cf-ship learn-mcp`, etc.

### Bump levels

| Level             | When                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| **PATCH** (x.x.1) | Bug fix, typo, docs update                                           |
| **MINOR** (x.1.0) | New feature, new skill, new hook (backward compatible)               |
| **MAJOR** (1.0.0) | Breaking change (config format, removed skill, changed CLI behavior) |
