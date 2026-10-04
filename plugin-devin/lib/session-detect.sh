#!/usr/bin/env bash
# session-detect.sh — project type / package manager / ignore-pattern detection.
#
# Source after cf_resolve_paths. Call cf_detect_session.
# Requires PLUGIN_ROOT and MAIN_REPO_ROOT. Manifest/lockfile checks use $PWD.

cf_detect_session() {
  PROJECT_TYPE="unknown"
  if [ -f "package.json" ]; then
    if [ -d "packages" ] || [ -f "pnpm-workspace.yaml" ] || [ -f "lerna.json" ]; then
      PROJECT_TYPE="monorepo"
    else
      PROJECT_TYPE="single-repo"
    fi
  elif [ -f "Cargo.toml" ]; then
    PROJECT_TYPE="rust"
  elif [ -f "go.mod" ]; then
    PROJECT_TYPE="go"
  elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
    PROJECT_TYPE="python"
  fi

  PKG_MANAGER="unknown"
  if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
    PKG_MANAGER="bun"
  elif [ -f "pnpm-lock.yaml" ]; then
    PKG_MANAGER="pnpm"
  elif [ -f "yarn.lock" ]; then
    PKG_MANAGER="yarn"
  elif [ -f "package-lock.json" ]; then
    PKG_MANAGER="npm"
  fi

  CFIGNORE_PATTERNS=""
  CFIGNORE_FILE="$PLUGIN_ROOT/.coding-friend/ignore"
  if [ -f "$MAIN_REPO_ROOT/.coding-friend/ignore" ]; then
    CFIGNORE_FILE="$MAIN_REPO_ROOT/.coding-friend/ignore"
  fi
  if [ -f "$CFIGNORE_FILE" ]; then
    CFIGNORE_PATTERNS=$(grep -v '^#' "$CFIGNORE_FILE" | grep -v '^$' | tr '\n' '|' | sed 's/|$//')
  fi

  export PROJECT_TYPE PKG_MANAGER CFIGNORE_PATTERNS
}
