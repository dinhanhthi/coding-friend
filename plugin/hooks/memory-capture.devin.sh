#!/usr/bin/env bash
# PostCompaction shim (Devin): defer the memory-capture prompt.
#
# Devin fires PostCompaction with a `summary` payload, but injected
# additionalContext is NOT delivered to the model on that event (verified).
# Instead of printing the prompt, this hook drops a marker that
# rules-reminder.devin.sh consumes on the next UserPromptSubmit — the real
# capture text runs there via memory-capture.sh, whose own
# memory.autoCapture config gate still applies (it exits empty when
# disabled), so the marker is written unconditionally.
#
# Marker dir defaults to /tmp; CF_DEVIN_MARKER_DIR overrides it (tests).
# Always exit 0, no stdout.

set -uo pipefail

MARKER_DIR="${CF_DEVIN_MARKER_DIR:-/tmp}"

INPUT=$(cat)

SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
[ -z "$SESSION_ID" ] && SESSION_ID="default"
SESSION_ID="${SESSION_ID//\//_}"

touch "$MARKER_DIR/cf-devin-compacted-$SESSION_ID" 2>/dev/null || true
exit 0
