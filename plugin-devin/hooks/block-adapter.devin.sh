#!/usr/bin/env bash
# Devin PreToolUse adapter: wrap a Claude-shaped blocking hook.
#
# Devin's block contract differs from Claude's: plain stdout is ignored and
# blocking requires exit code 2 OR top-level {"decision":"block","reason":...}
# (nested hookSpecificOutput.permissionDecision is Claude-only). This adapter
# runs a sibling hook (e.g. privacy-block.sh, scout-block.cjs) with the same
# stdin, then translates the outcome:
#   inner exit 2   → extract the reason from its JSON stdout
#                    (hookSpecificOutput.permissionDecisionReason, or
#                    decision+reason under hookSpecificOutput or top level),
#                    emit top-level {"decision":"block","reason":...}, exit 2
#   otherwise      → print inner stdout verbatim, exit 0 (an exit other
#                    than 0/2 is logged to $ERR_LOG; inner stderr passes
#                    through to stderr)
#   inner missing or not executable → {} and exit 0 (fail open)
#   name not one of the known hooks → {} and exit 0, logged (never run)
#
# Usage: block-adapter.devin.sh privacy-block.sh|scout-block.cjs

set -uo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
INNER_NAME="${1:-}"
ERR_LOG="${TMPDIR:-/tmp}/cf-hook-errors.log"

# Exact basename allowlist: no path, no "..", only the hooks hooks.json wires
# up (keep in sync with scripts/build-devin-plugin.js).
case "$INNER_NAME" in
  privacy-block.sh | scout-block.cjs) ;;
  *)
    echo "[$(date '+%Y-%m-%dT%H:%M:%S')] block-adapter.devin: refused inner hook name: $INNER_NAME" >>"$ERR_LOG" 2>/dev/null || true
    echo '{}'
    exit 0
    ;;
esac
INNER="$PLUGIN_ROOT/hooks/$INNER_NAME"

if [ -z "$INNER_NAME" ] || [ ! -f "$INNER" ] || [ ! -x "$INNER" ]; then
  echo '{}'
  exit 0
fi

INPUT=$(cat)

# pipefail makes the inner's exit code survive the pipeline; no -e so a
# blocking inner (exit 2) does not abort the adapter. Inner stderr passes
# through to the adapter's stderr: redirecting it to a file that cannot be
# opened would skip the inner hook entirely.
OUT=$(printf '%s' "$INPUT" | "$INNER")
CODE=$?

if [ "$CODE" -ne 0 ] && [ "$CODE" -ne 2 ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] block-adapter.devin: $INNER_NAME exited $CODE; failing open" >>"$ERR_LOG" 2>/dev/null || true
fi

if [ "$CODE" -eq 2 ]; then
  BLOCK_JSON=$(printf '%s' "$OUT" | INNER_NAME="$INNER_NAME" node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      let reason = "";
      try {
        const j = JSON.parse(s);
        const hso = (j && j.hookSpecificOutput) || {};
        if (typeof hso.permissionDecisionReason === "string" && hso.permissionDecisionReason) {
          reason = hso.permissionDecisionReason;
        } else if (hso.decision === "block" && typeof hso.reason === "string" && hso.reason) {
          reason = hso.reason;
        } else if (j.decision === "block" && typeof j.reason === "string" && j.reason) {
          reason = j.reason;
        }
      } catch {
        // Inner output may still be malformed JSON (privacy-block.sh now
        // escapes its reason, but other inner hooks may not) — regex-extract
        // the reason fields before falling back to generic text.
        const m =
          s.match(/"permissionDecisionReason"\s*:\s*"((?:[^"\\]|\\.)*)"/) ||
          s.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) reason = m[1];
      }
      if (!reason) reason = "Blocked by " + process.env.INNER_NAME + " policy";
      process.stdout.write(JSON.stringify({ decision: "block", reason: reason }));
    });
  ' 2>/dev/null || true)
  if [ -z "$BLOCK_JSON" ]; then
    BLOCK_JSON="{\"decision\":\"block\",\"reason\":\"Blocked by $INNER_NAME policy\"}"
  fi
  printf '%s\n' "$BLOCK_JSON"
  exit 2
fi

printf '%s' "$OUT"
exit 0
