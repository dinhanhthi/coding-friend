#!/usr/bin/env bash
# PreInvocation hook (Antigravity): inject the dynamic session header.
#
# Fires on every PreInvocation. invocationNum 0 or 1 injects context
# (AGY docs do not specify 0- vs 1-based); later invocations emit {}.
#
# Hook cwd is the plugin dir, so detection cd's to workspacePaths[0].
# Injects the dynamic HOST header only — not bootstrap.md (that ships
# later as rules/AGENTS.md). ephemeralMessage is capped at 12,000 chars.
#
# Speaks AGY's hook contract:
#   stdin  – JSON with invocationNum, workspacePaths
#   stdout – {"injectSteps":[{"ephemeralMessage":"..."}]} or {}

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../lib/agy-hook-io.sh
source "$PLUGIN_ROOT/lib/agy-hook-io.sh"
# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"
# shellcheck source=../lib/session-detect.sh
source "$PLUGIN_ROOT/lib/session-detect.sh"

agy_read_payload

INV="$(agy_field invocationNum || true)"
INV="${INV//$'\n'/}"
INV="${INV//$'\r'/}"

case "$INV" in
  0|1) ;;
  *)
    agy_emit_empty
    exit 0
    ;;
esac

WS="$(agy_field 'workspacePaths[0]' || true)"
WS="${WS//$'\n'/}"
WS="${WS//$'\r'/}"
case "$WS" in
  "~") WS="$HOME" ;;
  "~/"*) WS="$HOME/${WS#\~/}" ;;
esac
if [ -n "$WS" ] && [ -d "$WS" ]; then
  cd "$WS"
fi

CF_HOST="agy"
export CF_HOST PLUGIN_ROOT

cf_resolve_paths
cf_detect_session

DOCS_DIR="$CF_DOCS_ROOT"

CONTEXT="<IMPORTANT>
HOST: $CF_HOST
PROJECT_TYPE: $PROJECT_TYPE
PKG_MANAGER: $PKG_MANAGER
DOCS_DIR: $DOCS_DIR
MAIN_REPO_ROOT: $MAIN_REPO_ROOT
CF_DOCS_ROOT: $CF_DOCS_ROOT
CFIGNORE: $CFIGNORE_PATTERNS
</IMPORTANT>"

EPHEMERAL_MAX=12000
if [ "${#CONTEXT}" -gt "$EPHEMERAL_MAX" ]; then
  CONTEXT="${CONTEXT:0:$EPHEMERAL_MAX}"
fi

agy_emit_inject "$CONTEXT"
