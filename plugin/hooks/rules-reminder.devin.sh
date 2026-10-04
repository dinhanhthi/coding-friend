#!/usr/bin/env bash
# UserPromptSubmit shim (Devin): wrap rules-reminder.sh output as JSON.
#
# rules-reminder.sh prints PLAIN TEXT, which Devin ignores on every event —
# context injection requires hookSpecificOutput.additionalContext JSON.
# This shim pipes the same stdin through the inner hook and re-emits
# non-empty text as {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit",
# "additionalContext":...}}.
#
# It also consumes the compaction marker written by memory-capture.devin.sh:
# Devin's PostCompaction additionalContext is NOT delivered to the model, so
# the capture prompt is deferred to the next prompt — the marker triggers a
# memory-capture.sh run (same stdin; it exits empty when memory.autoCapture
# is disabled, enforcing the config gate itself) whose output is appended to
# the injected context, with "Before context is compacted" rewritten to
# "Context was just compacted".
#
# Marker dir defaults to /tmp; CF_DEVIN_MARKER_DIR overrides it (tests).

set -uo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MARKER_DIR="${CF_DEVIN_MARKER_DIR:-/tmp}"

INPUT=$(cat)

# ── Session ID from stdin JSON (same extraction as rules-reminder.sh) ──
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
[ -z "$SESSION_ID" ] && SESSION_ID="default"
SESSION_ID="${SESSION_ID//\//_}"

# ── Inner reminder: plain text on messages 1, 5, 9, …; empty otherwise ──
REMINDER_OUT=$(printf '%s' "$INPUT" | "$PLUGIN_ROOT/hooks/rules-reminder.sh" 2>/dev/null || true)

# ── Compaction marker → deferred memory-capture prompt ──
CAPTURE_OUT=""
MARKER="$MARKER_DIR/cf-devin-compacted-$SESSION_ID"
if [ -f "$MARKER" ]; then
  rm -f "$MARKER"
  CAPTURE_OUT=$(printf '%s' "$INPUT" | "$PLUGIN_ROOT/hooks/memory-capture.sh" 2>/dev/null \
    | sed 's/Before context is compacted/Context was just compacted/g' || true)
fi

COMBINED=""
if [ -n "$REMINDER_OUT" ]; then
  COMBINED="$REMINDER_OUT"
fi
if [ -n "$CAPTURE_OUT" ]; then
  if [ -n "$COMBINED" ]; then
    COMBINED="$COMBINED
$CAPTURE_OUT"
  else
    COMBINED="$CAPTURE_OUT"
  fi
fi

if [ -z "$COMBINED" ]; then
  exit 0
fi

# JSON-escape via node (stdin-derived text is untrusted)
CTX="$COMBINED" node -e '
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: process.env.CTX,
    },
  }));
'
exit 0
