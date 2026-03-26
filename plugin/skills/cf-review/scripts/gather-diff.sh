#!/usr/bin/env bash
# gather-diff.sh — collect git diff output for cf-review
# Usage: bash gather-diff.sh
# Output: branch diff (vs base) + uncommitted changes + recent log
#
# Produces three sections:
#   1. Committed changes on current branch vs base (main/master)
#   2. Uncommitted changes (staged + unstaged vs HEAD)
#   3. Recent commit log

# Detect base branch (main or master)
if git rev-parse --verify main >/dev/null 2>&1; then
  BASE_BRANCH="main"
elif git rev-parse --verify master >/dev/null 2>&1; then
  BASE_BRANCH="master"
else
  BASE_BRANCH=""
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

# Section 1: Committed branch changes vs base
# Only shown when on a non-base branch with diverged commits
if [ -n "$BASE_BRANCH" ] && [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]; then
  merge_base=$(git merge-base "$BASE_BRANCH" HEAD 2>/dev/null || true)
  if [ -n "$merge_base" ]; then
    branch_diff=$(git diff "$merge_base"..HEAD 2>/dev/null)
    if [ -n "$branch_diff" ]; then
      echo "=== git diff ${BASE_BRANCH}...HEAD (committed branch changes) ==="
      echo "$branch_diff"
      echo ""
    fi
  fi
fi

# Section 2: Uncommitted changes (staged + unstaged)
uncommitted=$(git diff HEAD 2>/dev/null)
if [ -n "$uncommitted" ]; then
  echo "=== git diff HEAD (uncommitted changes) ==="
  echo "$uncommitted"
  echo ""
fi

# Section 3: Staged-only (shown separately for clarity)
staged=$(git diff --staged 2>/dev/null)
if [ -n "$staged" ]; then
  echo "=== git diff --staged ==="
  echo "$staged"
  echo ""
fi

echo "=== git log --oneline -10 ==="
git log --oneline -10 2>/dev/null
