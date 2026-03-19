#!/usr/bin/env bash
# analyze-changes.sh — show git status and diffs for cf-commit analysis
echo "=== git status ==="
git status 2>/dev/null

echo ""
echo "=== git diff ==="
git diff 2>/dev/null

echo ""
echo "=== git diff --staged ==="
git diff --staged 2>/dev/null

echo ""
echo "=== git log --oneline -5 ==="
git log --oneline -5 2>/dev/null
