#!/usr/bin/env bash
# UserPromptSubmit hook: Inject lightweight development rules reminder.
#
# Fires on every user prompt but only outputs every 4 messages to reduce
# context overhead (~200 tokens × 50 messages = 10k tokens saved).
# Uses a session tmp file to count calls; outputs when count % 4 == 1
# (i.e., messages 1, 5, 9, …).
#
# Output:
#   Plain text <system-reminder> block with core rules and security.

INPUT=$(cat)

# ── Session ID from stdin JSON ──
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
[ -z "$SESSION_ID" ] && SESSION_ID="default"

# ── Message counter ──
COUNTER_FILE="/tmp/cf-rules-reminder-${SESSION_ID}"
COUNT=0
if [[ -f "$COUNTER_FILE" ]]; then
  COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
fi
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE" 2>/dev/null

# Only output on messages 1, 5, 9, … (count % 4 == 1)
if (( COUNT % 4 != 1 )); then
  exit 0
fi

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}}"
# shellcheck source=../lib/rules-reminder-text.sh
source "$PLUGIN_ROOT/lib/rules-reminder-text.sh"
cf_rules_reminder_text
