#!/usr/bin/env bash
# release.sh — Finalize changelog and create git tag for a package
# Usage: bash release.sh <package>
#   package: plugin | cli | learn-mcp | learn-host | cf-memory

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PACKAGE="${1:-}"
TODAY=$(date +%Y-%m-%d)

if [[ -z "$PACKAGE" ]]; then
  echo "Usage: bash release.sh <package>"
  echo "  package: plugin | cli | learn-mcp | learn-host | cf-memory"
  exit 1
fi

get_version() {
  local file="$1"
  grep '"version"' "$file" | head -1 | sed 's/.*"version": *"//;s/".*//'
}

case "$PACKAGE" in
  plugin)
    VERSION=$(get_version "$REPO_ROOT/plugin/.claude-plugin/plugin.json")
    CHANGELOG="$REPO_ROOT/plugin/CHANGELOG.md"
    TAG="v${VERSION}"
    ;;
  cli)
    VERSION=$(get_version "$REPO_ROOT/cli/package.json")
    CHANGELOG="$REPO_ROOT/cli/CHANGELOG.md"
    TAG="cli-v${VERSION}"
    ;;
  learn-mcp)
    VERSION=$(get_version "$REPO_ROOT/cli/lib/learn-mcp/package.json")
    CHANGELOG="$REPO_ROOT/cli/lib/learn-mcp/CHANGELOG.md"
    TAG="learn-mcp-v${VERSION}"
    ;;
  learn-host)
    VERSION=$(get_version "$REPO_ROOT/cli/lib/learn-host/package.json")
    CHANGELOG="$REPO_ROOT/cli/lib/learn-host/CHANGELOG.md"
    TAG="learn-host-v${VERSION}"
    ;;
  cf-memory)
    VERSION=$(get_version "$REPO_ROOT/cli/lib/cf-memory/package.json")
    CHANGELOG="$REPO_ROOT/cli/lib/cf-memory/CHANGELOG.md"
    TAG="cf-memory-v${VERSION}"
    ;;
  *)
    echo "Error: unknown package '$PACKAGE'"
    echo "Valid packages: plugin | cli | learn-mcp | learn-host | cf-memory"
    exit 1
    ;;
esac

# Check changelog has unpublished section
if ! grep -q "(unpublished)" "$CHANGELOG"; then
  echo "No (unpublished) section found in $CHANGELOG — nothing to release."
  exit 1
fi

# Verify version in package file matches changelog's unpublished version
CHANGELOG_VERSION=$(grep "(unpublished)" "$CHANGELOG" | head -1 | sed 's/.*## v//;s/ .*//')
if [[ "$VERSION" != "$CHANGELOG_VERSION" ]]; then
  echo "Error: version mismatch for $PACKAGE!"
  echo "  package.json version: $VERSION"
  echo "  changelog version:    $CHANGELOG_VERSION"
  echo ""
  echo "Fix: update the package version file to $CHANGELOG_VERSION, or re-run /cf-ship."
  exit 1
fi

# Check tag doesn't already exist
if git tag -l "$TAG" | grep -q .; then
  echo "Error: tag '$TAG' already exists."
  exit 1
fi

# Replace (unpublished) with today's date
sed -i '' "s/(unpublished)/(${TODAY})/" "$CHANGELOG"
echo "Updated: $(basename "$CHANGELOG") — v${VERSION} (unpublished) → v${VERSION} (${TODAY})"
echo "Tag to create after commit: $TAG"

echo ""
echo "Done. Changelog updated — commit it before creating the tag."
