# Contributing

## Layout

| Path                                   | What it is                                      |
| -------------------------------------- | ----------------------------------------------- |
| `plugin/`                              | The only plugin source tree. Edit here.         |
| `plugin-codex/`, `plugin-antigravity/` | **Generated** artifacts. Never edit by hand.    |
| `cli/`                                 | The `cf` CLI (published as `coding-friend-cli`) |
| `website/`                             | Docs site                                       |

## How local dev works

`cf dev on <repo>` registers your repo as a **directory-source marketplace**:

```bash
claude plugin marketplace add /path/to/coding-friend
claude plugin install coding-friend@coding-friend-marketplace
```

That makes `${CLAUDE_PLUGIN_ROOT}` resolve to `<repo>/plugin`, so **skills,
agents, commands and hooks are read straight from your working tree** — there is
no copy step and nothing to sync.

The install also leaves a snapshot at:

```
~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<version>/
```

Only the statusline reads it, because `cf statusline` writes an absolute path
into `~/.claude/settings.json`. `cf dev sync` is what refreshes that snapshot.

**You never bump the version for local dev.** The version only names the
snapshot folder — the live read path has no version in it. Bumping is a release
step (see [Releasing](#releasing)).

`cf` itself is `npm link`-ed to `cli/`, so a `cli/` rebuild is live immediately.

## Setup (once)

```bash
cd cli && npm run build && cd ..
cf dev on .
cf permission --all --user     # allow-rules for the resolved plugin root
```

Other hosts, if you test on them:

```bash
# Codex — add the LOCAL path, not the GitHub remote
npm run build:codex
codex plugin marketplace add /path/to/coding-friend
cf enable --agent codex
#   then in Codex:  /plugins → install coding-friend
cf init --agent codex --trust-project

# omp
cf install --agent omp
cf init --agent omp

# Antigravity
npm run build:agy
cf install --agent agy
cf init --agent agy
```

## After each change

| You edited                                             | Do this                                      |
| ------------------------------------------------------ | -------------------------------------------- |
| `plugin/skills/`, `plugin/agents/`, `plugin/commands/` | Restart Claude Code                          |
| `plugin/hooks/*.sh` (script contents)                  | Restart Claude Code                          |
| `plugin/hooks/hooks.json` — **new/removed event**      | `cf dev restart`                             |
| `plugin/hooks/statusline.sh`                           | `cf dev sync`, then restart                  |
| `cli/**`                                               | `npm run dev` (or `cd cli && npm run build`) |
| `cli/**` — **new command**                             | `cf init` to refresh completion              |
| Anything, and you test on Codex/omp/Antigravity        | `npm run ud-plugin-local`, restart that host |

`npm run ud-plugin-local` covers every host in one go: regenerates
`plugin-codex/` and `plugin-antigravity/`, refreshes the Claude snapshot,
redeploys omp agents and the Antigravity plugin, and clears the Codex cache so
it re-copies on next launch.

Restart is always required — hosts read the plugin at session start.

## Dev servers

```bash
npm run dev            # all sub-projects in parallel
npm run format         # format the whole repo
npm run format:check   # verify formatting
```

| Sub-project | Port                                           |
| ----------- | ---------------------------------------------- |
| CLI         | — (tsup watch)                                 |
| Website     | [http://localhost:3000](http://localhost:3000) |
| Learn Host  | [http://localhost:3333](http://localhost:3333) |
| Learn MCP   | — (tsc watch)                                  |
| CF Memory   | — (tsc watch)                                  |

Note that `npm run dev` does **not** touch `plugin/` — it only watches `cli/`
and the web sub-projects.

## Turning it off

```bash
cf dev off       # back to the published marketplace
cf dev status    # current mode + marketplace source
```

## Releasing

Version files, bump levels, and the changelog rules live in
[CLAUDE.md](CLAUDE.md#versioning). The flow is `/cf-commit` → `/cf-review` →
`/cf-ship` → merge the PR → `/release` on `main`.

After adding, removing, or editing a `SKILL.md` or agent file, run
`npm run generate:tokens` so the website's context-footprint data stays in sync.

## Reference

- [docs/architecture.md](docs/architecture.md) — plugin vs CLI overview
- [plugin/README.md](plugin/README.md) — `--plugin-dir` and `cf dev` details
- [plugin/omp/README.md](plugin/omp/README.md) — omp bridge runtime
- Build scripts: `scripts/build-codex-plugin.js`,
  `scripts/build-antigravity-plugin.js`, `scripts/update-plugin-local.js`
- Host resolution: `cli/src/lib/host.ts`, `cli/src/lib/paths.ts`
