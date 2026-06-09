# Phase 5: Hooks port

**Plan:** [README.md](./README.md)
**Type:** sequential (5.1 must finish before 5.2 to avoid concurrent edits to hooks fixture infra; 5.3–5.5 can be parallelized if needed but listed sequential here for review clarity)
**Goal:** Adapt every plugin/hooks/_.sh and _.cjs to work under Codex's event/schema differences. Source-of-truth scripts live in `plugin/hooks/`. Where logic diverges enough that one script can't serve both hosts, fork into `<name>.codex.<ext>` and have the build script wire it in `plugin-codex/hooks/hooks.json`.

## Progress

| Status  | Task                                                                 |
| ------- | -------------------------------------------------------------------- |
| ⬜ TODO | 5.1 Update `session-init.sh` to be host-agnostic                     |
| ⬜ TODO | 5.2 Fork `auto-approve.codex.cjs` for PermissionRequest schema       |
| ⬜ TODO | 5.3 Fork `memory-capture.codex.sh` using PreCompact + transcript path |
| ⬜ TODO | 5.4 Port agent tracker; keep task tracker Claude-only                |
| ⬜ TODO | 5.5 Update `hooks.json` build to emit Codex-only event registrations |

## Tasks

1. **5.1 Update `session-init.sh`**
   - Files: `plugin/hooks/session-init.sh` (edit), `plugin/hooks/__tests__/session-init.test.ts` (edit)
   - Change: at top, `PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}}"`. Already similar but make explicit. Add detection of host via `[ -n "${CODEX_SESSION_ID:-}" ]` or env var Codex sets — fallback to `claude` if neither var is set.
   - Add `HOST: claude|codex` line to the emitted `<IMPORTANT>` context block so skills know which host they're on.
   - Bootstrap.md updates (Phase 9) will document the `HOST:` field.
   - Verify: existing Claude session-init test passes; add Codex test that sets `PLUGIN_ROOT` (no `CLAUDE_PLUGIN_ROOT`) and asserts output contains `HOST: codex`.
   - Rollback: revert edits.

2. **5.2 Fork `auto-approve.codex.cjs`**
   - Files: `plugin/hooks/auto-approve.codex.cjs` (new), `plugin/hooks/__tests__/auto-approve.codex.test.ts` (new)
   - Differences from `auto-approve.cjs`:
     - Read `hookEventName = "PermissionRequest"` from stdin JSON
     - Read `tool_name`, `tool_input` per Codex schema (PermissionRequest payload, verified in Phase 0.4)
     - Output `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"|"deny","message":"..."}}}` instead of Claude's `{"decision":"allow"|"deny",...}`
     - Read `autoApprove.codex` (not `autoApprove`) from `.coding-friend/config.json` — default OFF if missing or `false`
     - Deterministic-only v1: safe known patterns may allow, dangerous patterns deny, unknown emits no decision so Codex native approval handles it. Do not call Claude or any LLM classifier from the Codex hook.
   - Verify: fixture tests for safe-tool allow, dangerous-pattern deny, unknown→no decision, config-disabled→no-op
   - Rollback: delete forked file + test.

3. **5.3 Fork `memory-capture.codex.sh`**
   - Files: `plugin/hooks/memory-capture.codex.sh` (new), `plugin/hooks/__tests__/memory-capture.codex.test.ts` (new)
   - Bound to Codex `PreCompact`, because current Codex docs support it. A `Stop` fallback with throttling may be registered only if fixture tests show missed long-session captures.
   - Logic:
     - Read stdin JSON: `session_id`, `transcript_path`, `cwd`, and hook event fields.
     - Prefer `transcript_path`; locate `~/.codex/sessions/YYYY/MM/DD/*.jsonl` by `session_id` if missing.
     - On capture: scan transcript for substantial knowledge signals (same heuristics as Claude version), write capture markdown to `docs/memory/episodes/`, call MCP `memory_store`, update throttle state file
   - Verify: fixture test produces a valid memory file from a Codex JSONL transcript and tolerates missing `transcript_path`.
   - Rollback: delete forked file + test.

4. **5.4 Trackers**
   - Files: `plugin/hooks/agent-tracker.sh`, `plugin/hooks/task-tracker.sh` (edit each)
   - `task-tracker.sh`: add at top `if [ "${CF_HOST:-claude}" = "codex" ]; then exit 0; fi` because Codex has no `TaskCreated` / `TaskCompleted` events.
   - `agent-tracker.sh`: adapt payload parsing for Codex `SubagentStart` / `SubagentStop` and keep Claude behavior unchanged.
   - `CF_HOST` is exported by `session-init.sh` from 5.1
   - Verify: bash test asserts task tracker exits 0 when `CF_HOST=codex`; agent tracker handles Codex payload fixtures.
   - Rollback: revert.

5. **5.5 Build script emits Codex-aware hooks.json**
   - Files: `scripts/build-codex-plugin.js` (edit — extends Phase 3.3)
   - Allowlist Codex events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `PermissionRequest`, `PreCompact`, `SubagentStart`, `SubagentStop`
   - For each Claude hook entry, emit the equivalent for Codex IF event is allowlisted. Substitute:
     - `${CLAUDE_PLUGIN_ROOT}/hooks/auto-approve.cjs` → `${PLUGIN_ROOT}/hooks/auto-approve.codex.cjs` (registered under `PermissionRequest`, not `PreToolUse`)
     - `${CLAUDE_PLUGIN_ROOT}/hooks/memory-capture.sh` (PreCompact) → `${PLUGIN_ROOT}/hooks/memory-capture.codex.sh` under `PreCompact`
     - All other matching events: substitute `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}` and keep
     - DROP entries with matchers like `TaskCreated`, `TaskCompleted`
   - Verify: regenerate `plugin-codex/hooks/hooks.json` and validate against the Codex hooks schema (parse with `codex --validate-hooks` if available, else asserts via shape check)
   - Rollback: revert build script changes.

## Exit criteria

- `plugin-codex/hooks/hooks.json` uses Codex's object shape and contains only Codex-supported events
- `auto-approve.codex.cjs` deny/allow logic matches Claude semantics for the same input
- `memory-capture.codex.sh` produces a memory file from a fixture transcript
- All existing Claude hook tests pass unchanged
- `CF_HOST` env var is set correctly by session-init and consumed by every hook script
