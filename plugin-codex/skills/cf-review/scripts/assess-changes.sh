#!/usr/bin/env bash
# assess-changes.sh — gather git diff metrics for cf-review depth determination
# Usage: bash assess-changes.sh
# Output: KEY=value lines (parseable by the caller)

FILES_CHANGED=$(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')
LINES_CHANGED=$(git diff --stat HEAD 2>/dev/null | tail -1 | grep -oE '[0-9]+ insertion|[0-9]+ deletion' | grep -oE '[0-9]+' | paste -sd+ - | bc 2>/dev/null || echo 0)
SENSITIVE=$(git diff --name-only HEAD 2>/dev/null | grep -ciE "(auth|security|crypto|token|session|middleware|api/|login|password|secret|\.env)" 2>/dev/null)
SENSITIVE="${SENSITIVE:-0}"
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | tr '\n' ' ')

echo "FILES_CHANGED=${FILES_CHANGED}"
echo "LINES_CHANGED=${LINES_CHANGED}"
echo "SENSITIVE=${SENSITIVE}"
echo "CHANGED_FILES=${CHANGED_FILES}"

# Determine mode
if [ "${SENSITIVE}" -gt 0 ] || [ "${FILES_CHANGED}" -gt 10 ] || [ "${LINES_CHANGED}" -gt 300 ]; then
  echo "MODE=DEEP"
elif [ "${FILES_CHANGED}" -ge 4 ] || [ "${LINES_CHANGED}" -ge 51 ]; then
  echo "MODE=STANDARD"
else
  echo "MODE=QUICK"
fi
