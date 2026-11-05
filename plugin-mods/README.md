# Coding Friend Mods

Optional Claude Code mods for [Coding Friend](https://cf.dinhanhthi.com). Mods are function hooks that run inside the Claude Code process, so this plugin can show things the main `coding-friend` plugin cannot: toasts, a band above the prompt and a pane. It needs the main `coding-friend` plugin.

## Features

All four features are **Claude Code mods only**: they do not exist for Codex, Antigravity or Devin.

1. **Quota sensor** (Claude Code mods only): a toast and a band when the 5-hour or 7-day window passes 80%, 90% or 95%, with the reset time. It also writes the quota snapshot `~/.coding-friend/quota/claude.json` that `cf status` reads.
2. **Review and phase toasts** (Claude Code mods only): a toast when `cf-reviewer` finishes, and when autopilot commits a plan phase.
3. **Plan progress pane** (Claude Code mods only): `/cf-plan-status [slug]` opens a pane with the Progress table of a plan in `docs/plans/`.
4. **MCP health band** (Claude Code mods only): a band when `coding-friend-memory` or `coding-friend-learn` is installed but failing.

## Install

At the prompt of a Claude Code session:

```
/plugin install coding-friend-mods@coding-friend-marketplace
```

Or with the Coding Friend CLI (coming soon):

```
cf install --mods
```

## Notes

- Tested with Claude Code 2.1.318. The mods API is early access and may change between releases.
- Fail-soft: every hook catches its own errors and passes the event on, so a broken mod never breaks the session.
- No network: the mods make no network calls.
