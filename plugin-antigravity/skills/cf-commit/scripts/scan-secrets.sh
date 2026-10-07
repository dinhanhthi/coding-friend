#!/usr/bin/env bash
# scan-secrets.sh — scan staged changes for potential secrets
# Output: SECRETS=<count> then matching lines (if any)

PATTERN="(api[_-]?key|token|password|secret|private[_-]?key|credential)"

# grep -c already prints 0 on no match (but exits 1) — don't append a second 0
SECRETS=$(git diff --cached 2>/dev/null | grep -c -iE "$PATTERN")
SECRETS=${SECRETS:-0}
echo "SECRETS=${SECRETS}"

if [ "${SECRETS}" -gt 0 ]; then
  echo ""
  echo "=== Matches (with context) ==="
  git diff --cached 2>/dev/null | grep -iE -C2 "$PATTERN"
fi
