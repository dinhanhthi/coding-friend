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

## Local dev mode — run the plugin from this repo

The `cf` CLI is **shared by both hosts**: run `cd cli && npm run build` once (it is
already `npm link`-ed), or keep `npm run dev` running so it rebuilds on save. The two
hosts are independent (`~/.claude` vs `~/.codex`) — you can run both at the same time.

Read more: [Plugin README](plugin/README.md).

### One-time setup

```bash
# Claude Code
cf dev on /path/to/coding-friend                       # switch to the local plugin

# Codex (writes to your real ~/.codex)
npm run build:codex                                    # generate plugin-codex/ from plugin/
codex plugin marketplace add /path/to/coding-friend    # LOCAL path (not the GitHub remote)
cf enable --agent codex                                # enable plugin in ~/.codex/config.toml
#   then in Codex:  /plugins -> install coding-friend  (no scriptable install)
cf init --agent codex --trust-project                  # per project you want it in
```

### Inner loop — after editing `plugin/`

One command refreshes both hosts:

```bash
npm run ud-plugin-local
```

It runs three steps: `build:codex` (regenerate `plugin-codex/` — Codex reads the
artifact, not `plugin/`) → `cf dev sync` (copy `plugin/` into the Claude Code dev
cache) → clear `~/.codex/plugins/cache/coding-friend-marketplace` (so Codex re-copies
on next launch).

Then **restart to load changes**:

- **Codex** — quit and relaunch
- **Claude Code** — restart, or `/plugin` → reload coding-friend

> Edge cases: a **plugin version bump** or a change to `hooks.json` event types needs a
> full reinstall — `cf dev update` (Claude) and reinstall in Codex (`/plugins`). A
> `cli/` change needs nothing (`npm run dev` rebuilds); a **new** CLI command needs
> `cf init` + completion refresh.

### Off / status

```bash
cf dev off       # Claude: switch back to the published (remote) marketplace
cf dev status    # show current mode + marketplace source
# Codex off: in Codex /plugins -> uninstall, then
#   codex plugin marketplace remove coding-friend-marketplace && cf disable --agent codex
```

#### Using a custom `CLAUDE_CONFIG_DIR`

If you develop against a custom Claude config directory (see [Installation → Custom config directory](https://cf.dinhanhthi.com/docs/getting-started/installation/)), the dev plugin must be registered **inside that directory**. `cf dev` honors `CLAUDE_CONFIG_DIR`, but it shares a single dev-state file (`~/.coding-friend/dev-state.json`) across config directories — so if you previously ran `cf dev on` against the default `~/.claude`, re-point it at the custom directory by turning dev mode off and on again **with the variable set**:

```bash
# Reset dev mode into the custom config directory
CLAUDE_CONFIG_DIR=~/.claude-work cf dev off
CLAUDE_CONFIG_DIR=~/.claude-work cf dev on ~/git/coding-friend
```

Then run the inner loop (`cf dev sync`, etc.) and launch Claude Code with the **same** variable so the session loads the dev plugin from the right place:

```bash
CLAUDE_CONFIG_DIR=~/.claude-work cf dev sync
CLAUDE_CONFIG_DIR=~/.claude-work claude
```

Always keep `cf dev` and `claude` on the same `CLAUDE_CONFIG_DIR` — an `export` in your shell profile (or an alias) is the easiest way to avoid a mismatch.

### Codex notes

`cf dev` is Claude-only — Codex loads the **generated** `plugin-codex/` artifact (see
[Codex artifact](#codex-artifact)), which `npm run ud-plugin-local` rebuilds and reloads
for you. A few non-obvious points:

- Do **not** use `cf install --agent codex` to register the local marketplace — it adds
  the GitHub marketplace (`dinhanhthi/coding-friend` = `main`, no Codex code yet). Add the
  local path with `codex plugin marketplace add /path/to/coding-friend`.
- Sandbox option: prefix every `codex` command with `CODEX_HOME=/tmp/cf-codex-dev` to
  avoid touching `~/.codex` (use the same value for **all** `codex` commands in the session).

## Codex artifact

Claude remains the canonical authoring host for plugin source. Codex support is generated from the same source tree:

- Canonical source: `plugin/`
- Generated Codex artifact: `plugin-codex/`
- Agent converter: `scripts/lib/agent-md-to-toml.js`
- Build command: `npm run build:codex`
- Drift check: `npm run verify:codex-drift`

When editing shared plugin source, keep host-specific syntax behind placeholders such as `{{cf:slash ...}}`, `{{cf:agent_ref ...}}`, `{{cf:dispatch ...}}`, `{{cf:plugin_root}}`, and `{{cf:host}}`. Do not hard-code Claude-only command, agent, or plugin-root syntax in files that are copied into `plugin-codex/`.

Host-aware CLI code lives in `cli/src/lib/host.ts`, `cli/src/lib/codex-config.ts`, and the Codex branches of lifecycle commands (`install`, `uninstall`, `enable`, `disable`, `update`, `init`, and `permission`). Codex auto-approve uses `autoApproveCodex` and remains deterministic-only; Claude auto-approve keeps `autoApprove` and the Sonnet classifier.

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
5. Assigns a context tier: `⚡` low (<1,500), `⚡⚡` medium (1,500–3,000), `⚡⚡⚡` high (>3,000)
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
/cf-review                        # 5-layer review with proportional security depth

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
