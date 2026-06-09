# Phase 0 Probe Results

**Date:** 2026-06-09
**Codex CLI:** `codex-cli 0.130.0`
**Probe mode:** local CLI checks, isolated `CODEX_HOME=/private/tmp/cf-codex-home`, and current official Codex docs.

## Summary

Codex can preserve more Coding Friend behavior than the original May plan assumed. Current Codex docs now cover plugin skills, plugin hooks, `PreCompact`, `SubagentStart`, `SubagentStop`, `session_id`, `transcript_path`, and the `CLAUDE_PLUGIN_ROOT` compatibility alias. The remaining non-parity areas are:

- **Plugin install UX:** `codex plugin marketplace add` is non-interactive, but it only registers the marketplace. A plugin still needs installation from the Codex plugin directory. `enabled = true` in config is not enough for a not-yet-installed local plugin.
- **Task tracker:** Codex has no `TaskCreated` / `TaskCompleted` hook event equivalent.
- **Structured questions:** no Codex equivalent of Claude's `AskUserQuestion` UI; use plain natural-language choices.
- **Fire-and-forget agents:** no background subagent dispatch; Codex waits for subagent results.
- **Plan mode UI:** no Claude-style accept-plan surface; use durable plan files plus natural-language confirmation.
- **Scheduler / wakeup tools:** no Codex equivalent for `/loop`-style timed re-entry.
- **Plugin auto-update:** use `cf update --agent codex` / `codex plugin marketplace upgrade`; no Claude-style auto-update flag found.

## Probe Details

### 0.1 `CLAUDE_PLUGIN_ROOT` alias

Official Codex plugin docs state plugin hook commands receive `PLUGIN_ROOT` and `PLUGIN_DATA`, and Codex also sets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for compatibility.

Decision: keep source hooks compatible with both hosts. Build output should still prefer `${PLUGIN_ROOT}` in Codex artifacts, but the alias means existing hook scripts have a compatibility fallback.

### 0.2 SKILL.md discovery

Official Codex plugin docs use the same `skills/<name>/SKILL.md` shape with `name` and `description` frontmatter. Local installed Codex plugins also use `skills/*/SKILL.md`.

Decision: plugin skills remain bundled in `plugin-codex/skills/`. The build transform should strip or preserve only fields Codex accepts if any Claude-specific frontmatter appears.

### 0.3 Codex session JSONL format

Observed files live under `~/.codex/sessions/YYYY/MM/DD/*.jsonl`.

Top-level line shapes observed:

- `{"type":"session_meta","payload":{...}}` with `id`, `timestamp`, `cwd`, `originator`, `cli_version`, `source`, `model_provider`, and `git`.
- `{"type":"event_msg","payload":{...}}` for events such as `task_started`, `user_message`, `agent_message`, `token_count`, and review-mode messages.
- `{"type":"response_item","payload":{"type":"message",...}}` for model-visible messages.
- `{"type":"response_item","payload":{"type":"function_call", "name": "...", "arguments": "...", "call_id": "..."}}` for tool calls.
- `{"type":"response_item","payload":{"type":"function_call_output", "call_id": "...", "output": "..."}}` for tool results.
- `{"type":"response_item","payload":{"type":"reasoning", ...}}` for reasoning items; content may be encrypted.

Current hook docs also document `session_id` and `transcript_path` as common hook input fields. `transcript_path` is convenient but explicitly not a stable hook API, so memory capture should tolerate missing or changed transcript files.

Decision: Codex memory capture can read `transcript_path` when supplied, fall back to locating the session JSONL by `session_id`, and parse only stable outer fields.

### 0.4 PermissionRequest output schema

Official docs define `PermissionRequest` input fields: `turn_id`, `tool_name`, and `tool_input`. `Bash` and `apply_patch` use `tool_input.command`.

Decision output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow"
    }
  }
}
```

Deny uses `behavior: "deny"` plus `message`. If no Codex auto-approve rule matches, the hook should emit no decision and let Codex's normal approval flow continue. Do not port Claude's LLM classifier in v1.

### 0.5 GATING: agent discovery

Official Codex subagent docs say custom agents are standalone TOML files under `~/.codex/agents/` for personal agents or `.codex/agents/` for project-scoped agents. Plugin docs list skills, hooks, MCP servers, apps, and assets as plugin components, but do not list top-level plugin-bundled agents.

Decision: generate agent TOMLs into `plugin-codex/agents/` as a build artifact, but `cf install --agent codex` copies those TOMLs into `~/.codex/agents/`. `cf init --agent codex` may also write project-scoped copies under `<project>/.codex/agents/` when project-local install is requested.

### 0.6 GATING: non-interactive marketplace add

Local probe:

```bash
CODEX_HOME=/private/tmp/cf-codex-home codex plugin marketplace add /private/tmp/cf-codex-probe
```

Result: succeeded non-interactively and wrote `[marketplaces.cf-codex-probe-marketplace]` to `config.toml`.

Decision: `cf install --agent codex` can run `codex plugin marketplace add dinhanhthi/coding-friend` non-interactively and handle already-registered config idempotently.

### 0.7 GATING: plugin install without TUI

Local probe after marketplace add:

```toml
[plugins."cf-codex-probe@cf-codex-probe-marketplace"]
enabled = true
```

Then:

```bash
CODEX_HOME=/private/tmp/cf-codex-home codex debug prompt-input '$cf-probe'
```

Result: the probe skill did not appear in the model-visible skill list. The config flag alone does not install a marketplace plugin that has not been installed by Codex's plugin directory.

Decision: v1 `cf install --agent codex` registers the marketplace, deploys generated agent TOMLs, registers MCP, and prints a required manual step: open Codex, use the plugin directory (`/plugins` / Plugins UI), and install `coding-friend` once. `cf enable --agent codex` and `cf disable --agent codex` can still toggle an already-installed plugin.

## Plan Corrections

- Phase 4 install UX must use the manual plugin install fallback.
- Phase 5 should use current Codex hook shape: `{"hooks": {"Event": [...]}}`, not Claude's array shape.
- Phase 5 memory capture can keep `PreCompact` parity and use `Stop` as an optional fallback, not as the primary workaround.
- Phase 5 agent tracker can port to Codex `SubagentStart` / `SubagentStop`; task tracker stays Claude-only.
- Phase 5 auto-approve must be deterministic-only for Codex v1.
- Phase 6 must deploy agents to `~/.codex/agents/` or project `.codex/agents/`; plugin-bundled `agents/` are only a build staging artifact.
