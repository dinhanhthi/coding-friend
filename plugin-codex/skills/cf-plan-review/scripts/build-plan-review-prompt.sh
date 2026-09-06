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
