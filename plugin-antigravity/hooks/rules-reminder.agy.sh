#!/usr/bin/env bash
# PreInvocation hook (Antigravity): inject lightweight development rules.
#
# Same reminder text as rules-reminder.sh. Fires every 4th invocationNum
# (4, 8, 12, …) so it does not collide with session-init.agy.sh on
# invocationNum 1. Other invocations emit {}.
#
# Speaks AGY's hook contract:
#   stdin  – JSON with invocationNum
#   stdout – {"injectSteps":[{"ephemeralMessage":"..."}]} or {}

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../lib/agy-hook-io.sh
source "$PLUGIN_ROOT/lib/agy-hook-io.sh"
# shellcheck source=../lib/rules-reminder-text.sh
source "$PLUGIN_ROOT/lib/rules-reminder-text.sh"

agy_read_payload

INV="$(agy_field invocationNum || true)"
INV="${INV//$'\n'/}"
INV="${INV//$'\r'/}"

case "$INV" in
  ''|*[!0-9]*)
    agy_emit_empty
    exit 0
    ;;
esac

if [ "$INV" -eq 0 ] || [ $((INV % 4)) -ne 0 ]; then
  agy_emit_empty
  exit 0
fi

MSG="$(cf_rules_reminder_text)"
agy_emit_inject "$MSG"
