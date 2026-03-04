#!/usr/bin/env bash
# bump-info.sh — Print version bump context for LLM to act on
# Usage: bash bump-info.sh [package] [level]
#   package: plugin | cli | learn-mcp | learn-host | (empty = auto-detect)
#   level:   patch | minor | major | (empty = LLM decides)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
FILTER_PKG="${1:-}"
FILTER_LEVEL="${2:-}"

# --- Fetch tags ---
git -C "$REPO_ROOT" fetch --tags --quiet

get_latest_tag() {
  local pattern="$1"
  git -C "$REPO_ROOT" ls-remote --tags origin \
    | grep -E "refs/tags/${pattern}" \
    | sed 's|.*refs/tags/||' \
    | grep -v '\^{}' \
    | sort -V | tail -1
}

PLUGIN_TAG=$(get_latest_tag 'v[0-9]')
CLI_TAG=$(get_latest_tag 'cli-v')
MCP_TAG=$(get_latest_tag 'learn-mcp-v')
HOST_TAG=$(get_latest_tag 'learn-host-v')

# --- Current file versions ---
PLUGIN_VER=$(grep '"version"' "$REPO_ROOT/plugin/.claude-plugin/plugin.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
CLI_VER=$(grep '"version"' "$REPO_ROOT/cli/package.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
MCP_VER=$(grep '"version"' "$REPO_ROOT/cli/lib/learn-mcp/package.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
HOST_VER=$(grep '"version"' "$REPO_ROOT/cli/lib/learn-host/package.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')

# --- Detect changed packages (if no filter) ---
check_changes() {
  local tag="$1"; shift
  local paths=("$@")
  if [ -z "$tag" ]; then
    git -C "$REPO_ROOT" diff --name-only HEAD -- "${paths[@]}" 2>/dev/null | head -1
  else
    git -C "$REPO_ROOT" diff --name-only "${tag}..HEAD" -- "${paths[@]}" 2>/dev/null | head -1
  fi
}

echo "=== Bump Info ==="
echo ""

print_pkg() {
  local name="$1" tag="$2" file_ver="$3" changed="$4"
  local state="bump"
  [ -z "$tag" ] && tag="(none)"
  if [ -n "$file_ver" ] && [ -n "$(echo "$tag" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" ]; then
    tag_ver=$(echo "$tag" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    [ "$file_ver" != "$tag_ver" ] && state="already-bumped"
  fi
  echo "Package:      $name"
  echo "Latest tag:   $tag"
  echo "File version: $file_ver"
  echo "State:        $state  (already-bumped = only update changelog, no version bump)"
  echo "Has changes:  $([ -n "$changed" ] && echo yes || echo no)"
  echo ""
}

if [ -n "$FILTER_PKG" ]; then
  case "$FILTER_PKG" in
    plugin)    print_pkg "plugin"     "$PLUGIN_TAG" "$PLUGIN_VER" "yes" ;;
    cli)       print_pkg "cli"        "$CLI_TAG"    "$CLI_VER"    "yes" ;;
    learn-mcp) print_pkg "learn-mcp"  "$MCP_TAG"    "$MCP_VER"    "yes" ;;
    learn-host)print_pkg "learn-host" "$HOST_TAG"   "$HOST_VER"   "yes" ;;
    *) echo "Unknown package: $FILTER_PKG"; exit 1 ;;
  esac
else
  PLUGIN_CHANGED=$(check_changes "$PLUGIN_TAG" "plugin/" ".claude-plugin/" ".claude/" ".agents/")
  CLI_CHANGED=$(check_changes "$CLI_TAG" "cli/" ":(exclude)cli/lib/learn-host/" ":(exclude)cli/lib/learn-mcp/" 2>/dev/null || check_changes "$CLI_TAG" "cli/")
  MCP_CHANGED=$(check_changes "$MCP_TAG" "cli/lib/learn-mcp/")
  HOST_CHANGED=$(check_changes "$HOST_TAG" "cli/lib/learn-host/")

  [ -n "$PLUGIN_CHANGED" ] && print_pkg "plugin"     "$PLUGIN_TAG" "$PLUGIN_VER" "$PLUGIN_CHANGED"
  [ -n "$CLI_CHANGED" ]    && print_pkg "cli"        "$CLI_TAG"    "$CLI_VER"    "$CLI_CHANGED"
  [ -n "$MCP_CHANGED" ]    && print_pkg "learn-mcp"  "$MCP_TAG"    "$MCP_VER"    "$MCP_CHANGED"
  [ -n "$HOST_CHANGED" ]   && print_pkg "learn-host" "$HOST_TAG"   "$HOST_VER"   "$HOST_CHANGED"

  if [ -z "$PLUGIN_CHANGED$CLI_CHANGED$MCP_CHANGED$HOST_CHANGED" ]; then
    echo "No package changes detected since last tags."
    echo "Tags: plugin=$PLUGIN_TAG  cli=$CLI_TAG  learn-mcp=$MCP_TAG  learn-host=$HOST_TAG"
  fi
fi

[ -n "$FILTER_LEVEL" ] && echo "Requested level: $FILTER_LEVEL" || echo "Bump level: (not specified — LLM should analyze and confirm with user)"

echo ""
echo "Path→Package mapping:"
echo "  plugin/ .claude-plugin/ .claude/ .agents/  → plugin"
echo "  cli/ (excl. learn-*)                        → cli"
echo "  cli/lib/learn-mcp/                          → learn-mcp"
echo "  cli/lib/learn-host/                         → learn-host"
echo "  website/ changes do NOT count as plugin changes"
echo ""
echo "Bump script: bash .claude/skills/bump-version/scripts/bump.sh <package> <new_version>"
