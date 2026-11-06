---
name: cf-session
description: >
  Continue or branch Codex conversations with the native session controls, and list, read or
  export (redacted) Codex sessions with the Coding Friend CLI. Use when the user asks to resume,
  continue, fork, restore, list or export a Codex session.
---

# $cf-session

Codex provides native session management:

- Use `/resume` in the TUI or run `codex resume` to continue a saved conversation.
- Use `/fork` in the TUI or run `codex fork` to branch a conversation.
- Use `/archive` to archive the current conversation without deleting its transcript.

The Coding Friend CLI reads Codex sessions (it never writes them):

- `cf session list --json --provider codex` lists them, newest first (`--provider` exists
  only on `list`).
- `cf session show --json -- codex:<thread-id>` prints one session's turns, redacted.
- `cf session export --json -- codex:<thread-id>` exports it as redacted Markdown (tool output
  left out by default; redaction is best effort, so read it before sharing).

There is no save or load for Codex sessions: to continue one, use `codex resume` or
`codex fork`. Keep durable project knowledge in `docs/memory/`.
