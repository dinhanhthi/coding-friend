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
cf task run --provider claude|codex [--read-only] [--no-fallback] "<prompt>"
                     # Start a detached, sandboxed worker task (see Task runner)
cf task list         # List tasks, newest first
cf task show <id>    # Show a task's state, questions and result
cf task cancel <id>  # Cancel a running or paused task
cf ask "<question>"  # (worker) Ask the user a question and wait for the answer
cf reply --task <id> <qid> "<answer>"  # Answer a task's question
cf done --outcome succeeded|failed --summary "<s>"
                     # (worker) Mark the task finished
cf supervisor install    # Install the launchd agent that adopts paused tasks (macOS)
cf supervisor uninstall  # Remove the launchd agent
cf supervisor status     # Agent, last tick and paused tasks
cf supervisor tick       # One supervisor pass (what launchd runs every minute)
cf chef start <plan-dir> --provider claude|codex [--no-commit]
                     # Start a chef for a plan in this clean checkout (see Chef)
cf chef say <id> "<message>"  # Send the chef a message (also answers its questions)
cf chef status [id]  # State of one chef or of every chef
cf chef inbox [id]   # Chef questions, pauses and quota waits that need you
cf chef show <id>    # Decisions, tasks, commits and plan notes of a chef
cf chef stop <id>    # Stop a chef and free its checkout (its tasks keep running)
cf chef resume <id>  # Resume a paused chef with a new baseline
cf help              # Show all commands
```

`--json` is accepted by `cf status`, `cf mcp`, `cf version`, `cf memory status|search|list`, `cf config get|set|schema`, `cf project list|add|remove`, `cf task run|list|show|cancel`, `cf ask`, `cf reply`, `cf done`, `cf supervisor install|uninstall|status|tick`, `cf chef start|say|status|inbox|show|stop|resume`, `cf install` and `cf update --check`. See [Machine interface](#machine-interface).

## Machine interface

With `--json`, a command prints exactly **one** JSON envelope on stdout. Logs, warnings and progress go to stderr. On error the exit code is non-zero (`1`).

```json
{ "contractVersion": 1, "ok": true, "data": { "cli": "1.2.3", "hosts": {} }, "error": null }
{ "contractVersion": 1, "ok": false, "data": null, "error": { "code": "NOT_FOUND", "message": "..." } }
```

`contractVersion` is currently `1` and changes only on a breaking change to the envelope.

| Code                   | Meaning                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `USAGE`                | Unknown command/option or missing argument; also `cf chef start` and `resume` refusals                          |
| `INVALID_ARGS`         | Bad flag combination or argument (e.g. invalid config key)                                                      |
| `INVALID_VALUE`        | Value fails validation, or a config/registry file is unreadable                                                 |
| `NOT_FOUND`            | Path, registry entry or required tool (e.g. `claude`) not found                                                 |
| `INTERACTIVE_REQUIRED` | Command would prompt; pass `--yes` or a scope flag                                                              |
| `DEV_MODE_ACTIVE`      | Refused because `cf dev` mode is on                                                                             |
| `COMMAND_FAILED`       | An underlying command or process failed                                                                         |
| `MEMORY_BUILD_FAILED`  | The memory MCP server could not be built                                                                        |
| `UNEXPECTED_EXIT`      | Process exited before producing a result                                                                        |
| `LEASE_HELD`           | Another writer task is running in this checkout, it already has a chef, or a chef wake is running               |
| `ASK_TIMEOUT`          | `cf ask` got no answer in time; run the same command again                                                      |
| `ALREADY_FINISHED`     | Task is already done or cancelled, the question already answered, or the chef already stopped                   |
| `PROVIDER_UNAVAILABLE` | Provider CLI not on PATH, no worker sandbox (native Windows), or no launchd (`cf supervisor install` off macOS) |
| `INTERNAL`             | Any other unexpected error                                                                                      |

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

- **Store.** `~/.coding-friend/orchestrator/` (mode `0700`); set `CF_ORCHESTRATOR_DIR` to move it. It must be outside the checkout, or `cf task run` refuses.
- **One writer per checkout.** The checkout is the git top-level, so each worktree is its own checkout. A second writer fails with `LEASE_HELD`; `--read-only` tasks take no lease.
- **Sandbox.** Claude runs as `claude -p` with its native sandbox passed per call: enabled, fail if unavailable, no unsandboxed retries. A writer may write the checkout and its own `tasks/<id>/`. A read-only Claude task has Edit/Write disabled and writes to the checkout denied. Codex runs `codex exec` with a permission profile passed per call (`default_permissions`), based on `:workspace` (writer) or `:read-only`: the store is read-only and only the task's own `tasks/<id>/` is writable, even when the store is under `/tmp`. Your Claude/Codex settings and hooks are never changed.
- **Requirements.** macOS or Linux. Writer tasks and every Codex task must run inside a git repo. The provider CLI (`claude`, or `codex` 0.161.0 or newer) must be logged in and on `PATH` (missing or too old → `PROVIDER_UNAVAILABLE`).
- **What is stored.** No transcripts and no event logs: the prompt, the worker's questions and your answers, the `cf done` summary and handoff, the session/thread id (plus the Claude transcript path), the result (exit code, outcome, error) and the worker's last message (cut at 4 KB). Worker text is shown as untrusted output, control characters stripped.
- **Approvals.** Coding Friend's auto-approve hook only approves `cf task list|show` and `cf chef status|inbox|show`. `cf ask`, `cf done`, `cf reply`, `cf task run`, `cf task cancel` and `cf chef start|say|stop|resume` are not.

### Quota handling

When a worker hits its provider's usage limit, the task does not fail: it moves to the `paused` state, then continues later on the same provider or on the other one. The runner process does this itself (it waits and starts the next attempt in the same process); the [supervisor](#supervisor) only steps in if that runner dies while the task is paused.

**Detection.** The runner reads the worker's own JSON output stream, in memory, for documented quota signals only. It never reads provider tokens or credentials.

- Claude: a `rate_limit_event` with status `rejected` (its `resetsAt` gives the reset time), or, as fallbacks without a reset time, an assistant error `rate_limit` or a final result error with HTTP status 429.
- Codex: an error message starting with "You've hit your usage limit"; a "Try again at ..." time in it (local time) is the reset time, "Try again later." means the reset is unknown.

A quota hit only pauses the task when the attempt failed and the worker had not already called `cf done`.

**Config.** Three optional keys under `task`, read when `cf task run` starts and stored with the task (changing them later does not affect a running task):

| Key                | Values                                                      | Default              |
| ------------------ | ----------------------------------------------------------- | -------------------- |
| `task.onQuota`     | `"wait-then-switch"`, `"wait"`, `"switch"`                  | `"wait-then-switch"` |
| `task.waitMinutes` | integer >= 1                                                | `30`                 |
| `task.fallback`    | non-empty list of `"claude"` and `"codex"`, in switch order | `["claude","codex"]` |

```bash
cf config set task.onQuota switch --global
cf config set task.waitMinutes 45 --local
cf config set task.fallback '["codex","claude"]' --global
cf config set task.onQuota null --global     # remove the key (back to the default)
```

- `wait`: wait for the reset on the same provider and continue there.
- `switch`: move to the next eligible provider in `task.fallback` (round robin) at once. If every other provider is still blocked, wait for whichever frees up first.
- `wait-then-switch`: wait when the reset is within `task.waitMinutes`, switch when it is further away. When the reset time is unknown, wait `task.waitMinutes` once, then switch if the provider is still blocked.
- `cf task run --no-fallback` forces `wait` for that task, whatever `task.onQuota` says.
- A provider is eligible when its CLI is on `PATH` (Codex also needs 0.161.0 or newer and a git checkout). A task that pauses 20 times fails.

**Resume vs switch.** Waiting on the same provider resumes its session (`claude --resume`, `codex exec resume`) with a one-line "continue where you left off" prompt. Switching provider always starts a new session whose prompt is a context bundle written by Coding Friend: the original prompt, plus the previous worker's handoff and last message as untrusted notes (size-limited), and an instruction to inspect the checkout with `git status` and `git diff` first. The runner does not run git in your checkout; the next worker inspects it itself, inside its sandbox. If a session cannot be resumed, the runner starts one fresh attempt on the same provider with a bundle instead. The sandbox is the same for every attempt.

**Waiting.** The runner waits by the wall clock (it re-checks every 30 seconds, so sleep or a clock change is fine) and notices `cf task cancel`.

**Paused tasks keep the writer lease.** The task will continue in the same checkout, so no other writer may take it. To free the checkout, run `cf task cancel <id>`.

**Run directory.** Control records live in `runs/<id>/` of the store, outside `tasks/<id>/`, because the worker can write its own task directory and must not forge them. Directories are `0700` and files `0600`; records are written once (`runner.log` is appended to).

- `dispatch.json`: the task digest, whether the checkout is a git repo, and the policy.
- `<n>/` for each attempt: `attempt.json` (provider and kind: `fresh`, `resume` or `switch`), `runner.json`, `session.json`, `pause.json` (provider, reset time, source, last message) and `context-bundle.md` (when the attempt started from a bundle).
- `runner.log`: the runner's stdout and stderr.

Tasks started before this feature (no `runs/<id>/`) run as before, with a single attempt.

**`cf task list` and `cf task show`.** A paused task shows as `paused (resets <local time>)` or `paused (reset unknown)`. `show` adds an `attempts:` list (number, provider, kind, pid, session, pause source and reset). When a task is paused, its runner is gone and no supervisor tick ran in the last 3 minutes, a hint is printed on stderr (a `hint` field with `--json`) suggesting `cf supervisor tick`, `cf supervisor install` or `cf task cancel <id>`.

### Supervisor

`cf supervisor` runs a short pass, the tick, that adopts paused tasks whose runner is gone (for example after a reboot or a kill). There is no daemon: the tick starts, does one pass and exits. Without it, a runner that is still alive keeps waiting by itself, and `cf supervisor tick` can be run by hand.

```bash
cf supervisor install [--label <label>] [--json]    # install the launchd agent (macOS)
cf supervisor uninstall [--label <label>] [--json]  # unload the agent and remove its plist
cf supervisor status [--label <label>] [--json]     # agent, last tick, paused tasks
cf supervisor tick [--json]                         # one pass; works on any platform
```

`--label` defaults to `com.coding-friend.supervisor`. `install` writes `~/Library/LaunchAgents/<label>.plist` and loads it into your GUI session; running it again updates it in place. The plist has:

- `ProgramArguments`: the `node` and `cf` currently running, then `supervisor tick`.
- `StartInterval` 60 (a tick every minute) and `RunAtLoad` (a tick at login, so paused tasks are picked up after a reboot).
- `StandardOutPath` and `StandardErrorPath`: `<store>/supervisor/tick.log`.
- `EnvironmentVariables`: only `PATH` (your shell's, captured at install) and `CF_ORCHESTRATOR_DIR` (the store, captured at install).

What a tick does: it records a heartbeat (`<store>/supervisor/heartbeat.json`), then looks only at paused tasks whose latest runner is dead. It re-checks the task file against its recorded digest, decides the next step with the same rules as the runner, and, once the wait is over, claims the next attempt and starts a new detached runner for it. Tasks with a live runner and tasks started before this feature are never touched. Overlapping ticks cannot start two runners for the same attempt. Then, unless `chef.enabled` is `false` in the global config, it runs the chef pass: it records trigger events and starts a detached wake for each chef that has one pending (see [Chef](#chef)). A tick is stopped by a watchdog after 45 seconds.

`cf supervisor status` prints the agent state (plist, loaded or not), the heartbeat age and `paused: N (M orphaned)`, where orphaned means no live runner.

- **macOS only for `install` and `uninstall`.** Off macOS they fail with `PROVIDER_UNAVAILABLE` and print a crontab line to use instead, `* * * * * PATH=... <node> <cf> supervisor tick`. It includes `PATH` because cron's own `PATH` does not contain `claude` or `codex`. `status` prints the same line.
- **Minimal environment.** launchd gives the tick only the variables above. Credentials that exist only in your shell environment (for example an API key you export) are not available to runners started by a tick, after a reboot or otherwise. Log in to the provider in a way that persists (its own login or keychain).
- **Reinstall after changes.** After upgrading Node (for example with nvm) or `cf`, or installing a provider CLI that changes your `PATH`, run `cf supervisor install` again. `status` warns when a path in the plist no longer exists.
- **Sessions.** `install` needs a logged-in GUI session; over SSH into a machine with nobody logged in, launchctl may refuse it.
- **Login Items.** macOS lists the agent under System Settings > General > Login Items under the name of whoever signed your `node` binary (for example "Node.js Foundation" for the official installer, or just "node") and may notify you when it is added. If it is switched off there, launchd stops running the tick without any error; `cf supervisor status` then shows `loaded: no` and an old heartbeat. Switch it back on, or run `cf supervisor install` again.

### Chef

A chef is a read-only Claude Code or Codex session that drives one plan in one checkout. It never edits files: each time the [supervisor](#supervisor) tick wakes it, it reads a digest written by Coding Friend (and the checkout, by absolute path) and answers with structured actions: dispatch a worker task, answer a worker's question, ask you, commit, pause or note. Coding Friend checks every action against fixed rules, then runs it.

```bash
cd ~/code/my-app                      # run from inside the checkout
cf chef start docs/plans/my-feature --provider claude   # prints the chef id
cf chef status                        # state, wakes, running tasks, inbox count
cf chef inbox                         # questions, pauses and quota waits that need you
cf chef say <id> "Skip task 3, it is done"   # talk to the chef or answer its question
cf chef show <id>                     # decisions, tasks, commits, plan notes
cf chef resume <id>                   # after a pause
cf chef stop <id>
```

**Start.** The checkout is the git top-level of the current directory, so run `cf chef start` from inside it. `<plan-dir>` (relative to the current directory, or absolute) must resolve to a directory strictly inside the checkout. Start refuses, and creates nothing, when:

- the directory is not a git checkout, HEAD is detached, or the store is inside the checkout (`USAGE`);
- the plan dir does not exist (`NOT_FOUND`) or is outside the checkout;
- the checkout already has a chef, even for another plan (`LEASE_HELD`; of two concurrent starts only one wins);
- the checkout is not clean: any change against HEAD (staged or not), untracked files that are not ignored, or anything Coding Friend cannot hash (a FIFO or socket, a nested git repo, an unsafe path name). Commit or stash first. A checkout too big to fingerprint (over 50,000 paths or 512 MiB) is refused too (`COMMAND_FAILED`);
- `PATH` has an empty or relative entry, `git` or the chosen provider is not on `PATH`, or `git`, `claude` or `codex` resolves inside the checkout, where a task could replace it;
- the provider cannot run a chef (`PROVIDER_UNAVAILABLE`): Claude Code older than 2.1.248 or whose `claude --help` lacks `--safe-mode` or `--add-dir`, Codex older than 0.161.0, or native Windows;
- there is no git identity: `user.name` and `user.email` (or `author.*` and `committer.*`) must be set in `~/.gitconfig` or the repo config. Chef git calls ignore `XDG_CONFIG_HOME` (so `~/.config/git/config` is not read) and every `GIT_*` variable.

Start pins what every wake uses: the git dir (read from `.git` in Node), the branch and its sha, the absolute paths of `git`, `claude` and `codex` found on `PATH`, the `chef.*` limits and `task.*` policy, the active hooks, and a baseline (a fingerprint of the clean tree plus snapshots of the repo guard and steering files, see below). It warns when `commit.gpgSign` is true or filter drivers are configured, since those commits will be refused (consider `--no-commit`), and suggests `cf supervisor install` when no tick ran in the last 3 minutes.

**Wakes.** There is no daemon. The tick (every minute under launchd, or `cf supervisor tick` by hand) records trigger events, each fired once, and starts a detached wake (`cf chef _wake <id> <n>`) for a chef with one pending:

- the start itself (the first wake);
- a chef task ended (succeeded, failed, cancelled or interrupted), asked a question with `cf ask`, or was resumed or switched provider after a quota;
- a `cf chef say` message;
- a `chef.schedule` slot (`HH:MM`, local time; only the latest due slot of the day);
- the chef's own quota reset (see below);
- a wake that had rejected actions, so the chef sees why in the next digest;
- a commit CF made for the chef, so it plans the next step or reports the plan done.

A wake never runs in the checkout: its working directory is an empty directory in the store. Claude runs as `claude -p --restricted --safe-mode --add-dir <checkout> --tools Read Grep Glob` (no CLAUDE.md, skills, plugins, hooks or MCP), Codex as `codex exec` with a read-only permission profile; each wake resumes the previous session. Before the chef runs, the wake compares the working tree with the last known state and checks the guards, then writes the digest: goal, events, tasks, pending questions, limits, what the commit gate still needs, hooks, and then worker and user text as untrusted, fenced data. A wake is killed after 15 minutes. Its result is written once, before its actions run, so a wake that dies is never replayed; a failed or quota wake consumes no event, so they wait for the next wake.

A Claude chef keeps the system prompt of its first wake for its whole session: after upgrading `cf`, a running chef keeps the old contract until you stop it and start a new one.

**Limits.** Read once at `cf chef start` from the merged config (global, then the local config of the current directory) and stored with the chef; later changes do not affect it. `chef.enabled` is the exception (see below).

| Key                       | Values                               | Default |
| ------------------------- | ------------------------------------ | ------- |
| `chef.enabled`            | boolean, global config only, live    | `true`  |
| `chef.commit`             | boolean                              | `true`  |
| `chef.notify`             | boolean (macOS notifications)        | `true`  |
| `chef.schedule`           | list of `"HH:MM"` (24 h, local time) | `[]`    |
| `chef.minWakeMinutes`     | integer >= 1                         | `5`     |
| `chef.maxWakesPerDay`     | integer >= 1                         | `48`    |
| `chef.maxTasksPerWake`    | integer >= 1                         | `3`     |
| `chef.maxConcurrentTasks` | integer >= 1                         | `2`     |

```bash
cf config set chef.schedule '["09:00","18:00"]' --global
cf config set chef.enabled false --global    # kill switch for every chef
```

- `minWakeMinutes` is the gap after the end of the last wake; events wait, they are not dropped.
- `maxWakesPerDay` counts wakes in a sliding 24-hour window (wakes that ended on the chef's quota are not counted); reaching it pauses the chef.
- Dispatches over `maxTasksPerWake` or `maxConcurrentTasks` (running tasks included) are rejected, and only one writer or check task runs at a time. A wake has at most 20 actions and one commit. Rejected actions are reported in the next digest; 3 wakes in a row with rejected actions pause the chef.
- `chef.enabled` is read only from the global config (`~/.coding-friend/config.json`), never from a project, and on every use: when it is `false`, ticks wake no chef and a running wake skips its remaining dispatches and commits.

**Tasks.** The chef's tasks are ordinary `cf task` workers in its checkout (`cf task list|show|cancel` work on them), with the `task.*` quota policy captured at start. Role `writer` and `check` tasks take the writer lease, `other` tasks are read-only. Each prompt starts with a Coding Friend line telling the worker not to run `git commit`, `git add` or any git command that changes the repository, and not to edit the plan folder. A worker's `cf ask` wakes the chef, which may answer it.

**Commits.** Coding Friend makes the commit, never the chef or a worker, and only when the commit gate passes:

- commits are on (`chef.commit` and no `--no-commit`);
- no writer or check task is running;
- the latest writer succeeded and was dispatched after the latest baseline (start or resume);
- a check task dispatched after that writer passed. A check passes by outcome, not by its role: it succeeded and left tracked files and non-ignored untracked files exactly as they were (ignored build output and caches may change);
- the working tree is still what the writer left;
- every path is one of the changed paths, inside the checkout, not under `.git` and not a steering path; the message is one line of at most 100 characters.

The commit is built with git plumbing from bytes Coding Friend read and hashed itself: `hash-object --no-filters`, `update-index` in a temporary index, `commit-tree --no-gpg-sign`, then a compare-and-swap `update-ref` of the branch; the real index is then updated for those paths. Coding Friend never runs `git add`, `git commit`, `git status` or any other git command that reads the working tree, because a writer can plant filters, fsmonitor settings or hooks there. It never pushes or creates a branch.

**Hooks do not run.** Chef commits skip every repository hook. The hooks found at start (the files in `core.hooksPath`, or in `.git/hooks` without it) are listed in the digest, and the chef is told to dispatch a writer task that does what they would do (for example `npm run build:*` to regenerate generated files) and to include the generated paths in the commit. A hook that only checks (lint, tests) can be run as a check task.

**Refused commits.** A commit that would differ from what `git add` and `git commit` make is refused: `commit.gpgSign` is true, a path has a `filter` (Git LFS included), `ident` or `working-tree-encoding` attribute, content has CRLF that git would convert (`text`, `eol` or `crlf` attributes, or `core.autocrlf`), a path is a gitlink (submodule), or a change is only in the index. A refused or failed commit goes to `cf chef inbox` and pauses the chef. For such repos, start with `--no-commit`: the chef still dispatches and checks, and you commit.

**Steering guard.** Files that steer agents or git can never be committed by a chef, and a change to them pauses it: the plan dir, the root `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` and `.gitmodules`, `.githooks/`, the repo hooks dir when inside the checkout, every `.gitattributes`, and `.git/info/attributes`. A repo guard does the same for the git config (every scope, so editing `~/.gitconfig` pauses the chef too), the `.git` entry and git dir, hook files and `info/exclude`. Not watched: `.claude/**`, and `CLAUDE.md` or `AGENTS.md` in subdirectories (the chef never loads them: `--safe-mode`, or Codex from an empty directory); tasks may change and commit those. The walk skips `node_modules/` and nested git repositories, and more than 2,000 steering files, 32 MiB or 500,000 directory entries pauses the chef. Dispatch prompts asking to edit a steering path are also rejected, by a text heuristic (a sentence that forbids it, such as "do not edit CLAUDE.md", passes).

**Pause and resume.** A chef pauses itself (a `pause` action), or Coding Friend pauses it when: the working tree changed while no chef writer or check task was running (your own edits included), a guard changed, a commit was refused or failed, the daily cap was reached, or 3 wakes in a row had rejected actions. A paused chef is not woken. `cf chef resume <id>`:

- does not need a clean checkout, unlike `start`. It takes the current state as the new baseline: the current sha of the chef's branch (`refs/heads/<branch>`, so commits you made yourself are accepted) as the known HEAD, a new fingerprint (uncommitted changes included) and new guard snapshots. It also resets the rejected-wake count;
- refuses when HEAD is not on the branch recorded at start (`USAGE`), or while a wake is running (`LEASE_HELD`: wait for it to end);
- does not relax the commit gate: only a writer dispatched after the resume, then a passing check, can lead to a commit, so changes you left uncommitted are never committed without them;
- only applies to a paused chef (`USAGE` otherwise). If you change the checkout under an active chef, its next wake pauses it; then resume it to accept your changes.

**Chef quota.** When the chef's own provider hits its usage limit, the wake ends with outcome `quota` and the chef shows `quota-wait`; it never switches provider. The next wake comes 60 seconds after the reset (30 minutes after the hit when the reset time is unknown), resumes the same session and carries every event that waited. The chef's worker tasks follow [Quota handling](#quota-handling).

**Plan progress.** The plan belongs to you: the chef never edits it and tasks are told not to. Progress lives in the store, as the chef's decisions: `cf chef show` lists its notes with their wake number, then its dispatches, commits and questions. Update the plan files yourself; this is a steering change, so the chef pauses, and `cf chef resume` makes the new plan its baseline.

**Inbox, notifications, statusline.** `cf chef inbox` lists the chef's questions since your last `say` or `resume`, the reason of a pause, and quota waits; stopped chefs are left out. A finished plan has no special item: the chef's contract tells it to report it with a question and a pause. Answer with `cf chef say <id> "<answer>"`. On macOS, with `chef.notify` on, a question or pause from a wake also shows a notification. The statusline shows `chef N!` (N = unseen questions plus paused chefs), read from `<store>/chefs/summary.json`; nothing is shown when N is 0.

**Stop.** `cf chef stop <id>` stops the wakes and frees the checkout, so another chef can start there. It does not cancel the chef's running tasks: it lists them with the `cf task cancel <id>` to run. A stopped chef cannot be messaged or resumed (`ALREADY_FINISHED`, also on a second `stop`).

**launchd PATH.** Wakes run in the tick's minimal environment. The chef itself uses the `git` and provider paths pinned at start, but its worker tasks find `claude` and `codex` on the tick's `PATH`, captured at `cf supervisor install`. Install the supervisor from a shell whose `PATH` has the providers, and run it again when that changes.

**Store.** Each chef has `<store>/chefs/<id>/` (`chef.json`, wakes, events, decisions, tasks, commits, questions, messages, pauses, resumes) and holds `<store>/chefs/by-checkout/<sha256>.json` for its checkout. Workers cannot write there: Claude workers are denied `chefs/` and Codex workers get the store read-only.

**`--json`.** Every `cf chef` command takes `--json`. `status` returns one view (`id`, `state` `active|paused|stopped|quota-wait`, `reason`, `wakes`, `lastWake`, `runningTasks`, `inbox`, ...) with an id and an array of views without; `inbox` returns items with `kind` `ask`, `paused` or `quota`; `start` returns `chefId`, `branch`, `headAtStart`, `commit` and `warnings`.

### Known limitations

- The worker inherits your environment, including API keys and tokens (a runner started by a launchd-run tick gets only the minimal launchd environment; a tick run by hand passes your full environment).
- The sandbox restricts writes, not reads: a worker can read your home directory (other repos, `~/.ssh`, provider credentials) and other tasks' files. A Codex writer can also write `$TMPDIR` and `/tmp` (outside the store).
- If the store is placed in a directory the worker can write (for example Claude's per-user temp dir `/tmp/claude-<uid>`), the trusted `runs/`, `leases/`, `runner/` and `supervisor/` dirs are still protected, but a Claude worker could write other tasks' directories there (Codex workers get the whole store read-only). Keep the default store location.
- A writer can modify anything in its checkout, including `.git/hooks` and scripts you run later. Review its changes before running them.
- A reused pid can keep a dead task looking "running". `cf task cancel` still marks it cancelled, and only signals a pid whose command line is that task's runner.
- Quota signal shapes are partly unverified against real runs: Claude's `rate_limit_event` `resetsAt` was seen in seconds (a value above 1e12 is still read as milliseconds), but a real `rejected` event and the exact text and time format of Codex's usage-limit message were only tested with recorded or injected samples. If a provider changes them, a quota hit shows up as a normal failure instead of a pause.
- There is no check before a run: a task starts even if the provider is already out of quota, and only reacts once the worker hits the limit.
- `cf supervisor install` supports macOS (launchd) only; elsewhere use the cron line it prints.
- Chefs: Coding Friend cannot tell your edits from a worker's, so editing the checkout while a chef has no writer or check running pauses it (`cf chef resume` accepts the changes). Hooks never run on chef commits, and repos with filters (Git LFS), CRLF conversion, `commit.gpgSign` or changed submodules need `--no-commit`. The steering prompt check is a text heuristic; the guards and the commit path rules are what enforce it. A Codex chef also receives your own `~/.codex/AGENTS.md` (Codex has no switch to skip it): keep it free of rules that conflict with the chef contract, or use a Claude chef.
- There is no general scheduler: the only background work is adopting paused tasks and waking chefs (`chef.schedule` slots are chef triggers, not jobs).

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
