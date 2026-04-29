#!/usr/bin/env bash
# Probe whether Codex (CLI + plugin) is available for /cf-review-codex.
#
# Emits parseable KEY=value lines to stdout:
#   CODEX_CLI=ok|missing
#   CODEX_AGENT=ok|missing
#   CODEX_READY=true|false
#
# Always exits 0 — the workflow branches on CODEX_READY, not the exit code.
# This is a best-effort probe; the authoritative check is whether the actual
# `Agent(subagent_type="codex:codex-rescue", ...)` dispatch succeeds.

set -u

cli_status="missing"
agent_status="missing"

# 1. Is the codex CLI on PATH?
if command -v codex >/dev/null 2>&1; then
  cli_status="ok"
fi

# 2. Is the codex-rescue agent reachable?
#
# Claude Code resolves plugins through several scopes (user cache, marketplace
# cache, project-local). Rather than guess every path, we look for the canonical
# agent file under any of the well-known locations. As a final hint, we also
# accept `codex doctor` or `codex --version` succeeding alongside the CLI check
# — that means Codex is at least functional even if the plugin file lives
# somewhere this script doesn't know about.
agent_paths=(
  "$HOME/.claude/plugins/cache/openai-codex"
  "$HOME/.claude/plugins/marketplaces/openai-codex"
  "$HOME/.claude/plugins/data/codex-openai-codex"
  "$HOME/.claude/plugins/data/codex-inline"
  "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/plugins"
)

for p in "${agent_paths[@]}"; do
  if [ -d "$p" ] && find "$p" -type f -name "codex-rescue.md" -print -quit 2>/dev/null | grep -q .; then
    agent_status="ok"
    break
  fi
done

# Fallback: if CLI works and plugin file isn't found in known paths, accept the
# agent as "ok" only when `codex doctor` succeeds (means Codex is operational).
# This is a soft signal — Step 8 still has the authoritative dispatch check.
if [ "$agent_status" = "missing" ] && [ "$cli_status" = "ok" ]; then
  if codex doctor >/dev/null 2>&1; then
    agent_status="ok"
  fi
fi

ready="false"
if [ "$cli_status" = "ok" ] && [ "$agent_status" = "ok" ]; then
  ready="true"
fi

echo "CODEX_CLI=${cli_status}"
echo "CODEX_AGENT=${agent_status}"
echo "CODEX_READY=${ready}"
