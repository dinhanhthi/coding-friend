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
- Helps humans learn from vibe coding sessions (`/cf-learn`) — host as a local website (`cf host`) or setup MCP server (`cf mcp`) for other LLM clients
- In-depth research with web search and parallel subagents (`/cf-research`)
- Custom skill guides — extend built-in skills with your own Before/Rules/After per skill
- Prompt injection defense — layered content isolation protects against malicious instructions
- Customizable Claude Code statusline

For full details, visit the **[official documentation](https://cf.dinhanhthi.com)**.

## Quick Start

### 1. Install the CLI

```bash
npm i -g coding-friend-cli
```

### 2. Install the plugin

```bash
cf install
```

> The plugin is installed globally (once for all projects). You can disable it per-project if needed.

### 3. Initialize your project

```bash
cf init
```

This sets up workspace folders (`docs/plans`, `docs/memory`, `docs/research`, `docs/learn`) and optionally adds them to `.gitignore`.

### 4. Restart Claude Code

Restart to load the plugin, then use slash commands like `/cf-plan`, `/cf-fix`, `/cf-commit`, etc.

### 5. Host your learning docs (optional)

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
| `/cf-review [target]`   | Code review in forked subagent              |
| `/cf-commit [hint]`     | Analyze diff and create conventional commit |
| `/cf-ship [hint]`       | Verify, commit, push, and create PR         |
| `/cf-remember [topic]`  | Capture project knowledge                   |
| `/cf-learn [topic]`     | Extract learnings for human review          |
| `/cf-research [topic]`  | In-depth research with web search           |
| `/cf-help [question]`   | Answer questions about Coding Friend        |

Auto-invoked skills (no slash needed): `cf-tdd`, `cf-sys-debug`, `cf-auto-review`, `cf-verification`.

## CLI Commands

```bash
cf install           # Install the plugin into Claude Code
cf uninstall         # Remove the plugin from Claude Code
cf init              # Initialize workspace
cf host [path]       # Serve learning docs at localhost:3333
cf mcp [path]        # Setup MCP server for LLM integration
cf statusline        # Setup statusline
cf update            # Update plugin + CLI + statusline
cf dev on [path]     # Switch to local plugin source
cf help              # Show all commands
```

Learn more about the CLI in the [CLI documentation](cli/README.md).

## Development

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

## Further Reading

| Topic                        | Link                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- |
| Official documentation       | [cf.dinhanhthi.com](https://cf.dinhanhthi.com)                              |
| CLI details                  | [cli/README.md](cli/README.md)                                              |
| Plugin development           | [plugin/README.md](plugin/README.md)                                        |
| Website development          | [website/README.md](website/README.md)                                      |
| Learn Host (local docs site) | [cli/lib/learn-host/README.md](cli/lib/learn-host/README.md)                |
| Learn MCP (MCP server)       | [cli/lib/learn-mcp/README.md](cli/lib/learn-mcp/README.md)                  |
| Workflows guide              | [docs/workflows.md](website/src/content/docs/getting-started/workflows.mdx) |
| Release workflow             | [docs/dev-release.md](docs/dev-release.md)                                  |
| Architecture                 | [docs/architecture.md](docs/architecture.md)                                |

## License

MIT
