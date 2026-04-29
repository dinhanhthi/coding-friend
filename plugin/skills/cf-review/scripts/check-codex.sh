#!/usr/bin/env bash
# check-codex.sh — determine whether Codex cross-engine review should run
# Usage: bash check-codex.sh <MODE>
# Output: KEY=value lines (parseable by the caller)
#   CODEX_ENABLED=true|false
#   CODEX_EFFORT=minimal|low|medium|high|xhigh
# Reads .coding-friend/config.json (local overrides global at $HOME).

MODE="${1:-}"
LOCAL_CONFIG=".coding-friend/config.json"
GLOBAL_CONFIG="$HOME/.coding-friend/config.json"

CODEX_CFG_ENABLED="unset"
CODEX_CFG_MODES="unset"
CODEX_EFFORT="unset"

# Note: jq's `//` operator treats `false` the same as null, so we use `has()`
# to distinguish "key absent" (→ "unset") from "key set to false".
JQ_ENABLED='if (.codex // {} | has("enabled")) then (.codex.enabled | tostring) else "unset" end'
JQ_MODES='if (.codex // {} | has("modes")) then (.codex.modes | if type == "array" then join(",") else tostring end) else "unset" end'
JQ_EFFORT='if (.codex // {} | has("effort")) then .codex.effort else "unset" end'

if [ -f "$LOCAL_CONFIG" ]; then
  CODEX_CFG_ENABLED=$(jq -r "$JQ_ENABLED" "$LOCAL_CONFIG" 2>/dev/null)
  CODEX_CFG_MODES=$(jq -r "$JQ_MODES" "$LOCAL_CONFIG" 2>/dev/null)
  CODEX_EFFORT=$(jq -r "$JQ_EFFORT" "$LOCAL_CONFIG" 2>/dev/null)
fi

if [ -f "$GLOBAL_CONFIG" ]; then
  [ "$CODEX_CFG_ENABLED" = "unset" ] && CODEX_CFG_ENABLED=$(jq -r "$JQ_ENABLED" "$GLOBAL_CONFIG" 2>/dev/null)
  [ "$CODEX_CFG_MODES" = "unset" ] && CODEX_CFG_MODES=$(jq -r "$JQ_MODES" "$GLOBAL_CONFIG" 2>/dev/null)
  [ "$CODEX_EFFORT" = "unset" ] && CODEX_EFFORT=$(jq -r "$JQ_EFFORT" "$GLOBAL_CONFIG" 2>/dev/null)
fi

# Treat empty (jq parse failure on malformed JSON) the same as unset.
[ "$CODEX_CFG_ENABLED" = "unset" ] || [ -z "$CODEX_CFG_ENABLED" ] && CODEX_CFG_ENABLED="false"
[ "$CODEX_CFG_MODES" = "unset" ] || [ -z "$CODEX_CFG_MODES" ] && CODEX_CFG_MODES="STANDARD,DEEP"
[ "$CODEX_EFFORT" = "unset" ] || [ -z "$CODEX_EFFORT" ] && CODEX_EFFORT="medium"

CODEX_ENABLED="false"
if [ -n "$MODE" ] && [ "$CODEX_CFG_ENABLED" = "true" ] && command -v codex >/dev/null 2>&1; then
  case ",$CODEX_CFG_MODES," in
    *,"$MODE",*) CODEX_ENABLED="true" ;;
  esac
fi

echo "CODEX_ENABLED=${CODEX_ENABLED}"
echo "CODEX_EFFORT=${CODEX_EFFORT}"
