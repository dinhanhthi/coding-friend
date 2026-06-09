<p align="center">
  <img src="assets/logo.svg" alt="Coding Friend Logo" width="100" />
</p>

<h1 align="center">Coding Friend</h1>

<p align="center">
  Lean toolkit for disciplined engineering workflows with Claude Code and Codex CLI.
</p>

<p align="center">
  <a href="https://cf.dinhanhthi.com">Website</a> ·
  <a href="https://cf.dinhanhthi.com/docs">Documentation</a> ·
  <a href="https://cf.dinhanhthi.com/changelog">Changelog</a> ·
  <a href="https://github.com/dinhanhthi/coding-friend/issues">Report Bug</a>
</p>

## What It Does

Supported hosts: **Claude Code** and **Codex CLI**. Claude remains the default; Codex is opt-in with `--agent codex` or `--codex`.

Command examples below use Claude's `/cf-*` form. In Codex, invoke the same
skills as `$cf-*` or choose them from `/skills`.

- Supports test-driven development (TDD) — opt-in via `--add-tests` flag or `tdd: true` in config
- Provides systematic debugging methodology
- Quick bug fix workflow (`/cf-fix`)
- Structured optimization with before/after measurement (`/cf-optimize`)
- Quick Q&A about codebase with memory (`/cf-ask`)
- Ensures verification before claiming done
- Smart conventional commits and code review
- ✨ Automated Codex dual review (`/cf-review --with-codex`) — runs Claude's review and a Codex review in parallel, merges both into one report, no copy-paste
- ✨ Cross-agent code review (`/cf-review-out` + `/cf-review-in`) — generate a review prompt for any AI agent (Gemini, Codex, ChatGPT, or human), collect results when ready
- Captures project knowledge across sessions (`/cf-remember`)
- ✨ Persistent AI memory with 3-tier hybrid search (`cf memory`) — stores facts, preferences, debug episodes across sessions with automatic recall
- ✨ Helps humans learn from vibe coding sessions (`/cf-learn` for concise notes, `/cf-teach` for deep conversational breakdowns) — browse as a searchable website (`cf learn host`) or share with other LLM clients via MCP server (`cf mcp`)
- In-depth research with web search and parallel subagents (`/cf-research`)
- Custom skill guides — extend built-in skills with your own Before/Rules/After per skill
- ✨ Session continuity — Claude can save/load synchronized chats with `/cf-session`; Codex uses native `/resume` and `/fork`
- ✨ Smart auto-approve — Claude uses a 3-step hook (rules → working-dir check → Sonnet LLM classifier); Codex uses deterministic rules and defers unknown actions to Codex native approval. Available to all users, opt-in via config
- Prompt injection defense — layered content isolation protects against malicious instructions
- CLI utilities — manage plugin installation, project setup, and updates with a single `cf` command. Claude permissions use `cf permission`; Codex sandbox posture remains native `/permissions`
- ✨ Customizable Claude Code statusline with account info and rate limits; Codex users configure built-in footer fields with `/statusline`
  ```
  🧠 Opus (1M)
  cf v0.3.0 | 📂 MyProject (⎇ main) | 👤 Thi Dinh (me@dinhanhthi.com)
  ctx 42% | [5h] 30% → 2:30pm | [7d] 10% → mar 15, 2:30pm
  🆔 a1b2c3d4-e5f6-7890-abcd-ef1234567890
  📋 Tasks: 2/5 | 🤖 Agent: cf-reviewer
  ```

