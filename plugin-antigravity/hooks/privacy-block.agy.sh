#!/usr/bin/env bash
# PreToolUse hook (Antigravity): block access to sensitive files.
#
# Same patterns as privacy-block.sh. Speaks AGY's hook contract:
#   stdin  – JSON with camelCase toolCall.args
#   stdout – {"decision":"allow"} or {"decision":"deny","reason":"..."}
#   Exit 0 always (including deny). Malformed JSON fails open.
#
# Configuration:
#   "privacyBlock": false in .coding-friend/config.json disables the hook.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../lib/agy-hook-io.sh
source "$PLUGIN_ROOT/lib/agy-hook-io.sh"
# shellcheck source=../lib/privacy-patterns.sh
source "$PLUGIN_ROOT/lib/privacy-patterns.sh"
# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"

# Hook cwd is the plugin dir. Read payload first, cd to workspacePaths[0],
# then resolve project config (privacyBlock / .coding-friend/).
agy_read_payload

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

cf_resolve_paths

# Check if hook is disabled via config
CONFIG_FILE="$CF_CONFIG_FILE"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '"privacyBlock"[[:space:]]*:[[:space:]]*false' "$CONFIG_FILE" 2>/dev/null; then
    agy_emit_allow
    exit 0
  fi
fi

# Directory SearchPath values like ~/.ssh have no trailing slash; also check
# the slash-terminated form so '\.ssh/' (and similar) still match.
# Glob Pattern values (*.env, .env*) are de-globbed (* and ? stripped) so
# they still match \.env$ / \.env\.
privacy_agy_denied_pattern() {
  local path="$1"
  local check_path is_safe safe pattern deglobbed
  deglobbed="${path//[*?]/}"
  for check_path in "$path" "${path%/}/" "$deglobbed" "${deglobbed%/}/"; do
    [ -z "$check_path" ] && continue
    is_safe=false
    for safe in "${SAFE_PATTERNS[@]}"; do
      if echo "$check_path" | grep -qiE "$safe"; then
        is_safe=true
        break
      fi
    done
    $is_safe && continue
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
      if echo "$check_path" | grep -qiE "$pattern"; then
        printf '%s\n' "$pattern"
        return 0
      fi
    done
  done
  return 1
}

# bash 3.2 + set -u: skip empty lines from a blank path list.
path_list="$(agy_path_args || true)"
while IFS= read -r path || [ -n "${path:-}" ]; do
  [ -z "${path:-}" ] && continue

  pattern="$(privacy_agy_denied_pattern "$path" || true)"
  if [ -n "$pattern" ]; then
    agy_emit_deny "Access to '$path' blocked by privacy-block. File matches sensitive pattern: $pattern"
    exit 0
  fi
done <<< "$path_list"

agy_emit_allow
