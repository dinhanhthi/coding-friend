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
#   otherwise      → print inner stdout verbatim, exit 0
#   inner missing or not executable → {} and exit 0 (fail open)
#
# Usage: block-adapter.devin.sh <inner-script-name>

set -uo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
INNER_NAME="${1:-}"
INNER="$PLUGIN_ROOT/hooks/$INNER_NAME"

if [ -z "$INNER_NAME" ] || [ ! -f "$INNER" ] || [ ! -x "$INNER" ]; then
  echo '{}'
  exit 0
fi

INPUT=$(cat)

# pipefail makes the inner's exit code survive the pipeline; no -e so a
# blocking inner (exit 2) does not abort the adapter.
OUT=$(printf '%s' "$INPUT" | "$INNER" 2>/dev/null)
CODE=$?

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
        // Inner output may be malformed JSON (e.g. privacy-block.sh
        // interpolates a regex like \.env$ unescaped) — regex-extract the
        // reason fields before falling back to generic text.
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
