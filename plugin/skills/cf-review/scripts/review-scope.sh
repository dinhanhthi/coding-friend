#!/usr/bin/env bash
# review-scope.sh — shared review-scope collection for cf-review.
#
# SOURCE this file; it only defines functions (plus CF_SCOPE_VERSION / lib path).
#
#   source "$(dirname "$0")/review-scope.sh"
#   cf_scope_parse_args "$@" || exit $?   # target flags -> CF_SCOPE_* inputs
#   cf_scope_collect         || exit $?   # git queries  -> CF_SCOPE_* results
#   cf_scope_write_snapshot <rendered-output-file>
#
# Target contract (mutually exclusive):
#   (none)                 legacy: branch commits + net uncommitted + untracked
#   --uncommitted          net uncommitted (HEAD -> worktree) + untracked
#   --path <path>          limits --uncommitted to <path> (repeatable)
#   --range <git-range>    committed range only, never untracked files
#   --snapshot-dir <dir>   also write reusable artifacts into <dir>
#
# Snapshot metadata contract: version 1 (CF_SCOPE_VERSION). Internal to
# cf-review. Additive fields only; bump on any rename/removal.
#
# Safety: paths reach git through argument arrays and `--`; nothing is eval'd.
# Privacy/ignore filtering runs on the path list BEFORE any content is read, so
# excluded files never have their contents loaded. Excluded paths are reported
# as a coverage gap, never as reviewed.
#
# Exit conventions for cf_scope_parse_args / cf_scope_collect:
#   0  scope collected, complete
#   2  structural failure (bad flags, no git, not a repo, invalid range) —
#      the caller must NOT emit a metadata block, or it would look clean
#   3  scope collected but incomplete (a targeted file could not be read)

CF_SCOPE_VERSION=1
if [ -z "${CF_SCOPE_LIB_DIR:-}" ]; then
  # Builtins only — a broken PATH must still reach the "git is not available"
  # error rather than dying on `dirname`.
  CF_SCOPE_LIB_DIR="${BASH_SOURCE[0]%/*}"
  [ "$CF_SCOPE_LIB_DIR" = "${BASH_SOURCE[0]}" ] && CF_SCOPE_LIB_DIR="."
  CF_SCOPE_LIB_DIR="$(cd "$CF_SCOPE_LIB_DIR/../../.." 2>/dev/null && pwd)/lib"
fi

cf_scope_reset() {
  # --- inputs ---
  CF_SCOPE_MODE="legacy"
  CF_SCOPE_RANGE=""
  CF_SCOPE_PATHS=()
  CF_SCOPE_SNAPSHOT_DIR=""
  # --- results ---
  CF_SCOPE_BASE_BRANCH=""
  CF_SCOPE_CURRENT_BRANCH=""
  CF_SCOPE_BASE_REF=""
  CF_SCOPE_HEAD_SHA=""
  CF_SCOPE_COMMIT_RANGE=""
  CF_SCOPE_HAS_COMMITTED=false
  CF_SCOPE_HAS_UNCOMMITTED=false
  CF_SCOPE_HAS_STAGED=false
  CF_SCOPE_HAS_UNTRACKED=false
  CF_SCOPE_COMMITTED_DIFF=""
  CF_SCOPE_UNCOMMITTED_DIFF=""
  CF_SCOPE_UNTRACKED=()   # "kind<TAB>path", kind = text|binary|symlink
  CF_SCOPE_FILES=()       # "origin<SP>added<SP>deleted<SP>path"
  CF_SCOPE_EXCLUDED=()    # "reason<SP>path"
  CF_SCOPE_EXCLUDE_SPEC=()
  CF_SCOPE_SELF_PREFIX=""
  CF_SCOPE_COMPLETE=true
}

cf_scope_error() {
  echo "ERROR: $1" >&2
}

# ── argument parsing ────────────────────────────────────────────────

cf_scope__need_value() {
  # $1 = flag name, $2 = value (may be unset). Rejects empty and flag-like
  # values so `--range --snapshot-dir` cannot smuggle a flag into a git ref.
  case "${2-}" in
    "" | -*)
      cf_scope_error "$1 requires a value"
      return 1
      ;;
  esac
  return 0
}

