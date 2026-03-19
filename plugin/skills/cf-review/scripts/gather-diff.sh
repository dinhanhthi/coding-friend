#!/usr/bin/env bash
# gather-diff.sh — collect git diff output for cf-review
# Usage: bash gather-diff.sh
# Output: full diff + staged diff + recent log

echo "=== git diff HEAD ==="
git diff HEAD 2>/dev/null

echo ""
echo "=== git diff --staged ==="
git diff --staged 2>/dev/null

echo ""
echo "=== git log --oneline -10 ==="
git log --oneline -10 2>/dev/null