For full details, visit the **[official website](https://cf.dinhanhthi.com/#features)**.

## Quick Start

Requires [Node.js](https://nodejs.org/) 20+ and at least one supported host: [Claude Code](https://claude.com/claude-code) or Codex CLI.

1. Install the CLI: `npm i -g coding-friend-cli`
2. Install the plugin for your host:

   ```bash
   cf install                 # Claude Code (default)
   cf install --agent codex   # Codex CLI (alias: cf install --codex)
   ```

   > **`cf` conflict?** If another tool (e.g. Cloudflare's `cf`) already occupies that name, use `cdf` — it's an alias for the same CLI: `cdf install`, `cdf init`, etc.

   <details>
   <summary>Or install manually (no CLI)</summary>

   ```bash
   claude plugin marketplace add dinhanhthi/coding-friend
   claude plugin install coding-friend@coding-friend-marketplace

   # Or inside Claude Code session:
   /plugin marketplace add dinhanhthi/coding-friend
   /plugin install coding-friend@coding-friend-marketplace
   ```

   </details>

   Codex CLI note: Codex v0.130.0 can register/upgrade marketplaces from the terminal, but plugin install still requires one manual step inside Codex: open `codex`, run `/plugins`, then install `coding-friend`.

3. Initialize your workspace:

   ```bash
   cf init                 # Claude Code
   cf init --agent codex   # Codex CLI
   ```

4. Restart your host session
5. **(Optional) Host your learning docs** — browse `/cf-learn` and `/cf-teach` notes as a website or expose to other LLM clients:
   ```bash
   cf learn host        # Serve ~/.coding-friend/learn as a website at localhost:3333
   cf mcp               # Setup an MCP server so other LLM clients can read your notes
   ```
   Learn more: [cf learn host](cli/lib/learn-host/README.md), [cf mcp](cli/lib/learn-mcp/README.md).

## CLI vs Plugin — what do you need?

Coding Friend ships as **two independent npm packages**:

- **Plugin** (`coding-friend`) — skills, agents, and hooks installed directly into Claude Code or Codex CLI via the marketplace. Fully functional standalone.
- **CLI** (`coding-friend-cli`, binary `cf`) — optional companion that adds the memory MCP server (fast indexed recall), the learn-host doc viewer, statusline rendering, and workspace setup utilities.

| Tier         | Meaning                                                                                                                            | Count today                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **NONE**     | Works with zero CLI involvement.                                                                                                   | Skills: 9 · Agents: 11 · Hooks: 7 |
| **OPTIONAL** | Uses CLI-installed memory MCP for speed; falls back to grep + direct file writes when CLI is absent. Full functionality preserved. | Skills: 12 · Agents: 1 · Hooks: 3 |
| **REQUIRED** | Cannot function without CLI.                                                                                                       | 0                                 |

**Plugin-only quick-start** — install via Claude Code marketplace, skip the CLI for now. You will lose: fast indexed memory search (falls back to `grep -r '<query>' docs/memory/`), the learn-host doc viewer, and the `cf statusline` renderer. Everything else works.

**Add the CLI later:**

```bash
npm i -g coding-friend-cli
cf init
cf memory init
```

For the full per-skill / per-agent / per-hook matrix and workarounds, see [`docs/cli-requirements.md`](docs/cli-requirements.md).

## Commands

| Command                                         | Description                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/cf-ask [question]`                            | Quick Q&A about codebase                                                                                                                                                                                                          |
| `/cf-commit [hint]`                             | Analyze diff and create conventional commit                                                                                                                                                                                       |
| `/cf-design [mode]` [beta]                      | UI design: scan patterns, design or modify UI consistently                                                                                                                                                                        |
| `/cf-fix [bug]`                                 | Quick bug fix workflow                                                                                                                                                                                                            |
| `/cf-help [question]`                           | Answer questions about Coding Friend                                                                                                                                                                                              |
| `/cf-learn [topic]`                             | Extract learnings for human review                                                                                                                                                                                                |
| `/cf-optimize [target]`                         | Structured optimization with measurement                                                                                                                                                                                          |
| `/cf-plan [task]` \| `/cf-plan --resume <path>` | Brainstorm and write implementation plan; `--resume` resumes an interrupted plan; `--auto` runs the whole thing end-to-end (auto review + fix + commit per phase); `--gui` also generates the human overview doc (off by default) |
| `/cf-remember [topic]`                          | Capture project knowledge                                                                                                                                                                                                         |
| `/cf-research [topic]`                          | In-depth research with web search                                                                                                                                                                                                 |
| `/cf-review [target]`                           | Code review in forked subagent; `--with-codex` adds a parallel Codex review merged into one report                                                                                                                                |
| `/cf-scan [desc]`                               | Scan project and bootstrap memory                                                                                                                                                                                                 |
| `/cf-session` [beta]                            | Save/load Claude Code sessions                                                                                                                                                                                                    |
| `/cf-ship [hint]`                               | Verify, commit, push, and create PR                                                                                                                                                                                               |
| `/cf-teach [topic]`                             | Personal teacher — conversational breakdown                                                                                                                                                                                       |
| `/cf-warm [--user]` [beta]                      | Catch up after absence — git history summary                                                                                                                                                                                      |

Auto-invoked skills (no slash needed): `cf-tdd` (add `--auto` for autopilot review+fix+commit after implementation), `cf-sys-debug`, `cf-verification`.

## CLI Commands

The plugin is managed by the CLI `cf` command. Lifecycle commands (`cf install`, `cf uninstall`, `cf enable`, `cf disable`, `cf update`, `cf init`, `cf permission`) accept `--agent codex` / `--codex` when you want the Codex host instead of the Claude default. Learn more about the CLI in the [CLI documentation](cli/README.md).

## Plugin development

For plugin developers, check [plugin-dev.md](docs/plugin-dev.md).

## Further Reading

Read the [official documentation](https://cf.dinhanhthi.com).

## License

MIT