cf_scope_parse_args() {
  cf_scope_reset
  local target=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --uncommitted)
        if [ -n "$target" ] && [ "$target" != "--uncommitted" ]; then
          cf_scope_error "conflicting target flags: $target and --uncommitted"
          return 2
        fi
        target="--uncommitted"
        CF_SCOPE_MODE="uncommitted"
        shift
        ;;
      --range)
        if [ -n "$target" ]; then
          cf_scope_error "conflicting target flags: $target and --range"
          return 2
        fi
        cf_scope__need_value --range "${2-}" || return 2
        target="--range"
        CF_SCOPE_MODE="range"
        CF_SCOPE_RANGE="$2"
        shift 2
        ;;
      --path)
        if [ "$target" = "--range" ]; then
          cf_scope_error "conflicting target flags: --range and --path"
          return 2
        fi
        cf_scope__need_value --path "${2-}" || return 2
        [ -n "$target" ] || target="--uncommitted"
        CF_SCOPE_MODE="uncommitted"
        CF_SCOPE_PATHS[${#CF_SCOPE_PATHS[@]}]="$2"
        shift 2
        ;;
      --snapshot-dir)
        cf_scope__need_value --snapshot-dir "${2-}" || return 2
        CF_SCOPE_SNAPSHOT_DIR="$2"
        shift 2
        ;;
      *)
        cf_scope_error "unknown argument: $1 (usage: [--uncommitted | --range <git-range>] [--path <path>]... [--snapshot-dir <dir>])"
        return 2
        ;;
    esac
  done
  return 0
}

# ── privacy / ignore filtering (runs before any content read) ───────

cf_scope__load_filters() {
  SENSITIVE_PATTERNS=()
  SAFE_PATTERNS=()
  CFIGNORE_PATTERNS=""
  if [ -r "$CF_SCOPE_LIB_DIR/privacy-patterns.sh" ]; then
    # shellcheck source=/dev/null
    . "$CF_SCOPE_LIB_DIR/privacy-patterns.sh"
  else
    # Filtering is a security control: without its patterns we would read and
    # emit the contents of files we are supposed to exclude. Never fail open
    # silently — warn and mark the scope incomplete so no caller can report it
    # as a clean, fully reviewed capture.
    echo "WARNING: privacy pattern library not found at '$CF_SCOPE_LIB_DIR/privacy-patterns.sh' — sensitive-path filtering is DISABLED and this scope is not complete" >&2
    CF_SCOPE_COMPLETE=false
  fi
  if [ -r "$CF_SCOPE_LIB_DIR/session-detect.sh" ]; then
    PLUGIN_ROOT="${PLUGIN_ROOT:-${CF_SCOPE_LIB_DIR%/lib}}"
    MAIN_REPO_ROOT="${MAIN_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
    # shellcheck source=/dev/null
    . "$CF_SCOPE_LIB_DIR/session-detect.sh"
    cf_detect_session >/dev/null 2>&1
  fi
}

