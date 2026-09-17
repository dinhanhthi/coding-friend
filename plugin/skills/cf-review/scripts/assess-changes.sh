#!/usr/bin/env bash
# assess-changes.sh — pick the cf-review depth from the SAME scope capture the
# reviewers get, so assessment and review can never disagree.
#
# Usage:
#   bash assess-changes.sh --snapshot-dir <dir>       # reuse gather-diff's capture
#   bash assess-changes.sh                            # legacy target, collected live
#   bash assess-changes.sh --uncommitted [--path P]…  # same target flags as gather
#   bash assess-changes.sh --range <git-range>
#   … [--quick | --deep]                              # explicit depth override
#
# With --snapshot-dir nothing is re-derived: no git command runs, every metric
# comes from <dir>/metadata.txt + <dir>/files.z. Without it the same
# review-scope.sh collector runs, so there is still only one counting path.
#
# Output: KEY=value lines — FILES_CHANGED, LINES_CHANGED, SENSITIVE,
# CHANGED_FILES, SCOPE_COMPLETE, MODE_AUTO, MODE_FORCED, MODE.
#
# Exit: 0 complete · 2 structural failure (no MODE emitted — a QUICK default
# would silently under-review) · 3 scope collected but incomplete.

# Builtins only, so a broken PATH still reaches the "git is not available" error.
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ] && SCRIPT_DIR="."
SCRIPT_DIR=$(cd "$SCRIPT_DIR" && pwd)
# shellcheck source=./review-scope.sh
. "$SCRIPT_DIR/review-scope.sh"

forced=""
snapshot_dir=""
scope_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --quick | --deep)
      if [ -n "$forced" ] && [ "$forced" != "${1#--}" ]; then
        cf_scope_error "conflicting depth flags: --$forced and $1"
        exit 2
      fi
      forced="${1#--}"
      shift
      ;;
    --snapshot-dir)
      case "${2-}" in
        "" | -*)
          cf_scope_error "--snapshot-dir requires a value"
          exit 2
          ;;
      esac
      snapshot_dir="$2"
      shift 2
      ;;
    *)
      scope_args[${#scope_args[@]}]="$1"
      shift
      ;;
  esac
done

if [ -n "$snapshot_dir" ] && [ ${#scope_args[@]} -gt 0 ]; then
  cf_scope_error "--snapshot-dir reads an existing capture; it cannot be combined with target flags (${scope_args[*]})"
  exit 2
fi

if [ -n "$snapshot_dir" ]; then
  cf_scope_read_snapshot "$snapshot_dir"
  status=$?
else
  cf_scope_parse_args ${scope_args[@]+"${scope_args[@]}"} && cf_scope_collect
  status=$?
fi
# Structural failure: emit no metrics at all rather than an all-zero QUICK.
[ "$status" -eq 2 ] && exit 2

# High-signal terms match as substrings (useAuth.ts, authService.ts); noisy terms
# (token, session, security) must be a whole path word so tokens.css,
# tokenDiscipline.test.ts, or sessions.ts do not force DEEP mode.
SENSITIVE_RE='(auth|crypto|login|password|secret|middleware|api/|[.]env)|(^|[^[:alnum:]])(token|session|security)([^[:alnum:]]|$)'

# One pass over the capture's `origin added deleted path` records. Files are
# counted once even when the same path changed in several origins; line counts
# add up across origins. `-` is git's binary marker: a binary file counts as a
# file and contributes no invented lines.
NL='
'
files_changed=0
lines_changed=0
seen="$NL"
paths=()
for record in ${CF_SCOPE_FILES[@]+"${CF_SCOPE_FILES[@]}"}; do
  rest="${record#* }" # drop origin
  added="${rest%% *}"
  rest="${rest#* }"
  deleted="${rest%% *}"
  path="${rest#* }"
  case "$added" in '' | *[!0-9]*) added=0 ;; esac
  case "$deleted" in '' | *[!0-9]*) deleted=0 ;; esac
  lines_changed=$((lines_changed + added + deleted))
  case "$seen" in *"$NL$path$NL"*) continue ;; esac
  seen="$seen$path$NL"
  paths[${#paths[@]}]="$path"
  files_changed=$((files_changed + 1))
done

sensitive=0
if [ ${#paths[@]} -gt 0 ]; then
  # grep -c exits 1 on no match; keep the count and never an empty string.
  sensitive=$(printf '%s\n' "${paths[@]}" | grep -ciE "$SENSITIVE_RE")
  case "$sensitive" in '' | *[!0-9]*) sensitive=0 ;; esac
fi

mode_auto="QUICK"
if [ "$sensitive" -gt 0 ] || [ "$files_changed" -gt 10 ] || [ "$lines_changed" -gt 300 ]; then
  mode_auto="DEEP"
elif [ "$files_changed" -ge 4 ] || [ "$lines_changed" -ge 51 ]; then
  mode_auto="STANDARD"
fi

mode="$mode_auto"
case "$forced" in
  quick) mode="QUICK" ;;
  deep) mode="DEEP" ;;
esac

if [ "$forced" = "quick" ] && [ "$sensitive" -gt 0 ]; then
  # Non-fatal, but never silent: the caller asked for less depth than the
  # sensitive paths warrant, and that limitation has to reach the report.
  echo "WARNING: --quick reduced depth from $mode_auto to QUICK on $sensitive sensitive path(s) — the secrets/injection security baseline still applies and must be reported" >&2
fi

echo "FILES_CHANGED=${files_changed}"
echo "LINES_CHANGED=${lines_changed}"
echo "SENSITIVE=${sensitive}"
echo "CHANGED_FILES=$(printf '%s ' ${paths[@]+"${paths[@]}"})"
echo "SCOPE_COMPLETE=${CF_SCOPE_COMPLETE}"
echo "MODE_AUTO=${mode_auto}"
echo "MODE_FORCED=${forced}"
echo "MODE=${mode}"

exit "$status"
