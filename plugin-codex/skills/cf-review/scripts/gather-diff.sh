#!/usr/bin/env bash
# gather-diff.sh — render the cf-review scope as a reviewer-facing diff document.
#
# Usage:
#   bash gather-diff.sh                          # legacy target (default)
#   bash gather-diff.sh --uncommitted [--path P]…
#   bash gather-diff.sh --range <git-range>
#   bash gather-diff.sh … --snapshot-dir /tmp/coding-friend/review/<run-id>
#
# Targets are mutually exclusive; see review-scope.sh for the full contract.
# The no-arg legacy target is unchanged for cf-review-out / run-agent-review.sh:
#   0. Metadata block (machine-readable summary of what's included)
#   1. Committed changes on current branch vs base (main/master)
#   2. Uncommitted changes (net HEAD -> working tree) for tracked files
#   3. Untracked files (new files not yet git-added)
#   4. Recent commit log
#
# Staged changes are part of section 2 (`git diff HEAD` already contains them)
# and are NOT repeated in a separate section — `has_staged` still reports them.
#
# With --snapshot-dir the same bytes are also written to <dir>/diff.txt next to
# metadata.txt / files.z / excluded.z, so the assessor and the reviewers reuse
# one scope instead of re-deriving it. Only this script (run by the main agent)
# writes there; reviewers read it.

# Resolved with builtins only, so a broken PATH still reaches the "git is not
# available" error instead of dying on `dirname`.
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ] && SCRIPT_DIR="."
SCRIPT_DIR=$(cd "$SCRIPT_DIR" && pwd)
# shellcheck source=./review-scope.sh
. "$SCRIPT_DIR/review-scope.sh"

cf_scope_parse_args "$@" || exit $?
cf_scope_snapshot_init || true # warns on stderr and falls back to stdout only
cf_scope_collect
collect_status=$?
# Structural failures must not produce a metadata block: an all-false block is
# indistinguishable from a clean tree.
[ "$collect_status" -eq 2 ] && exit 2

render_scope() {
  echo "=== METADATA ==="
  echo "has_committed=${CF_SCOPE_HAS_COMMITTED}"
  echo "commit_range=${CF_SCOPE_COMMIT_RANGE}"
  echo "has_uncommitted=${CF_SCOPE_HAS_UNCOMMITTED}"
  echo "has_staged=${CF_SCOPE_HAS_STAGED}"
  echo "has_untracked=${CF_SCOPE_HAS_UNTRACKED}"
  echo "base_branch=${CF_SCOPE_BASE_BRANCH}"
  echo "current_branch=${CF_SCOPE_CURRENT_BRANCH}"
  echo "head_sha=${CF_SCOPE_HEAD_SHA}"
  # Additive fields (contract version 1) — older consumers ignore them.
  echo "scope_version=${CF_SCOPE_VERSION}"
  echo "scope_mode=${CF_SCOPE_MODE}"
  echo "scope_range=${CF_SCOPE_RANGE}"
  echo "scope_paths=${#CF_SCOPE_PATHS[@]}"
  echo "scope_complete=${CF_SCOPE_COMPLETE}"
  echo "files_total=${#CF_SCOPE_FILES[@]}"
  echo "excluded_total=${#CF_SCOPE_EXCLUDED[@]}"
  echo "snapshot_dir=${CF_SCOPE_SNAPSHOT_DIR}"
  echo "=== END METADATA ==="
  echo ""

  if [ "$CF_SCOPE_HAS_COMMITTED" = true ]; then
    if [ "$CF_SCOPE_MODE" = "range" ]; then
      echo "=== git diff ${CF_SCOPE_RANGE} (committed changes) ==="
    else
      echo "=== git diff ${CF_SCOPE_BASE_BRANCH}...HEAD (committed branch changes) ==="
    fi
    printf '%s\n' "$CF_SCOPE_COMMITTED_DIFF"
    echo ""
  fi

  if [ "$CF_SCOPE_HAS_UNCOMMITTED" = true ]; then
    echo "=== git diff HEAD (uncommitted changes) ==="
    printf '%s\n' "$CF_SCOPE_UNCOMMITTED_DIFF"
    echo ""
  fi

  if [ ${#CF_SCOPE_UNTRACKED[@]} -gt 0 ]; then
    echo "=== Untracked files (new, not yet staged) ==="
    local entry kind path
    for entry in "${CF_SCOPE_UNTRACKED[@]}"; do
      kind="${entry%%	*}"
      path="${entry#*	}"
      case "$kind" in
        binary)
          echo "--- new file: $path (binary, content omitted)"
          ;;
        symlink)
          echo "--- new file: $path (symlink, content omitted)"
          ;;
        *)
          echo "--- new file: $path"
          cat -- "$path" 2>/dev/null
          ;;
      esac
      echo ""
    done
    echo ""
  fi

  if [ ${#CF_SCOPE_EXCLUDED[@]} -gt 0 ]; then
    # Coverage gap, never "reviewed": no content of these paths was read.
    echo "=== Excluded from review scope (NOT reviewed) ==="
    local ex
    for ex in "${CF_SCOPE_EXCLUDED[@]}"; do
      echo "--- excluded (${ex%% *}): ${ex#* }"
    done
    echo ""
  fi

  echo "=== git log --oneline -10 ==="
  if [ "$CF_SCOPE_BASE_REF" = "HEAD" ]; then
    git log --oneline -10 2>/dev/null
  fi
}

out_file=$(mktemp "${TMPDIR:-/tmp}/cf-gather-diff.XXXXXX") || {
  # No temp file: still emit the scope, just without a snapshot.
  render_scope
  exit "$collect_status"
}
trap 'rm -f "$out_file"' EXIT

render_scope >"$out_file"
cf_scope_write_snapshot "$out_file"
cat "$out_file"

exit "$collect_status"
