#!/usr/bin/env bash
# capture-later.sh — Record an out-of-scope side-effect as a doc under <docsRoot>/later/.
#
# Usage:
#   capture-later.sh --name <title> --description <text> \
#                    [--slug <plan/fix-slug>] [--problem <text>] [--source <skill>]
#
# Writes a dated Markdown file with YAML frontmatter and prints its absolute path to stdout.
# Returns exit 1 if required flags are missing.

set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Resolve CF_DOCS_ROOT
# ---------------------------------------------------------------------------
if [ -z "${CF_DOCS_ROOT:-}" ]; then
  # shellcheck source=plugin/lib/cf-paths.sh
  source "$(dirname "$0")/cf-paths.sh"
  cf_resolve_paths
fi

# ---------------------------------------------------------------------------
# 2. Parse named flags
# ---------------------------------------------------------------------------
name=""
description=""
slug=""
problem=""
source_skill="unknown"

while [ $# -gt 0 ]; do
  case "$1" in
    --name)
      name="${2:?--name requires a value}"
      shift 2
      ;;
    --description)
      description="${2:?--description requires a value}"
      shift 2
      ;;
    --slug)
      slug="${2:?--slug requires a value}"
      shift 2
      ;;
    --problem)
      problem="${2:?--problem requires a value}"
      shift 2
      ;;
    --source)
      source_skill="${2:?--source requires a value}"
      shift 2
      ;;
    *)
      printf 'capture-later.sh: unknown flag: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$name" ] || [ -z "$description" ]; then
  printf 'Usage: capture-later.sh --name <title> --description <text> [--slug <slug>] [--problem <text>] [--source <skill>]\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Detect conversation id (must NEVER abort the script)
# ---------------------------------------------------------------------------
detect_conversation_id() {
  local encoded claude_dir session_dir latest

  encoded=$(printf '%s' "$PWD" | sed 's|/|-|g')

  # Mirror cf_claude_dir() / detect-session.sh: honor CLAUDE_CONFIG_DIR, default ~/.claude
  claude_dir="${CLAUDE_CONFIG_DIR-}"
  claude_dir="${claude_dir#"${claude_dir%%[![:space:]]*}"}"
  claude_dir="${claude_dir%"${claude_dir##*[![:space:]]}"}"
  if [ -z "$claude_dir" ]; then
    claude_dir="$HOME/.claude"
  else
    case "$claude_dir" in
      "~")    claude_dir="$HOME" ;;
      "~/"*)  claude_dir="$HOME/${claude_dir#\~/}" ;;
    esac
  fi

  session_dir="$claude_dir/projects/$encoded"
  [ -d "$session_dir" ] || return 0

  latest=$(ls -t "$session_dir"/*.jsonl 2>/dev/null | grep -v '/agent-' | head -1 || true)
  [ -n "$latest" ] || return 0

  basename "$latest" .jsonl
}

conversation_id=$(detect_conversation_id || true)
conversation_id="${conversation_id:-unknown}"

# ---------------------------------------------------------------------------
# 4. Build filename with collision avoidance
# ---------------------------------------------------------------------------
date=$(date +%F)

# Slugify name: lowercase, collapse non-alphanumeric runs to '-', trim leading/trailing '-'
name_slug=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g' | sed 's/^-//;s/-$//')
name_slug="${name_slug:-untitled}"

later_dir="$CF_DOCS_ROOT/later"
base_filename="${date}-${name_slug}.md"
target_file="$later_dir/$base_filename"

if [ -e "$target_file" ]; then
  n=2
  while [ -e "${later_dir}/${date}-${name_slug}-${n}.md" ]; do
    n=$((n + 1))
  done
  target_file="${later_dir}/${date}-${name_slug}-${n}.md"
fi

# ---------------------------------------------------------------------------
# 5. Write the doc
# ---------------------------------------------------------------------------
mkdir -p "$later_dir"

# YAML-safe: single-quoted YAML scalars — collapse embedded newlines to spaces, escape ' as ''
yaml_escape() {
  printf '%s' "$1" | tr '\n' ' ' | sed "s/'/''/g"
}

{
  printf -- '---\n'
  printf 'date: %s\n' "$date"
  printf "source: '%s'\n" "$(yaml_escape "$source_skill")"
  if [ -n "$slug" ]; then
    printf "slug: '%s'\n" "$(yaml_escape "$slug")"
  fi
  if [ -n "$problem" ]; then
    printf "problem: '%s'\n" "$(yaml_escape "$problem")"
  fi
  printf "conversation_id: '%s'\n" "$(yaml_escape "$conversation_id")"
  printf -- '---\n'
  printf '\n'
  printf '# %s\n' "$name"
  printf '\n'
  printf '%s\n' "$description"
} > "$target_file"

# ---------------------------------------------------------------------------
# 6. Print the absolute path to stdout
# ---------------------------------------------------------------------------
printf '%s\n' "$target_file"
