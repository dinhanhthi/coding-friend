#!/usr/bin/env bash
# gather-diff.sh — collect git diff output for cf-review
# Usage: bash gather-diff.sh
# Output: metadata block + branch diff (vs base) + uncommitted changes + recent log
#
# Produces:
#   0. Metadata block (machine-readable summary of what's included)
#   1. Committed changes on current branch vs base (main/master)
#   2. Uncommitted changes (staged + unstaged vs HEAD) for tracked files
#   3. Untracked files (new files not yet git-added)
#   4. Recent commit log

# Detect base branch (main or master)
if git rev-parse --verify main >/dev/null 2>&1; then
  BASE_BRANCH="main"
elif git rev-parse --verify master >/dev/null 2>&1; then
  BASE_BRANCH="master"
else
  BASE_BRANCH=""
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

# --- Collect all sections into variables first (for metadata) ---

has_committed=false
commit_range=""
branch_diff=""

# Section 1: Committed branch changes vs base
if [ -n "$BASE_BRANCH" ] && [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]; then
  merge_base=$(git merge-base "$BASE_BRANCH" HEAD 2>/dev/null || true)
  if [ -n "$merge_base" ]; then
    branch_diff=$(git diff "$merge_base"..HEAD 2>/dev/null)
    if [ -n "$branch_diff" ]; then
      has_committed=true
      commit_range="${merge_base:0:7}..$(git rev-parse --short HEAD 2>/dev/null)"
    fi
  fi
fi

# Section 2: Uncommitted changes (staged + unstaged) for tracked files
uncommitted=$(git diff HEAD 2>/dev/null)
has_uncommitted=false
if [ -n "$uncommitted" ]; then
  has_uncommitted=true
fi

# Section 3: Staged-only (shown separately for clarity)
staged=$(git diff --staged 2>/dev/null)
has_staged=false
if [ -n "$staged" ]; then
  has_staged=true
fi

# Section 4: Untracked files
untracked_files=$(git ls-files --others --exclude-standard 2>/dev/null)
has_untracked=false
if [ -n "$untracked_files" ]; then
  has_untracked=true
fi

# --- Output metadata block ---
echo "=== METADATA ==="
echo "has_committed=${has_committed}"
echo "commit_range=${commit_range}"
echo "has_uncommitted=${has_uncommitted}"
echo "has_staged=${has_staged}"
echo "has_untracked=${has_untracked}"
echo "base_branch=${BASE_BRANCH}"
echo "current_branch=${CURRENT_BRANCH}"
echo "head_sha=$(git rev-parse --short HEAD 2>/dev/null)"
echo "=== END METADATA ==="
echo ""

# --- Output diff sections ---

if [ "$has_committed" = true ]; then
  echo "=== git diff ${BASE_BRANCH}...HEAD (committed branch changes) ==="
  echo "$branch_diff"
  echo ""
fi

if [ "$has_uncommitted" = true ]; then
  echo "=== git diff HEAD (uncommitted changes) ==="
  echo "$uncommitted"
  echo ""
fi

if [ "$has_staged" = true ]; then
  echo "=== git diff --staged ==="
  echo "$staged"
  echo ""
fi

if [ "$has_untracked" = true ]; then
  echo "=== Untracked files (new, not yet staged) ==="
  while IFS= read -r file; do
    # Skip binary files
    if file --brief --mime-encoding "$file" 2>/dev/null | grep -q 'binary'; then
      echo "--- new file: $file (binary, content omitted)"
      echo ""
    else
      echo "--- new file: $file"
      cat "$file" 2>/dev/null
      echo ""
    fi
  done <<< "$untracked_files"
  echo ""
fi

echo "=== git log --oneline -10 ==="
git log --oneline -10 2>/dev/null
