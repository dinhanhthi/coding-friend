#!/usr/bin/env bash
# cf-paths.sh — Worktree-aware path resolver for Coding Friend hooks.
#
# Source this file, then call cf_resolve_paths() to set:
#   MAIN_REPO_ROOT  — absolute path to the main git worktree root
#   CF_CONFIG_FILE  — $MAIN_REPO_ROOT/.coding-friend/config.json
#   CF_DOCS_ROOT    — $MAIN_REPO_ROOT/docs (or custom docsDir from config)
#
# Works correctly in all three scenarios:
#   1. Main worktree        — git-common-dir returns ".git"
#   2. Non-main worktree    — git-common-dir returns absolute path ending in /.git
#   3. Non-git directory    — git command fails; falls back to $PWD

cf_resolve_paths() {
  local git_common_dir
  git_common_dir=$(git -C "$PWD" rev-parse --git-common-dir 2>/dev/null || true)

  if [ -z "$git_common_dir" ]; then
    # Not a git repo — fall back to CWD
    MAIN_REPO_ROOT="$PWD"
  elif [ "$git_common_dir" = ".git" ]; then
    # Already in the main worktree
    MAIN_REPO_ROOT="$PWD"
  else
    # Non-main worktree: git_common_dir is typically an absolute path ending in /.git
    # Strip trailing /.git to get the main worktree root
    local candidate="${git_common_dir%/.git}"
    # If stripping had no effect (path didn't end in /.git), fall back to show-toplevel
    if [ "$candidate" = "$git_common_dir" ]; then
      candidate=$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)
      [ -z "$candidate" ] && candidate="$PWD"
    fi
    # Make absolute if somehow still relative
    if [[ "$candidate" != /* ]]; then
      candidate="$(cd "$candidate" && pwd)"
    fi
    MAIN_REPO_ROOT="$candidate"
  fi

  CF_CONFIG_FILE="$MAIN_REPO_ROOT/.coding-friend/config.json"

  # Resolve docsDir from config (falls back to "docs")
  local docs_dir="docs"
  if [ -f "$CF_CONFIG_FILE" ]; then
    local custom_dir
    custom_dir=$(grep -o '"docsDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$CF_CONFIG_FILE" 2>/dev/null \
      | sed 's/.*"docsDir"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
    if [ -n "$custom_dir" ]; then
      docs_dir="$custom_dir"
    fi
  fi

  # Resolve CF_DOCS_ROOT: use as-is if absolute, else relative to MAIN_REPO_ROOT
  if [[ "$docs_dir" = /* ]]; then
    CF_DOCS_ROOT="$docs_dir"
  else
    CF_DOCS_ROOT="$MAIN_REPO_ROOT/$docs_dir"
  fi

  export MAIN_REPO_ROOT CF_CONFIG_FILE CF_DOCS_ROOT
}