# Echo an exclusion reason and return 0 when $1 must be kept out of the scope.
cf_scope__exclusion_reason() {
  local p="$1" pat
  case "$p" in
    *"$CF_SCOPE_NL"*)
      # A newline in a path would defeat the line-oriented pattern matching
      # below — refuse to load it rather than risk a filter bypass.
      echo "unsafe-path"
      return 0
      ;;
  esac
  if [ -n "$CF_SCOPE_SELF_PREFIX" ]; then
    case "$p" in
      "$CF_SCOPE_SELF_PREFIX"*)
        echo "review-artifact"
        return 0
        ;;
    esac
  fi
  for pat in ${SAFE_PATTERNS[@]+"${SAFE_PATTERNS[@]}"}; do
    printf '%s\n' "$p" | grep -qE "$pat" && return 1
  done
  for pat in ${SENSITIVE_PATTERNS[@]+"${SENSITIVE_PATTERNS[@]}"}; do
    if printf '%s\n' "$p" | grep -qE "$pat"; then
      echo "sensitive"
      return 0
    fi
  done
  if [ -n "$CFIGNORE_PATTERNS" ]; then
    local saved_ifs="$IFS"
    IFS='|'
    for pat in $CFIGNORE_PATTERNS; do
      [ -n "$pat" ] || continue
      # shellcheck disable=SC2254 # ignore entries are glob patterns by design
      case "$p" in
        $pat | $pat/* | */$pat | */$pat/*)
          IFS="$saved_ifs"
          echo "cf-ignore"
          return 0
          ;;
      esac
    done
    IFS="$saved_ifs"
  fi
  return 1
}

cf_scope__exclude() {
  CF_SCOPE_EXCLUDED[${#CF_SCOPE_EXCLUDED[@]}]="$1 $2"
  # Policy exclusions (privacy, .coding-friend/ignore, own artifacts) are an
  # expected, reported coverage gap. Only a file we were meant to read but
  # could not marks the scope incomplete.
  case "$1" in
    unreadable | unsafe-path) CF_SCOPE_COMPLETE=false ;;
  esac
}

# Rebuild the `:(exclude,literal)` pathspec tail from the exclusion list.
cf_scope__exclude_pathspecs() {
  local entry
  CF_SCOPE_EXCLUDE_SPEC=()
  for entry in ${CF_SCOPE_EXCLUDED[@]+"${CF_SCOPE_EXCLUDED[@]}"}; do
    CF_SCOPE_EXCLUDE_SPEC[${#CF_SCOPE_EXCLUDE_SPEC[@]}]=":(exclude,literal)${entry#* }"
  done
}

# ── collection ──────────────────────────────────────────────────────

cf_scope_collect() {
  CF_SCOPE_NL='
'
  command -v git >/dev/null 2>&1 || {
    cf_scope_error "git is not available in PATH"
    return 2
  }
  git rev-parse --git-dir >/dev/null 2>&1 || {
    cf_scope_error "not inside a git repository"
    return 2
  }

  local repo_root snap_abs
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
  cf_scope__load_filters

  # The run's own artifacts must never end up inside its own scope.
  if [ -n "$CF_SCOPE_SNAPSHOT_DIR" ] && [ -n "$repo_root" ]; then
    snap_abs="$CF_SCOPE_SNAPSHOT_DIR"
    case "$snap_abs" in /*) ;; *) snap_abs="$PWD/$snap_abs" ;; esac
    case "$snap_abs/" in
      "$repo_root"/*) CF_SCOPE_SELF_PREFIX="${snap_abs#"$repo_root"/}" ;;
    esac
  fi

  if git rev-parse --verify main >/dev/null 2>&1; then
    CF_SCOPE_BASE_BRANCH="main"
  elif git rev-parse --verify master >/dev/null 2>&1; then
    CF_SCOPE_BASE_BRANCH="master"
  fi
  CF_SCOPE_CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

  # Unborn branch -> diff against the empty tree so staged/unstaged still count.
  if git rev-parse -q --verify HEAD >/dev/null 2>&1; then
    CF_SCOPE_BASE_REF="HEAD"
    CF_SCOPE_HEAD_SHA=$(git rev-parse --short HEAD 2>/dev/null)
  else
    CF_SCOPE_BASE_REF=$(git hash-object -t tree /dev/null 2>/dev/null)
    if [ -z "$CF_SCOPE_BASE_REF" ]; then
      cf_scope_error "could not resolve the empty tree object"
      return 2
    fi
  fi

  case "$CF_SCOPE_MODE" in
    range) cf_scope__collect_range || return $? ;;
    uncommitted) cf_scope__collect_uncommitted ;;
    *)
      cf_scope__collect_branch_commits
      cf_scope__collect_uncommitted
      ;;
  esac

  [ "$CF_SCOPE_COMPLETE" = true ] && return 0
  # Something we were asked to review had to be dropped. The caller still gets
  # the full output; only the exit status flags the coverage gap, so this is
  # never mistaken for a clean, empty result.
  return 3
}

cf_scope__collect_range() {
  if ! git diff --name-only -z --no-renames "$CF_SCOPE_RANGE" -- >/dev/null 2>&1; then
    cf_scope_error "invalid git range: $CF_SCOPE_RANGE"
    return 2
  fi
  cf_scope__filter_tracked "$CF_SCOPE_RANGE" "" || return 0
  CF_SCOPE_HAS_COMMITTED=true
  CF_SCOPE_COMMIT_RANGE="$CF_SCOPE_RANGE"
  cf_scope__exclude_pathspecs
  CF_SCOPE_COMMITTED_DIFF=$(git diff "$CF_SCOPE_RANGE" -- ':/' \
    ${CF_SCOPE_EXCLUDE_SPEC[@]+"${CF_SCOPE_EXCLUDE_SPEC[@]}"} 2>/dev/null)
  cf_scope__numstat committed "$CF_SCOPE_RANGE" ""
  return 0
}

cf_scope__collect_branch_commits() {
  [ -n "$CF_SCOPE_BASE_BRANCH" ] || return 0
  [ -n "$CF_SCOPE_CURRENT_BRANCH" ] || return 0
  [ "$CF_SCOPE_CURRENT_BRANCH" != "$CF_SCOPE_BASE_BRANCH" ] || return 0
  local merge_base range
  merge_base=$(git merge-base "$CF_SCOPE_BASE_BRANCH" HEAD 2>/dev/null)
  [ -n "$merge_base" ] || return 0
  range="$merge_base..HEAD"

  cf_scope__filter_tracked "$range" "" || return 0
  cf_scope__exclude_pathspecs
  CF_SCOPE_COMMITTED_DIFF=$(git diff "$range" -- ':/' \
    ${CF_SCOPE_EXCLUDE_SPEC[@]+"${CF_SCOPE_EXCLUDE_SPEC[@]}"} 2>/dev/null)
  CF_SCOPE_HAS_COMMITTED=true
  CF_SCOPE_COMMIT_RANGE="${merge_base:0:7}..$(git rev-parse --short HEAD 2>/dev/null)"
  cf_scope__numstat committed "$range" ""
  return 0
}

cf_scope__collect_uncommitted() {
  # `git diff <base>` is already HEAD -> worktree, i.e. the NET change: a hunk
  # staged and then reverted unstaged does not appear, and staged hunks are
  # emitted exactly once (there is no separate `--staged` section any more).
  if cf_scope__filter_tracked "$CF_SCOPE_BASE_REF" paths; then
    CF_SCOPE_HAS_UNCOMMITTED=true
    cf_scope__exclude_pathspecs
    CF_SCOPE_UNCOMMITTED_DIFF=$(git diff "$CF_SCOPE_BASE_REF" -- \
      ${CF_SCOPE_PATHS[@]+"${CF_SCOPE_PATHS[@]}"} \
      ${CF_SCOPE_EXCLUDE_SPEC[@]+"${CF_SCOPE_EXCLUDE_SPEC[@]}"} 2>/dev/null)
    cf_scope__numstat uncommitted "$CF_SCOPE_BASE_REF" paths
  fi

  git diff --cached --quiet "$CF_SCOPE_BASE_REF" -- \
    ${CF_SCOPE_PATHS[@]+"${CF_SCOPE_PATHS[@]}"} >/dev/null 2>&1 ||
    CF_SCOPE_HAS_STAGED=true

  cf_scope__collect_untracked
}

# Partition the tracked change list into kept / excluded.
# $1 = ref or range, $2 = non-empty to honour --path.
# Returns 0 when the target has any tracked change at all (even if all excluded).
cf_scope__filter_tracked() {
  local ref="$1" use_paths="$2" found=false path reason
  # NUL-delimited, read straight from git: command substitution would drop the
  # NUL bytes, and splitting on whitespace would corrupt paths with spaces.
  while IFS= read -r -d '' path; do
    [ -n "$path" ] || continue
    found=true
    if reason=$(cf_scope__exclusion_reason "$path"); then
      cf_scope__exclude "$reason" "$path"
    fi
  done < <(
    if [ -n "$use_paths" ]; then
      git diff --name-only -z --no-renames "$ref" -- \
        ${CF_SCOPE_PATHS[@]+"${CF_SCOPE_PATHS[@]}"} 2>/dev/null
    else
      git diff --name-only -z --no-renames "$ref" -- 2>/dev/null
    fi
  )
  [ "$found" = true ]
}

# Record `origin added deleted path` rows for a tracked diff (binary = `-`).
# $1 = origin, $2 = ref/range, $3 = non-empty to honour --path.
cf_scope__numstat() {
  local origin="$1" ref="$2" use_paths="$3" rec added deleted path rest
  cf_scope__exclude_pathspecs
  while IFS= read -r -d '' rec; do
    [ -n "$rec" ] || continue
    added="${rec%%	*}"
    rest="${rec#*	}"
    deleted="${rest%%	*}"
    path="${rest#*	}"
    CF_SCOPE_FILES[${#CF_SCOPE_FILES[@]}]="$origin $added $deleted $path"
  done < <(
    if [ -n "$use_paths" ]; then
      git diff --numstat -z --no-renames "$ref" -- \
        ${CF_SCOPE_PATHS[@]+"${CF_SCOPE_PATHS[@]}"} \
        ${CF_SCOPE_EXCLUDE_SPEC[@]+"${CF_SCOPE_EXCLUDE_SPEC[@]}"} 2>/dev/null
    else
      git diff --numstat -z --no-renames "$ref" -- ':/' \
        ${CF_SCOPE_EXCLUDE_SPEC[@]+"${CF_SCOPE_EXCLUDE_SPEC[@]}"} 2>/dev/null
    fi
  )
}

cf_scope__collect_untracked() {
  local path reason kind lines
  while IFS= read -r -d '' path; do
    [ -n "$path" ] || continue
    CF_SCOPE_HAS_UNTRACKED=true
    if reason=$(cf_scope__exclusion_reason "$path"); then
      cf_scope__exclude "$reason" "$path"
      continue
    fi
    if [ -L "$path" ]; then
      # Never dereference an untracked symlink — it can point outside the repo.
      CF_SCOPE_UNTRACKED[${#CF_SCOPE_UNTRACKED[@]}]="symlink	$path"
      CF_SCOPE_FILES[${#CF_SCOPE_FILES[@]}]="untracked - - $path"
      continue
    fi
    if [ ! -f "$path" ] || [ ! -r "$path" ]; then
      cf_scope__exclude "unreadable" "$path"
      continue
    fi
    if file --brief --mime-encoding "$path" 2>/dev/null | grep -q 'binary'; then
      kind="binary"
      CF_SCOPE_FILES[${#CF_SCOPE_FILES[@]}]="untracked - - $path"
    else
      kind="text"
      lines=$(wc -l <"$path" 2>/dev/null | tr -d ' ')
      CF_SCOPE_FILES[${#CF_SCOPE_FILES[@]}]="untracked ${lines:-0} 0 $path"
    fi
    CF_SCOPE_UNTRACKED[${#CF_SCOPE_UNTRACKED[@]}]="$kind	$path"
  done < <(
    git ls-files --others --exclude-standard -z -- \
      ${CF_SCOPE_PATHS[@]+"${CF_SCOPE_PATHS[@]}"} 2>/dev/null
  )
}

# ── snapshot ────────────────────────────────────────────────────────

# Returns 0 when CF_SCOPE_SNAPSHOT_DIR is usable; clears it and warns otherwise,
# so the caller silently falls back to the already-captured stdout content.
cf_scope_snapshot_init() {
  [ -n "$CF_SCOPE_SNAPSHOT_DIR" ] || return 1
  if mkdir -p "$CF_SCOPE_SNAPSHOT_DIR" 2>/dev/null &&
    : >"$CF_SCOPE_SNAPSHOT_DIR/diff.txt" 2>/dev/null; then
    return 0
  fi
  echo "WARNING: cannot write snapshot dir '$CF_SCOPE_SNAPSHOT_DIR' — continuing with stdout only" >&2
  CF_SCOPE_SNAPSHOT_DIR=""
  return 1
}

# $1 = file holding the rendered stdout. Best effort: never fails the run.
cf_scope_write_snapshot() {
  local rendered="$1" dir="$CF_SCOPE_SNAPSHOT_DIR"
  [ -n "$dir" ] || return 0
  if ! cat "$rendered" >"$dir/diff.txt" 2>/dev/null; then
    echo "WARNING: snapshot diff.txt could not be written" >&2
    return 0
  fi
  {
    echo "scope_version=$CF_SCOPE_VERSION"
    echo "scope_mode=$CF_SCOPE_MODE"
    echo "scope_range=$CF_SCOPE_RANGE"
    echo "scope_paths=${#CF_SCOPE_PATHS[@]}"
    echo "scope_complete=$CF_SCOPE_COMPLETE"
    echo "base_ref=$CF_SCOPE_BASE_REF"
    echo "base_branch=$CF_SCOPE_BASE_BRANCH"
    echo "current_branch=$CF_SCOPE_CURRENT_BRANCH"
    echo "head_sha=$CF_SCOPE_HEAD_SHA"
    echo "commit_range=$CF_SCOPE_COMMIT_RANGE"
    echo "has_committed=$CF_SCOPE_HAS_COMMITTED"
    echo "has_uncommitted=$CF_SCOPE_HAS_UNCOMMITTED"
    echo "has_staged=$CF_SCOPE_HAS_STAGED"
    echo "has_untracked=$CF_SCOPE_HAS_UNTRACKED"
    echo "files_total=${#CF_SCOPE_FILES[@]}"
    echo "excluded_total=${#CF_SCOPE_EXCLUDED[@]}"
    # Sidecars are NUL-separated so paths are never split on whitespace.
    echo "files_index=files.z"
    echo "files_index_format=origin added deleted path"
    echo "excluded_index=excluded.z"
    echo "excluded_index_format=reason path"
  } >"$dir/metadata.txt" 2>/dev/null

  : >"$dir/files.z" 2>/dev/null
  if [ ${#CF_SCOPE_FILES[@]} -gt 0 ]; then
    printf '%s\0' "${CF_SCOPE_FILES[@]}" >"$dir/files.z" 2>/dev/null
  fi
  : >"$dir/excluded.z" 2>/dev/null
  if [ ${#CF_SCOPE_EXCLUDED[@]} -gt 0 ]; then
    printf '%s\0' "${CF_SCOPE_EXCLUDED[@]}" >"$dir/excluded.z" 2>/dev/null
  fi
  return 0
}

# Load a snapshot written by cf_scope_write_snapshot back into the CF_SCOPE_*
# results, running NO git command — a second tool then measures exactly the
# scope the reviewers were given.
#
# Fails closed with 2 on a missing, unreadable, version-mismatched or truncated
# snapshot: an empty-but-successful result is indistinguishable from a clean
# tree. Returns 3 when the snapshot itself recorded an incomplete scope.
cf_scope_read_snapshot() {
  local dir="$1" meta="$1/metadata.txt" line key value version="" total="" count=0
  cf_scope_reset
  CF_SCOPE_SNAPSHOT_DIR="$dir"
  # Not `true` until the snapshot says so: a metadata file without
  # scope_complete must read as a coverage gap, not as a clean full scope.
  CF_SCOPE_COMPLETE=""
  if [ ! -r "$meta" ]; then
    cf_scope_error "no readable scope snapshot at '$meta'"
    return 2
  fi
  while IFS= read -r line; do
    key="${line%%=*}"
    [ "$key" != "$line" ] || continue
    value="${line#*=}"
    case "$key" in
      scope_version) version="$value" ;;
      scope_mode) CF_SCOPE_MODE="$value" ;;
      scope_range) CF_SCOPE_RANGE="$value" ;;
      scope_complete) CF_SCOPE_COMPLETE="$value" ;;
      base_ref) CF_SCOPE_BASE_REF="$value" ;;
      base_branch) CF_SCOPE_BASE_BRANCH="$value" ;;
      current_branch) CF_SCOPE_CURRENT_BRANCH="$value" ;;
      head_sha) CF_SCOPE_HEAD_SHA="$value" ;;
      commit_range) CF_SCOPE_COMMIT_RANGE="$value" ;;
      has_committed) CF_SCOPE_HAS_COMMITTED="$value" ;;
      has_uncommitted) CF_SCOPE_HAS_UNCOMMITTED="$value" ;;
      has_staged) CF_SCOPE_HAS_STAGED="$value" ;;
      has_untracked) CF_SCOPE_HAS_UNTRACKED="$value" ;;
      files_total) total="$value" ;;
    esac
  done <"$meta"

  if [ "$version" != "$CF_SCOPE_VERSION" ]; then
    cf_scope_error "scope snapshot version '${version:-missing}' != expected $CF_SCOPE_VERSION at '$dir'"
    return 2
  fi
  if [ ! -r "$dir/files.z" ]; then
    cf_scope_error "scope snapshot is missing its file index '$dir/files.z'"
    return 2
  fi
  while IFS= read -r -d '' line; do
    [ -n "$line" ] || continue
    CF_SCOPE_FILES[${#CF_SCOPE_FILES[@]}]="$line"
    count=$((count + 1))
  done <"$dir/files.z"
  if [ "$count" != "${total:-}" ]; then
    cf_scope_error "scope snapshot file index is truncated: $count record(s), metadata says '${total:-missing}'"
    return 2
  fi
  if [ -r "$dir/excluded.z" ]; then
    while IFS= read -r -d '' line; do
      [ -n "$line" ] || continue
      CF_SCOPE_EXCLUDED[${#CF_SCOPE_EXCLUDED[@]}]="$line"
    done <"$dir/excluded.z"
  fi

  [ "$CF_SCOPE_COMPLETE" = true ] && return 0
  return 3
}
