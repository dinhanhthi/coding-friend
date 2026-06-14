---
name: cf-session
description: >
  Continue or branch Codex conversations with the native session controls. Use when the user
  asks to resume, continue, fork, or restore a Codex session. Codex owns its transcript format,
  so Coding Friend does not copy or rewrite session JSONL files.
---

# $cf-session

Codex provides native session management:

- Use `/resume` in the TUI or run `codex resume` to continue a saved conversation.
- Use `/fork` in the TUI or run `codex fork` to branch a conversation.
- Use `/archive` to archive the current conversation without deleting its transcript.

Do not run Coding Friend's Claude session scripts or parse Codex session files. If the user
needs cross-machine continuity, explain that native Codex session availability is the supported
path and keep durable project knowledge in `docs/memory/`.
