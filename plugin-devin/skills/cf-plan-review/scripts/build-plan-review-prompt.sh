#!/usr/bin/env bash
# build-plan-review-prompt.sh — concatenate a plan folder into a review prompt
# Usage: bash build-plan-review-prompt.sh <plan-entry-file> [docs-dir]
# Output: plan-review prompt to stdout

set -euo pipefail

ENTRY="${1:-}"
DOCS_DIR="${2:-docs}"

if [ -z "$ENTRY" ]; then
  echo "ERROR: No plan entry file provided" >&2
  exit 1
fi

if [ ! -f "$ENTRY" ]; then
  echo "ERROR: Plan entry file not found: $ENTRY" >&2
  exit 1
fi

# Ignore patterns from .coding-friend/ignore (CFIGNORE_PATTERNS), parsed by the
# shared lib exactly as cf-review's scope filter does. Filtering is a security
# control (the prompt goes to external reviewers): no lib → fail closed.
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ] && SCRIPT_DIR="."
LIB_DIR="$(cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd)/lib"
if [ ! -r "$LIB_DIR/cf-paths.sh" ] || [ ! -r "$LIB_DIR/session-detect.sh" ]; then
  echo "ERROR: Coding Friend lib not found at $LIB_DIR — cannot apply .coding-friend/ignore" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$LIB_DIR/cf-paths.sh"
# shellcheck source=/dev/null
. "$LIB_DIR/session-detect.sh"
[ -n "${MAIN_REPO_ROOT:-}" ] || cf_resolve_paths
PLUGIN_ROOT="${PLUGIN_ROOT:-${LIB_DIR%/lib}}"
# An ignore file that exists but cannot be read would silently embed everything.
if [ -e "$MAIN_REPO_ROOT/.coding-friend/ignore" ] && [ ! -r "$MAIN_REPO_ROOT/.coding-friend/ignore" ]; then
  echo "ERROR: cannot read $MAIN_REPO_ROOT/.coding-friend/ignore — refusing to build the prompt" >&2
  exit 1
fi
# Its grep pipeline exits 1 on an ignore file with only comments; that is fine.
cf_detect_session >/dev/null 2>&1 || true

# is_ignored <path> — 0 when <path> (made relative to the repo root) matches an
# ignore entry, with the same four forms as cf-review's review-scope.sh.
is_ignored() {
  local p="$1" pat
  [ -n "${CFIGNORE_PATTERNS:-}" ] || return 1
  p="${p#./}"
  case "$p" in
    "$MAIN_REPO_ROOT"/*) p="${p#"$MAIN_REPO_ROOT"/}" ;;
  esac
  # Read line by line: an unquoted `for` would glob-expand the patterns.
  while IFS= read -r pat; do
    pat="${pat%/}"
    [ -n "$pat" ] || continue
    # shellcheck disable=SC2254 # ignore entries are glob patterns by design
    case "$p" in
      $pat | $pat/* | */$pat | */$pat/*) return 0 ;;
    esac
  done <<PATTERNS
$(printf '%s\n' "$CFIGNORE_PATTERNS" | tr '|' '\n')
PATTERNS
  return 1
}

entry_base=$(basename "$ENTRY")
plan_dir=$(dirname "$ENTRY")

if [ "$entry_base" = "README.md" ]; then
  slug=$(basename "$plan_dir")
  legacy=false
else
  slug="${entry_base%.md}"
  legacy=true
fi

emit_file() {
  heading="$1"
  file="$2"
  if is_ignored "$file"; then
    printf '> Skipped %s — matches .coding-friend/ignore (not included in this prompt).\n\n' "$heading"
    return 0
  fi
  printf '### %s\n\n```markdown\n' "$heading"
  cat "$file"
  printf '\n```\n\n'
}

cat <<EOF
# Plan Review Request

- **Plan folder:** ${plan_dir}
- **Slug:** ${slug}
- **Docs dir:** ${DOCS_DIR}

## Your Task

Review this plan before implementing. Check all of the following:

1. Tasks cover the Request / Success Criteria in \`brief.md\` (when present).
2. Files, functions, and commands named in tasks exist in the repo. Spot-check read-only — do not run verify steps.
3. Phases marked \`[parallel]\` have no file overlap between tasks.
4. Each task has specific Files + Verify. No placeholders (\`TBD\`, \`TODO\`, \`implement later\`, \`similar to\`).
5. Contradictions between \`brief.md\` and the tasks.
6. Missing risks / rollback.
7. A \`## AUTOPILOT\` block must exist when frontmatter has \`auto: true\`.
8. No task violates Not Building.
9. Planned new tests stay few: only for a key feature's core behavior, a security-sensitive path, a breaking change / public contract, or a bug regression. Flag trivial tests (constants, types, getters, one per branch, every edge case) and exhaustive test-case lists.

## Output Format

**IMPORTANT**: Write your review in this exact format. This allows automated tools to parse your findings.

Each finding: \`- [file:line] mô tả — đề xuất sửa\`

## 🚨 Critical Issues

## ⚠️ Important Issues

## 💡 Suggestions

## 📋 Summary

## Plan Files

EOF

if [ "$legacy" = true ]; then
  emit_file "$entry_base" "$ENTRY"
  exit 0
fi

if [ -f "$plan_dir/brief.md" ]; then
  emit_file "brief.md" "$plan_dir/brief.md"
else
  printf '> brief.md not found — review against README.md and phase files only.\n\n'
fi

if [ -f "$plan_dir/README.md" ]; then
  emit_file "README.md" "$plan_dir/README.md"
fi

while IFS= read -r phase; do
  [ -n "$phase" ] || continue
  [ -f "$phase" ] || continue
  base=$(basename "$phase")
  case "$base" in
    overview.* | review.md) continue ;;
  esac
  emit_file "$base" "$phase"
done <<PHASES
$(find "$plan_dir" -maxdepth 1 -type f -name 'phase-*-*.md' | sort)
PHASES

# Supporting docs the planner left next to the phases (baseline.md, review-request.md, …).
while IFS= read -r extra; do
  [ -n "$extra" ] || continue
  [ -f "$extra" ] || continue
  base=$(basename "$extra")
  case "$base" in
    README.md | brief.md | overview.* | review.md | phase-*-*.md) continue ;;
  esac
  emit_file "$base" "$extra"
done <<EXTRAS
$(find "$plan_dir" -maxdepth 1 -type f -name '*.md' | sort)
EXTRAS
