<p align="center"><img src="assets/logo.svg" alt="Coding Friend Logo" width="100" /></p>

<h1 align="center">Coding Friend</h1>

<p align="center"><em>A lean, opinionated toolkit that makes your AI coding agent work like a disciplined engineer.</em></p>

<p align="center"><a href="https://cf.dinhanhthi.com">Website</a> · <a href="https://github.com/dinhanhthi/coding-friend/releases">Releases</a> · <a href="https://github.com/dinhanhthi/coding-friend/issues">Report Bug</a> · <a href="https://github.com/dinhanhthi/coding-friend/discussions">Discussions</a></p>

## What it does

Coding Friend adds skills, agents, and hooks to the agent you already use. You get plan → implement → review → commit, with project knowledge in `docs/` and learn notes in `~/.coding-friend/learn/`. One install covers [Claude Code](https://claude.com/product/claude-code) (principal); pass `--agent` for [Codex](https://openai.com/codex/), oh-my-pi, Cursor, Grok CLI, or Antigravity.

Read more in [website/src/content/index.md](website/src/content/index.md).

## Supported agents

| Host              | Support  | Install                        |
| ----------------- | -------- | ------------------------------ |
| Claude Code       | **100%** | `cf install`                   |
| omp               | **95%**  | `cf install --agent omp`       |
| Codex CLI         | **77%**  | `cf install --agent codex`     |
| Antigravity       | **73%**  | `cf install --agent agy`       |
| Cursor / Grok CLI |          | comes with Claude Code         |
| ZCode             |          | install via github marketplace |

% = Claude is a baseline with all skills, agents, hooks. Some are **Claude only**: statusline, session save/restore (`/cf-session`), and task tracking. Other hosts ship their own equivalents, so they are not counted.

## Quick start

Requires Node.js 20+ and a host.

```bash
npm i -g coding-friend-cli
# If `cf` is taken, use `cdf`

cf install               # Claude Code (default)
cf install --agent codex # or 'omp', 'agy'

cf init                  # per project: docs/, .coding-friend/config.json
cf update                # later: pull the newest plugin

# Need help?
cf help

# Get Started in any project
cf init
```

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

## Features

- Plan with autopilot (`/cf-plan --auto`)
- TDD, opt-in (`--add-tests`)
- Systematic debugging
- Code review + cross-agent review
- Conventional commits & ship
- Persistent memory, 3-tier search (`cf memory`)
- Learn & teach (`/cf-learn`, `/cf-teach`, `cf learn host`, `cf mcp`)
- Research (`/cf-research`)
- Smart auto-approve
- Prompt-injection defense
- Custom skill guides
- Sessions & checkpoints
- Statusline (Claude only)
  ```
  🧠 Opus (1M)
  cf v0.42.1 | 📂 MyProject (⎇ main) | 👤 Thi Dinh (me@dinhanhthi.com)
  ctx 42% | [5h] 30% → 2:30pm | [7d] 10% → mar 15, 2:30pm
  🆔 a1b2c3d4-e5f6-7890-abcd-ef1234567890
  📋 Tasks: 2/5 | 🤖 Agent: cf-reviewer
  ```

Details: [website/src/content/index.md#-features](website/src/content/index.md#-features)

## Skills

`/cf-advise`, `/cf-ask`, `/cf-checkpoint`, `/cf-checkpoint-from`, `/cf-commit`, `/cf-design`, `/cf-fix`, `/cf-help`, `/cf-later-do`, `/cf-learn`, `/cf-optimize`, `/cf-plan`, `/cf-plan-resume`, `/cf-remember`, `/cf-research`, `/cf-review`, `/cf-review-in`, `/cf-review-out`, `/cf-scan`, `/cf-session`, `/cf-ship`, `/cf-teach`, `/cf-warm`

Auto-invoked: `cf-tdd`, `cf-sys-debug`, `cf-verification`

Details: [website/src/content/index.md#-features](website/src/content/index.md#-features)

## Agents

`cf-explorer`, `cf-implementer`, `cf-planner`, `cf-reviewer`, `cf-reviewer-plan`, `cf-reviewer-quality`, `cf-reviewer-reducer`, `cf-reviewer-rules`, `cf-reviewer-security`, `cf-reviewer-tests`, `cf-writer`, `cf-writer-deep`

Details: [website/src/content/index.md#-agents](website/src/content/index.md#-agents)

## CLI

`cf` (`coding-friend-cli`) manages install/init/update/memory/learn/statusline; host flags `--agent codex|omp|agy` (aliases `--codex`/`--omp`/`--agy`). See [cli/README.md](cli/README.md) and [docs/cli-requirements.md](docs/cli-requirements.md).

## Development

[docs/plugin-dev.md](docs/plugin-dev.md) — Claude, Codex, omp, and Antigravity local-dev in one place.

## License

MIT
