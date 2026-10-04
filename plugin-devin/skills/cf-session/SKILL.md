---
name: cf-session
description: >
  Continue or resume Devin CLI conversations with the native session
  controls. Use when the user asks to resume, continue, or restore a Devin
  session. Devin owns its transcript format, so Coding Friend does not copy
  or rewrite session files.
disable-model-invocation: true
---

# /cf-session

Devin CLI provides native session management:

- Run `devin -r <id>` to resume a session by id (bare `devin -r` opens the picker).
- Run `devin -c` to continue the most recent session.
- Run `devin list` to list sessions (`--format json|csv`); inside the REPL use `/resume` or `/ls`.

Do not run Coding Friend's Claude session scripts or parse Devin session files.
If the user needs cross-machine continuity, explain that native Devin session
availability is the supported path and keep durable project knowledge in `docs/memory/`.

> Plugin root: the `PLUGIN_ROOT:` path in the session bootstrap context (HOST: devin), or the parent of the `skills/` folder that contains this SKILL.md. Replace `<plugin-root>` with it when running bundled scripts.
