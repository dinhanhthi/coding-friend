# Coding Friend

<p align="center">
  <img src="assets/logo.svg" alt="Coding Friend Logo" width="100" />
</p>

Lean toolkit for disciplined engineering workflows with Claude Code.

## ✨ What It Does

- Enforces test-driven development (TDD)
- Provides systematic debugging methodology
- Quick bug fix workflow (`/cf-fix`)
- Ensures verification before claiming done
- Smart conventional commits and code review
- Captures project knowledge across sessions (`/cf-remember`)
- Helps humans learn from vibe coding sessions (`/cf-learn`)
- In-depth research with web search and parallel subagents (`/cf-research`)

## 📦 Installation

- **Prerequisites** (optional): Some skills use the [GitHub CLI (`gh`)](https://cli.github.com/) for creating PRs. Install with `brew install gh && gh auth login`. Without it, skills fall back to manual alternatives.
- Run `claude` and install the plugin from the marketplace:
  ```
  /plugin marketplace add dinhanhthi/coding-friend
  /plugin install coding-friend@coding-friend-marketplace
  ```
- **In each project**, run `/cf-init` to set up the workspace folders (`docs/plans`, `docs/memory`, `docs/research`, `docs/learn`) and optionally add them to `.gitignore`.
- **Enable auto-update**: run `/plugin` > Go to installed plugins > select `coding-friend-marketplace` > Enable auto-update
- **Restart Claude Code** to load the plugin.

<details>
<summary><b>Other installation methods & options</b></summary>

**For local development:**

```bash
git clone https://github.com/dinhanhthi/coding-friend.git
claude --plugin-dir ./coding-friend
```

**Disable for a specific project** — add to `.claude/settings.json` or `.claude/settings.local.json`:

```json
{
  "enabledPlugins": {
    "coding-friend@coding-friend-marketplace": false
  }
}
```

</details>

## 🔧 Manage

```bash
# Update marketplace
/plugin marketplace update
# Update plugin
/plugin update coding-friend@coding-friend-marketplace
# Uninstall plugin
/plugin uninstall coding-friend@coding-friend-marketplace
# Remove marketplace
/plugin marketplace remove coding-friend-marketplace   # Remove marketplace
```

## 🛠️ Skills

### Slash Commands (user triggers)

| Command                | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `/cf-init`             | Initialize workspace folders + optional `.gitignore` setup |
| `/cf-plan [task]`      | Brainstorm and write implementation plan                   |
| `/cf-review [target]`  | Dispatch code review to subagent                           |
| `/cf-commit [hint]`    | Analyze diff and create conventional commit                |
| `/cf-ship [hint]`      | Verify, commit, push, and create PR                        |
| `/cf-fix [bug]`        | Quick bug fix workflow                                     |
| `/cf-remember [topic]` | Extract project knowledge to `docs/memory/`                |
| `/cf-learn [topic]`    | Extract learnings to `docs/learn/`                         |
| `/cf-research [topic]` | In-depth research with web search → `docs/research/`       |
| `/cf-statusline`       | Setup coding-friend statusline                             |
| `/cf-update`           | Update plugin and refresh statusline                       |

### Auto-Invoked (agent loads when relevant)

| Skill             | When                 |
| ----------------- | -------------------- |
| `cf-tdd`          | Writing new code     |
| `cf-sys-debug`    | Debugging bugs       |
| `cf-code-review`  | Reviewing code       |
| `cf-verification` | Before claiming done |

## Hooks

| Hook                    | Event                    | Purpose                                            |
| ----------------------- | ------------------------ | -------------------------------------------------- |
| `session-init.sh`       | SessionStart             | Bootstrap context                                  |
| `dev-rules-reminder.sh` | UserPromptSubmit         | Inject core rules                                  |
| `privacy-block.sh`      | PreToolUse               | Block .env, credentials                            |
| `scout-block.sh`        | PreToolUse               | Block .coding-friend/ignore patterns               |
| `statusline.sh`         | — (via `/cf-statusline`) | Optional statusline (folder, model, branch, usage) |
| `compact-marker.sh`     | PreCompact               | Preserve context                                   |
| `context-tracker.sh`    | PostToolUse              | Track files read                                   |

## Agents

| Agent           | Purpose                               |
| --------------- | ------------------------------------- |
| `code-reviewer` | Multi-layer code review               |
| `implementer`   | TDD implementation                    |
| `planner`       | Codebase exploration + task breakdown |

## Project Structure

```
coding-friend/
├── CLAUDE.md                # Claude Code rules
├── .coding-friend/          # User config (optional)
│   ├── config.json          # Settings
│   └── ignore               # Agent ignore patterns
├── .claude-plugin/          # Plugin + marketplace manifest
├── .claude/                 # Settings + agents
├── hooks/                   # Lifecycle hooks
├── skills/                  # 15 skills
└── docs/                    # Generated docs
    ├── plans/               # Implementation plans
    ├── memory/              # Project knowledge
    ├── learn/               # Human learning notes
    └── research/            # In-depth research results
```

## Usage

### New project from scratch

```
/cf-plan Build a REST API for task management with auth
```

Claude explores requirements, picks an approach, writes a plan to `docs/plans/`. Then implement — TDD is auto-enforced (write test first → make it pass → refactor). When done:

```
/cf-review              # Code review in forked context
/cf-ship Initial API    # Verify → commit → push → PR
/cf-remember auth flow  # Save knowledge for next session
```

### Existing project

Nothing to configure — coding-friend is active globally. On session start, hooks auto-detect project type, package manager, and load ignore patterns.

```
/cf-research React Server Components      # Deep research before planning
/cf-plan Add email notifications when task is assigned
/cf-fix Login fails with 401 when token is valid
/cf-review src/auth/
/cf-learn dependency injection
```

### Daily workflows

| Task               | Command                                                   | What happens                                                                  |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Add feature**    | `/cf-plan [task]` → implement → `/cf-review` → `/cf-ship` | Plan → TDD → review → ship                                                    |
| **Fix bug**        | `/cf-fix [description]`                                   | Reproduce → root cause → fix → verify. Auto-escalates after 3 failed attempts |
| **Review code**    | `/cf-review` or `/cf-review HEAD~3..HEAD`                 | 4-layer review (plan, quality, security, tests) in forked context             |
| **Commit**         | `/cf-commit [hint]`                                       | Runs tests → stages files → conventional commit                               |
| **Debug**          | Describe the bug naturally                                | `cf-sys-debug` auto-loads: investigate → analyze → hypothesis → fix           |
| **Save knowledge** | `/cf-remember [topic]`                                    | Captures logic, conventions, decisions → `docs/memory/`                       |
| **Learn**          | `/cf-learn [topic]`                                       | Extracts concepts from session → `docs/learn/`                                |
| **Research**       | `/cf-research [topic]`                                    | Web search + parallel subagents → structured docs in `docs/research/`         |

## Configuration

### .coding-friend/config.json (optional)

Create `.coding-friend/config.json` in your project to customize settings:

```json
{
  "docsDir": "docs",
  "hooks": {
    "privacyBlock": true,
    "scoutBlock": true,
    "devRulesReminder": true,
    "contextTracker": true
  },
  "commit": {
    "verify": true,
    "conventionalCommits": true
  }
}
```

All fields are optional. Defaults are used when omitted. No file = all defaults.

| Setting                      | Default  | Description                                             |
| ---------------------------- | -------- | ------------------------------------------------------- |
| `docsDir`                    | `"docs"` | Root folder for plans, memory, learn, and research docs |
| `hooks.privacyBlock`         | `true`   | Block access to .env and credentials                    |
| `hooks.scoutBlock`           | `true`   | Block access to .coding-friend/ignore patterns          |
| `hooks.devRulesReminder`     | `true`   | Inject rules on every prompt                            |
| `hooks.contextTracker`       | `true`   | Track files read per session                            |
| `commit.verify`              | `true`   | Run tests before committing                             |
| `commit.conventionalCommits` | `true`   | Enforce conventional commit format                      |

### .coding-friend/ignore

Add patterns to `.coding-friend/ignore` in your project to block agent access:

```
node_modules
dist
build
.next
__pycache__
```

### Statusline (optional)

The plugin ships a statusline script that displays: plugin name, current folder, active model, git branch, usage percentage, and reset time. To set it up:

```
/cf-statusline
```

This automatically configures `~/.claude/settings.json` with the correct path. Restart Claude Code after setup.

Example output:

```
cf v1.2.1 │ DocumentAnalysis │ Opus 4.6 │ ⎇ preprod │ 15% → 13:00
```

Usage percentage is color-coded (green → red) based on utilization level. Requires `~/.claude/fetch-claude-usage.swift` for usage data (macOS only).

### Privacy

The `privacy-block` hook automatically blocks access to:

- `.env` files (except `.env.example`)
- Credential files (`.pem`, `.key`, `id_rsa`)
- SSH directories (`.ssh/`)

Set `"privacyBlock": false` in `.coding-friend/config.json` to disable.

## License

MIT
