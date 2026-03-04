#!/usr/bin/env bash
# bump.sh — Update version across all files for a given package
# Usage: bash bump.sh <package> <new_version>
#   package: plugin | cli | learn-mcp | learn-host
#   new_version: semver string (e.g. 1.2.3)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"

PACKAGE="${1:-}"
NEW_VERSION="${2:-}"

if [[ -z "$PACKAGE" || -z "$NEW_VERSION" ]]; then
  echo "Usage: bash bump.sh <package> <new_version>"
  echo "  package: plugin | cli | learn-mcp | learn-host"
  exit 1
fi

# Validate semver format
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver (e.g. 1.2.3)"
  exit 1
fi

bump_json_version() {
  local file="$1"
  local version="$2"
  if [[ ! -f "$file" ]]; then
    echo "  WARNING: $file not found, skipping"
    return
  fi
  # Replace version in-place, preserving all other formatting
  sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$version\"/" "$file"
  echo "  Updated: $file → $version"
}

bump_ts_mcp_version() {
  local file="$1"
  local version="$2"
  if [[ ! -f "$file" ]]; then
    echo "  WARNING: $file not found, skipping"
    return
  fi
  sed -i '' "s/version: \"[0-9]*\.[0-9]*\.[0-9]*\"/version: \"$version\"/" "$file"
  echo "  Updated: $file → $version"
}

case "$PACKAGE" in
  plugin)
    echo "Bumping Plugin to $NEW_VERSION..."
    bump_json_version "$REPO_ROOT/plugin/.claude-plugin/plugin.json" "$NEW_VERSION"
    bump_json_version "$REPO_ROOT/package.json" "$NEW_VERSION"
    echo "Done. Files updated: .claude-plugin/plugin.json, package.json"
    ;;
  cli)
    echo "Bumping CLI to $NEW_VERSION..."
    bump_json_version "$REPO_ROOT/cli/package.json" "$NEW_VERSION"
    echo "Done. Files updated: cli/package.json"
    ;;
  learn-mcp)
    echo "Bumping Learn MCP to $NEW_VERSION..."
    bump_json_version "$REPO_ROOT/cli/lib/learn-mcp/package.json" "$NEW_VERSION"
    bump_ts_mcp_version "$REPO_ROOT/cli/lib/learn-mcp/src/index.ts" "$NEW_VERSION"
    echo "Done. Files updated: cli/lib/learn-mcp/package.json, cli/lib/learn-mcp/src/index.ts"
    ;;
  learn-host)
    echo "Bumping Learn Host to $NEW_VERSION..."
    bump_json_version "$REPO_ROOT/cli/lib/learn-host/package.json" "$NEW_VERSION"
    echo "Done. Files updated: cli/lib/learn-host/package.json"
    ;;
  *)
    echo "Error: unknown package '$PACKAGE'"
    echo "Valid packages: plugin | cli | learn-mcp | learn-host"
    exit 1
    ;;
esac
