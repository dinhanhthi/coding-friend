# Coding Friend

*A lean, opinionated toolkit that makes your AI coding agent work like a disciplined engineer.*

Coding Friend adds skills, agents, and hooks to the agent you already use. It enforces plan → implement → review → commit, and writes knowledge into `docs/`. One install command covers Claude Code and the other supported hosts.

```text
┌─────┐   ┌──────────────┐   ┌────────────────────────┐   ┌───────────┐
│ you │ → │ /cf-* skills │ → │ agents                 │ → │ your repo │
└─────┘   └──────────────┘   │ explorer · planner     │   └───────────┘
                  ↓          │ implementer            │         ↓
          ┌──────────────┐   │ reviewer · writer      │
          │ hooks        │   └────────────────────────┘
          │ auto-approve │   ┌─────────────────────────────────────────┐
          │ security     │   │ docs/ (memory · plans · learn)          │
          │ statusline   │   └─────────────────────────────────────────┘
          └──────────────┘                        ↓
                             ┌─────────────────────────────────────────┐
                             │ CF Memory (MCP) reads and writes docs/  │
                             └─────────────────────────────────────────┘
```

## Supported agents

Coding Friend installs on the host you already use.

| Host | Support | Notes |
| --- | --- | --- |
| Claude Code | 100% | Default. |
| omp | 95% | Beta. Skills come from the Claude plugin cache. |
| Codex CLI | 77% | Beta. Invoke as `$cf-*`. Partial hooks and auto-approve. |
| Antigravity | 73% | Beta. Requires agy >= 1.1.0. No memory auto-capture. |
| Cursor | 100% / 77% | Runs Claude Code / Codex underneath. |
| Grok CLI | 100% / 77% | Same as Cursor. |

% = share of the 11 host-agnostic features (skills, auto-invoked skills, agents, hooks, memory MCP, memory auto-capture, auto-approve, learn host/MCP, cross-agent review, custom guides, CLI lifecycle). Partial = ½.

Claude only: statusline, session save/restore (`/cf-session`), and task tracking. Other hosts ship their own equivalents, so they are not counted.

Install for your host:

| Host | Command |
| --- | --- |
| Claude Code | `cf install` |
| Codex CLI | `cf install --agent codex` |
| omp | `cf install --agent omp` |
| Antigravity | `cf install --agent agy` |
| Cursor | install for the underlying host |
| Grok CLI | install for the underlying host |
