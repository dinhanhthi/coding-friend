<p align="center">
  <img src="assets/logo.svg" alt="Coding Friend Logo" width="100" />
</p>

<h1 align="center">Coding Friend</h1>

<p align="center">
  Lean toolkit for disciplined engineering workflows with Claude Code.
</p>

<p align="center">
  <a href="https://cf.dinhanhthi.com">Website</a> ·
  <a href="https://cf.dinhanhthi.com/docs">Documentation</a> ·
  <a href="https://cf.dinhanhthi.com/changelog">Changelog</a> ·
  <a href="https://github.com/dinhanhthi/coding-friend/issues">Report Bug</a>
</p>

> [!WARNING]
> This repository is in heavy development, use at your own risk.

## What It Does

- Enforces test-driven development (TDD)
- Provides systematic debugging methodology
- Quick bug fix workflow (`/cf-fix`)
- Structured optimization with before/after measurement (`/cf-optimize`)
- Quick Q&A about codebase with memory (`/cf-ask`)
- Ensures verification before claiming done
- Smart conventional commits and code review
- Captures project knowledge across sessions (`/cf-remember`)
- ✨ Persistent AI memory with 3-tier hybrid search (`cf memory`) — stores facts, preferences, debug episodes across sessions with automatic recall
- ✨ Helps humans learn from vibe coding sessions (`/cf-learn`) — host as a local website (`cf host`) or setup MCP server (`cf mcp`) for other LLM clients
- In-depth research with web search and parallel subagents (`/cf-research`)
- Custom skill guides — extend built-in skills with your own Before/Rules/After per skill
- ✨ Save and load Claude Code session chats across machines and accounts (`/cf-session`)
- Prompt injection defense — layered content isolation protects against malicious instructions
- ✨ Customizable Claude Code statusline with API rate limit tracking
  ```
  cf v0.3.0 | 📂 MyProject (⎇ main) | 🧠 Opus (1M)
  ctx 42% | [5h] 30% → 2:30pm | [7d] 10% → mar 15, 2:30pm
  ```

For full details, visit the **[official documentation](https://cf.dinhanhthi.com)**.

## How it works

Main workflow:

<p align="center">
  <img src="assets/workflow.png" alt="Workflow" width="100%" />
</p>

Memory architecture (read more about it [here](https://cf.dinhanhthi.com/docs/reference/memory-system/)):

<p align="center">
  <img src="assets/memory.png" alt="Memory Architecture" width="100%" />
</p>

## Quick Start

### 1. Install the CLI

```bash
# npm
npm i -g coding-friend-cli

# yarn
yarn global add coding-friend-cli

# pnpm
pnpm add -g coding-friend-cli
```

### 2. Install the plugin

```bash
cf install              # Interactive — asks which scope to use
cf install --user       # All projects (default)
cf install --project    # This project only (shared via git)
cf install --local      # This machine only (gitignored)
```

> Supports user, project, and local scopes. All features work identically across scopes.

### 3. Initialize your project

```bash
cf init
```

This sets up workspace folders (`docs/plans`, `docs/memory`, `docs/research`, `docs/learn`) and optionally adds them to `.gitignore`.

### 4. Restart Claude Code

Restart to load the plugin, then use slash commands like `/cf-plan`, `/cf-fix`, `/cf-commit`, etc.

### 5. Enable AI memory (optional)

The memory system stores project knowledge (facts, conventions, debug episodes) and recalls them automatically in future sessions. Basic memory works immediately, but you can enable better search:

```bash
cf memory start      # Start daemon with fuzzy search (Tier 2)
cf memory init       # Initialize SQLite with hybrid search (Tier 1)
cf memory status     # Check current tier and document count
```

Then bootstrap memory with project knowledge inside Claude Code:

```
/cf-scan This is a Next.js app with PostgreSQL and Stripe
```

This scans your project and creates ~10-15 memories covering architecture, conventions, and key features. Safe to run multiple times.

Learn more: [cf memory](cli/README.md#cf-memory), [Memory System](https://cf.dinhanhthi.com/docs/reference/memory-system/).

### 6. Host your learning docs (optional)

The `/cf-learn` skill generates learning notes from your coding sessions. You can browse them as a website or expose them to other LLM clients:

```bash
cf host              # Serve docs/learn/ as a website at localhost:3333
cf mcp               # Setup an MCP server so other LLM clients can read your notes
```

Learn more: [cf host](cli/lib/learn-host/README.md), [cf mcp](cli/lib/learn-mcp/README.md).

## Commands

| Command                 | Description                                 |
| ----------------------- | ------------------------------------------- |
| `/cf-plan [task]`       | Brainstorm and write implementation plan    |
| `/cf-fix [bug]`         | Quick bug fix workflow                      |
| `/cf-ask [question]`    | Quick Q&A about codebase                    |
| `/cf-optimize [target]` | Structured optimization with measurement    |
| `/cf-scan [desc]`       | Scan project and bootstrap memory           |
| `/cf-review [target]`   | Code review in forked subagent              |
| `/cf-commit [hint]`     | Analyze diff and create conventional commit |
| `/cf-ship [hint]`       | Verify, commit, push, and create PR         |
| `/cf-session`           | Save/load Claude Code sessions              |
| `/cf-remember [topic]`  | Capture project knowledge                   |
| `/cf-learn [topic]`     | Extract learnings for human review          |
| `/cf-research [topic]`  | In-depth research with web search           |
| `/cf-help [question]`   | Answer questions about Coding Friend        |

Auto-invoked skills (no slash needed): `cf-tdd`, `cf-sys-debug`, `cf-auto-review`, `cf-verification`.

## CLI Commands

The plugin is managed by the CLI `cf` command. Learn more about the CLI in the [CLI documentation](cli/README.md).

## Plugin development

For plugin developers, check [plugin-dev.md](docs/plugin-dev.md).

## Further Reading

Read the [official documentation](https://cf.dinhanhthi.com).

## License

MIT
