# coding-friend-cli

CLI companion for the [coding-friend](https://github.com/dinhanhthi/coding-friend) plugin — a lean toolkit for disciplined engineering workflows with Claude Code and Codex CLI.

## Plugin without the CLI?

If you installed the Coding Friend plugin through the Claude Code marketplace but cannot install or run this CLI (npm errors, sandboxed environment, restricted machine), **the plugin still works**. You lose:

- Fast indexed memory search — falls back to `grep -r '<query>' docs/memory/`
- The `coding-friend-learn-host` doc viewer — open `docs/learn/*.md` directly in your editor
- The `cf statusline` renderer — Claude Code's default statusline takes over

Everything else (every skill, every agent, every hook except the three OPTIONAL hooks above) is unaffected. See [`../docs/cli-requirements.md`](../docs/cli-requirements.md) for the full matrix.

### Common CLI install issues

- **`node` not found** — install Node.js 20+ from <https://nodejs.org> (the CLI declares `engines.node >= 20`; older versions will refuse to install).
- **`EACCES` on global install** — set a user-writable global prefix: `npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to your `PATH`.
- **`cf` not on PATH after install** — verify with `npm root -g` and ensure that directory's `bin/` is in your `PATH`.
- **MCP server not appearing in Claude Code** — after install, run `cf mcp` to register both Learn and Memory MCP at user scope, then restart Claude Code.

## Requirements

- Node.js >= 20
- npm (included with Node.js, but on some Linux distros you may need to install it separately)
- The [coding-friend plugin](https://github.com/dinhanhthi/coding-friend) installed in Claude Code or Codex CLI

### Additional requirements for `cf memory init`

The memory system's Tier 1 (SQLite) uses native Node.js modules that require compilation. On **Linux** (Ubuntu/Debian), install the following system packages before running `cf memory init`:

```bash
sudo apt update
sudo apt install -y build-essential python3
```

On **macOS**, install Xcode Command Line Tools:

```bash
xcode-select --install
```

Without these, `cf memory init` will fail when installing SQLite dependencies (`better-sqlite3`, `sqlite-vec`). If you don't need Tier 1, you can choose the **lite** (Tier 2) or **markdown** (Tier 3) tier during init — these have no native dependencies.

## Install

```bash
npm i -g coding-friend-cli
```

## Commands

```bash
cf install              # Install plugin (interactive scope chooser)
cf install --user       # Install at user scope (all projects)
cf install --global     # Same as --user
cf install --project    # Install at project scope (shared via git)
cf install --local      # Install at local scope (this machine only)
cf install --agent codex  # Register/install Coding Friend for Codex CLI
cf install --agent agy    # Google Antigravity (beta); alias --agy
cf install --agent devin  # Devin CLI (beta); alias --devin
cf install --yes        # Skip prompts (default scope: user)
cf install --yes --json # Non-interactive, JSON envelope (needs --yes or a scope flag)
                        # 💡 Safe to run multiple times (idempotent).
cf uninstall            # Uninstall plugin (interactive scope chooser)
cf uninstall --user     # Uninstall from user scope (full cleanup)
cf uninstall --global   # Same as --user
cf uninstall --project  # Uninstall from project scope only
cf uninstall --local    # Uninstall from local scope only
cf uninstall --agent codex  # Disable Coding Friend in Codex CLI
cf uninstall --agent agy    # Google Antigravity (beta); alias --agy
cf uninstall --agent devin  # Devin CLI (beta); alias --devin
                        # 💡 Interactive — asks for confirmation before acting.
cf disable             # Disable plugin (interactive scope chooser)
cf disable --user      # Disable at user scope (all projects)
cf disable --global    # Same as --user
cf disable --project   # Disable at project scope
cf disable --local     # Disable at local scope
                       # 💡 Plugin stays installed but won't load.
cf enable              # Re-enable plugin (interactive scope chooser)
cf enable --user       # Enable at user scope (all projects)
cf enable --global     # Same as --user
cf enable --project    # Enable at project scope
cf enable --local      # Enable at local scope
cf enable --agent devin
                       # 💡 Devin CLI (beta) has no per-plugin enable/disable —
                       #    cf prints guidance instead (alias --devin; same on cf disable).
cf init              # Initialize workspace (interactive)
cf init --agent codex  # Initialize workspace for Codex CLI
cf init --agent agy    # Google Antigravity (beta); alias --agy
cf init --agent devin  # Devin CLI (beta); alias --devin
                     # 💡 You can run this anywhere, anytime.
cf config            # Manage Coding Friend configuration (interactive menu)
                     # 💡 Edit docsDir, language, learn settings, and more.
cf config get [key]  # Show merged config (or one dotted key) and its source
                     # --global / --local read only that file
cf config set <key> <value> --global|--local
                     # Set a dotted key (JSON value, else string); `null` deletes it
                     # 💡 --global or --local is required
cf config schema     # Print the JSON Schema of the config file
cf learn host [path] # Build and serve learning docs at localhost:3333
                     # [path] is optional, default is `~/.coding-friend/learn`
cf learn push [path] # Commit and push learning docs (only if learn dir is the git root)
                     # [path] is optional, default is `~/.coding-friend/learn`
cf mcp [path]        # Setup MCP server for LLM integration
                     # [path] is optional, default is `~/.coding-friend/learn`
                     # This prints a JSON config snippet to add to your client's MCP
                     # Also reports Devin plugin MCP status (no --agent flag on cf mcp)
cf permission              # Manage Claude Code permission rules (interactive)
cf permission --all        # Apply all recommended permissions without prompts
cf permission --user       # Save to user-level settings (~/.claude/settings.json)
cf permission --project    # Save to project-level settings (.claude/settings.local.json)
cf permission --agent codex --enable-auto-approve
cf permission --agent agy  # Antigravity (beta); alias --agy
cf permission --agent devin # Devin CLI (beta); alias --devin
cf permission --all --user # Apply all recommended permissions to user settings
cf statusline        # Setup coding-friend statusline
cf update               # Update plugin + CLI + statusline
                        # 💡 If update fails, open Claude Code (`claude`) and run:
                        #    /plugins → Installed → coding-friend → Update now → /reload-plugins
cf update --cli         # Update only the CLI (npm package)
cf update --plugin      # Update only the Claude Code plugin
cf update --statusline  # Update only the statusline
cf update --agent codex # Update Codex marketplace/plugin cache
cf update --agent agy   # Google Antigravity (beta); alias --agy
cf update --agent devin # Devin CLI (beta); alias --devin
cf update --project     # Update plugin at project scope
cf update --local       # Update plugin at local scope
cf update --check       # Only report installed vs latest versions (read-only)
cf update --check --json  # Same, as a JSON envelope (--json requires --check)
cf dev on [path]     # Switch to local plugin source for development
cf dev off           # Switch back to remote marketplace
cf dev status        # Show current dev mode (local or remote)
cf dev sync          # Sync local changes to cache (no version bump needed)
cf dev restart       # Reinstall local dev plugin (off + on)
cf dev update        # Update local dev plugin to latest version (off + on)
cf memory status     # Show memory system status and stats
cf memory search     # Search memories by keyword
cf memory list              # List all memories in current project
cf memory list --projects   # List all project databases with size and metadata
cf memory rm --project-id <id>  # Remove a specific project database
cf memory rm --all          # Remove all project databases
cf memory rm --prune        # Remove orphaned projects (source dir missing or 0 memories)
cf memory start-daemon  # Start memory daemon (enables Tier 2 search)
cf memory stop-daemon   # Stop memory daemon
cf memory rebuild    # Rebuild search index from markdown files
cf memory init       # Initialize memory system (interactive wizard)
cf memory config     # Configure memory system settings
cf memory mcp        # Show MCP server config for clients
cf status            # Show comprehensive Coding Friend status
                     # (versions, per-host plugin state incl. Devin, memory, config)
cf version           # Show CLI and per-host plugin versions
cf project list      # List registered projects
cf project add [path]    # Register a project (default: current repo root)
cf project remove <path> # Remove a project from the registry
cf clean             # Clean files generated by Coding Friend in docs/
cf session save      # Save current Claude Code session to docs/sessions/
cf session load      # Load a saved session from docs/sessions/
cf task run --provider claude|codex [--read-only] "<prompt>"
                     # Start a detached, sandboxed worker task (see Task runner)
cf task list         # List tasks, newest first
cf task show <id>    # Show a task's state, questions and result
cf task cancel <id>  # Cancel a running task
cf ask "<question>"  # (worker) Ask the user a question and wait for the answer
cf reply --task <id> <qid> "<answer>"  # Answer a task's question
cf done --outcome succeeded|failed --summary "<s>"
                     # (worker) Mark the task finished
cf help              # Show all commands
```

`--json` is accepted by `cf status`, `cf mcp`, `cf version`, `cf memory status|search|list`, `cf config get|set|schema`, `cf project list|add|remove`, `cf task run|list|show|cancel`, `cf ask`, `cf reply`, `cf done`, `cf install` and `cf update --check`. See [Machine interface](#machine-interface).

## Machine interface

With `--json`, a command prints exactly **one** JSON envelope on stdout. Logs, warnings and progress go to stderr. On error the exit code is non-zero (`1`).

```json
{ "contractVersion": 1, "ok": true, "data": { "cli": "1.2.3", "hosts": {} }, "error": null }
{ "contractVersion": 1, "ok": false, "data": null, "error": { "code": "NOT_FOUND", "message": "..." } }
```

`contractVersion` is currently `1` and changes only on a breaking change to the envelope.

| Code                   | Meaning                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `USAGE`                | Unknown command/option or missing argument (commander usage error)  |
| `INVALID_ARGS`         | Bad flag combination or argument (e.g. invalid config key)          |
| `INVALID_VALUE`        | Value fails validation, or a config/registry file is unreadable     |
| `NOT_FOUND`            | Path, registry entry or required tool (e.g. `claude`) not found     |
| `INTERACTIVE_REQUIRED` | Command would prompt; pass `--yes` or a scope flag                  |
| `DEV_MODE_ACTIVE`      | Refused because `cf dev` mode is on                                 |
| `COMMAND_FAILED`       | An underlying command or process failed                             |
| `MEMORY_BUILD_FAILED`  | The memory MCP server could not be built                            |
| `UNEXPECTED_EXIT`      | Process exited before producing a result                            |
| `LEASE_HELD`           | Another writer task is running in this checkout                     |
| `ASK_TIMEOUT`          | `cf ask` got no answer in time; run the same command again          |
| `ALREADY_FINISHED`     | Task is already done or cancelled, or the question already answered |
| `PROVIDER_UNAVAILABLE` | Provider CLI not on PATH, or no worker sandbox (native Windows)     |
| `INTERNAL`             | Any other unexpected error                                          |

**Project registry.** Coding Friend's SessionStart hook records each project (the main repo root, so worktrees collapse into it) in `~/.coding-friend/projects.json`; `cf project` reads and edits it. `$HOME` and `/` are never recorded. Set `CF_PROJECTS_FILE` to use another file. Turn recording off with the `projectRegistry` config key (default `true`; local overrides global), e.g. `cf config set projectRegistry false --global`. The hook reads the local setting from the **main** repo root, but `--local` writes `./.coding-friend/config.json` in the current directory, so run it from the main repo root (not from a worktree or subdirectory).

## Task runner

`cf task run --provider claude|codex [--read-only] "<prompt>"` starts a worker (Claude Code or Codex CLI) in the current checkout and returns its task id at once. There is no daemon: each task gets its own detached runner process that starts the worker, records the result and exits.

```bash
cf task run --provider claude "Fix the flaky date test"
cf task list                             # id, state, provider, age, prompt
cf task show <id>                        # state, pending questions, result
cf reply --task <id> <qid> "Use UTC"     # answer a question the worker asked
cf task cancel <id>
```

The worker asks questions with `cf ask` (waits for your `cf reply`) and finishes with `cf done --outcome succeeded|failed --summary "..."`. Both are already wired into the worker's instructions, with an explicit `--task <id>`.

- **Store.** `~/.coding-friend/orchestrator/` (mode `0700`); set `CF_ORCHESTRATOR_DIR` to move it. For writer and Claude tasks it must be outside the checkout, or `cf task run` refuses.
- **One writer per checkout.** The checkout is the git top-level, so each worktree is its own checkout. A second writer fails with `LEASE_HELD`; `--read-only` tasks take no lease.
- **Sandbox.** Claude runs as `claude -p` with its native sandbox passed per call: enabled, fail if unavailable, no unsandboxed retries. A writer may write the checkout and its own `tasks/<id>/`. A read-only Claude task has Edit/Write disabled and writes to the checkout denied. Codex runs `codex exec --sandbox workspace-write` (writer) or `--sandbox read-only`; read-only Codex tasks cannot use `cf ask`/`cf done`, so their outcome comes from the turn result in the event stream (else the exit code). Your Claude/Codex settings and hooks are never changed.
- **Requirements.** macOS or Linux. Writer tasks and every Codex task must run inside a git repo. The provider CLI (`claude` or `codex`) must be logged in and on `PATH` (missing → `PROVIDER_UNAVAILABLE`).
- **What is stored.** No transcripts and no event logs: the prompt, the worker's questions and your answers, the `cf done` summary and handoff, the session/thread id (plus the Claude transcript path), the result (exit code, outcome, error) and the worker's last message (cut at 4 KB). Worker text is shown as untrusted output, control characters stripped.
- **Approvals.** Coding Friend's auto-approve hook only approves `cf task list|show`. `cf ask`, `cf done`, `cf reply`, `cf task run` and `cf task cancel` are not.

### Known limitations

- The worker inherits your environment, including API keys and tokens.
- The sandbox restricts writes, not reads: a worker can read your home directory (other repos, `~/.ssh`, provider credentials) and other tasks' files. A Codex writer can also write `$TMPDIR` and `/tmp`.
- A writer can modify anything in its checkout, including `.git/hooks` and scripts you run later. Review its changes before running them.
- A reused pid can keep a dead task looking "running". `cf task cancel` still marks it cancelled, and only signals a pid whose command line is that task's runner.
- No quota handling, provider fallback or scheduling yet (no daemon).

## 🐳 CLI Development

To work on the CLI locally:

```bash
cd cli
npm install
npm run build
npm link            # Creates global symlink for `cf` binary
```

Now `cf` is available globally, pointing to your local source. After making changes:

```bash
npm run build       # Rebuild (no need to re-link)
npm run watch       # Auto-rebuild on file changes
```

For development without rebuilding:

```bash
npm run dev -- <command>   # e.g. npm run dev -- init
```

To unlink when done:

```bash
npm unlink -g coding-friend-cli
```

To check if `cf` is pointing to the local plugin source:

```bash
npm ls -g coding-friend-cli
# Result:
# /Users/thi/.nvm/versions/node/v22.21.1/lib
#└── coding-friend-cli@1.1.1 -> ./../../../../../git/coding-friend/cli
```

### Running tests

Tests are written with [Vitest](https://vitest.dev/).

```bash
cd cli

# Run all unit tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run E2E tests (real CLI commands against temp directories)
npm run test:e2e

# Run E2E tests in Docker (isolated, no host pollution)
cd e2e && docker compose up --build --abort-on-container-exit
```

Unit tests live in `src/**/__tests__/` and use mocks. E2E tests live in `e2e/` and run actual CLI commands — see [`e2e/README.md`](e2e/README.md) for details.

## Publish CLI to npm

Publishing is automated via GitHub Actions (`.github/workflows/publish-cli.yml`). Push a tag with the `cli-v*` prefix to trigger it:

```bash
# Bump version in cli/package.json first, then tag and push
git tag cli-v1.2.3
git push origin cli-v1.2.3
```

The workflow will build, bundle, and publish to npm automatically (with provenance), then create a GitHub Release with the changelog for that version.

**Manual publish (if needed):**

```bash
cd cli
npm login              # Login if not already
npm publish            # Build + bundle + publish
```

`prepublishOnly` runs automatically: builds TypeScript → `dist/` and bundles libs from `lib/`.

- Bump `version` in `cli/package.json` before publishing
- First time or public package: `npm publish --access public`
- Package name: `coding-friend-cli` → users install with `npm i -g coding-friend-cli`

## License

MIT
