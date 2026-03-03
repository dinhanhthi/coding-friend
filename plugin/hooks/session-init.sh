#!/usr/bin/env bash
# SessionStart hook: Bootstrap coding-friend context.
#
# Fires on startup, resume, clear, and compact events. Loads the
# cf-help meta-skill content and injects it as additional context so
# the agent knows about all available skills, rules, and conventions.
#
# Also detects:
#   - Project type (single-repo, monorepo, rust, go, python)
#   - Package manager (npm, pnpm, yarn, bun)
#   - Ignore patterns from .coding-friend/ignore
#   - Custom skill guides from .coding-friend/skills/ and ~/.coding-friend/skills/
#     with validation (skill name, section format, size limits)
#
# Output:
#   JSON with hookSpecificOutput.additionalContext containing the full
#   bootstrapped context (project info + skills + custom guides + warnings).
#
# Configuration:
#   "docsDir" in .coding-friend/config.json overrides the default docs directory.

set -euo pipefail

LOG_FILE="${TMPDIR:-/tmp}/coding-friend-session-init.log"
exec 2>>"$LOG_FILE"
echo "=== session-init.sh started at $(date) ===" >>"$LOG_FILE"
trap 'echo "ERROR: session-init.sh failed at line $LINENO (exit $?)" >>"$LOG_FILE"' ERR

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SKILL_FILE="$PLUGIN_ROOT/skills/cf-help/SKILL.md"

# Read the meta-skill content
if [ ! -f "$SKILL_FILE" ]; then
  echo '{}'
  exit 0
fi

CONTENT=$(cat "$SKILL_FILE")

# Load config
CONFIG_FILE=".coding-friend/config.json"
DOCS_DIR="docs"
if [ -f "$CONFIG_FILE" ]; then
  CUSTOM_DIR=$(grep -o '"docsDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | sed 's/.*"docsDir"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
  if [ -n "$CUSTOM_DIR" ]; then
    DOCS_DIR="$CUSTOM_DIR"
  fi
fi

# Detect project type
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

# Detect package manager
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

# Load ignore patterns if present
CFIGNORE_PATTERNS=""
CFIGNORE_FILE="$PLUGIN_ROOT/.coding-friend/ignore"
if [ -f ".coding-friend/ignore" ]; then
  CFIGNORE_FILE=".coding-friend/ignore"
fi
if [ -f "$CFIGNORE_FILE" ]; then
  CFIGNORE_PATTERNS=$(grep -v '^#' "$CFIGNORE_FILE" | grep -v '^$' | tr '\n' '|' | sed 's/|$//')
fi

# Load custom skill guides
# Scan global (~/.coding-friend/skills/) and local (.coding-friend/skills/) directories
# Local files override global files with the same name
CUSTOM_GUIDES=""
declare -A GUIDE_MAP=()

GLOBAL_SKILLS_DIR="$HOME/.coding-friend/skills"
LOCAL_SKILLS_DIR=".coding-friend/skills"
MAX_TOTAL_CHARS=4000

# Collect global guides first
if [ -d "$GLOBAL_SKILLS_DIR" ]; then
  for guide_file in "$GLOBAL_SKILLS_DIR"/*.md; do
    [ -f "$guide_file" ] || continue
    skill_name=$(basename "$guide_file" .md)
    GUIDE_MAP["$skill_name"]="$guide_file"
  done
fi

# Local guides override global
if [ -d "$LOCAL_SKILLS_DIR" ]; then
  for guide_file in "$LOCAL_SKILLS_DIR"/*.md; do
    [ -f "$guide_file" ] || continue
    skill_name=$(basename "$guide_file" .md)
    GUIDE_MAP["$skill_name"]="$guide_file"
  done
fi

# Build valid skill list from plugin
declare -A VALID_SKILLS=()
for skill_dir in "$PLUGIN_ROOT/skills"/*/; do
  [ -d "$skill_dir" ] || continue
  VALID_SKILLS["$(basename "$skill_dir")"]=1
done

# Build custom guides block with validation
guide_count=${#GUIDE_MAP[@]}
GUIDE_WARNINGS=""
if [ "$guide_count" -gt 0 ]; then
  GUIDES_CONTENT=""
  total_chars=0
  for skill_name in "${!GUIDE_MAP[@]}"; do
    guide_file="${GUIDE_MAP[$skill_name]}"
    guide_content=$(cat "$guide_file")

    # Validate skill name
    if [ -z "${VALID_SKILLS[$skill_name]+x}" ]; then
      # Find closest match for suggestion
      best_match=""
      for valid in "${!VALID_SKILLS[@]}"; do
        # Simple prefix/substring match for "did you mean?"
        if [[ "$valid" == *"${skill_name#cf-}"* ]] || [[ "$skill_name" == *"${valid#cf-}"* ]]; then
          best_match="$valid"
          break
        fi
      done
      suggestion=""
      if [ -n "$best_match" ]; then
        suggestion=" Did you mean \"${best_match}\"?"
      fi
      GUIDE_WARNINGS="${GUIDE_WARNINGS}
- \"${skill_name}.md\": Unknown skill name. No built-in skill called \"${skill_name}\" exists.${suggestion}"
      echo "WARNING: Unknown skill name '${skill_name}' in custom guide" >>"$LOG_FILE"
      continue
    fi

    # Validate section format
    has_valid_section=false
    has_wrong_level=""
    if echo "$guide_content" | grep -q '^## Before'; then has_valid_section=true; fi
    if echo "$guide_content" | grep -q '^## Rules'; then has_valid_section=true; fi
    if echo "$guide_content" | grep -q '^## After'; then has_valid_section=true; fi
    # Check for wrong heading level (h1 or h3 instead of h2)
    if echo "$guide_content" | grep -qE '^# (Before|Rules|After)$'; then
      has_wrong_level="Found \"# ...\" (h1) — use \"## ...\" (h2) instead."
    elif echo "$guide_content" | grep -qE '^### (Before|Rules|After)'; then
      has_wrong_level="Found \"### ...\" (h3) — use \"## ...\" (h2) instead."
    fi

    if [ "$has_valid_section" = false ]; then
      format_hint="Use ## Before, ## Rules, or ## After (h2 level, all optional)."
      if [ -n "$has_wrong_level" ]; then
        format_hint="${format_hint} ${has_wrong_level}"
      fi
      GUIDE_WARNINGS="${GUIDE_WARNINGS}
- \"${skill_name}.md\": No recognized sections found. ${format_hint}"
      echo "WARNING: No valid sections in custom guide '${skill_name}'" >>"$LOG_FILE"
      continue
    fi

    if [ -n "$has_wrong_level" ]; then
      GUIDE_WARNINGS="${GUIDE_WARNINGS}
- \"${skill_name}.md\": Some sections use wrong heading level. ${has_wrong_level}"
    fi

    # Size limit check
    content_len=${#guide_content}
    new_total=$((total_chars + content_len))
    if [ "$new_total" -gt "$MAX_TOTAL_CHARS" ]; then
      GUIDE_WARNINGS="${GUIDE_WARNINGS}
- \"${skill_name}.md\": Skipped — total custom guides exceed ${MAX_TOTAL_CHARS} character limit."
      echo "WARNING: Custom guides exceed ${MAX_TOTAL_CHARS} chars limit, skipping ${skill_name}" >>"$LOG_FILE"
      continue
    fi
    total_chars=$new_total
    GUIDES_CONTENT="${GUIDES_CONTENT}
### ${skill_name}
${guide_content}
"
  done

  if [ -n "$GUIDES_CONTENT" ]; then
    CUSTOM_GUIDES="
<custom-guides>
When executing a skill that has a custom guide below, integrate the guide sections:
- \"## Before\" → run BEFORE Step 1 of the builtin workflow
- \"## Rules\" → apply as additional rules THROUGHOUT the workflow
- \"## After\" → run AFTER the final step completes
All sections are optional. Only apply the guide matching the skill being executed.
${GUIDES_CONTENT}</custom-guides>"
  fi
fi

# Build guide warnings block
GUIDE_WARNINGS_BLOCK=""
if [ -n "$GUIDE_WARNINGS" ]; then
  valid_list=$(printf '%s, ' "${!VALID_SKILLS[@]}" | sed 's/, $//')
  GUIDE_WARNINGS_BLOCK="
<guide-warnings>
IMPORTANT: Show these warnings to the user IMMEDIATELY at the start of the conversation. Display them prominently so the user can fix their custom skill guides.

Custom Skill Guide Issues:
${GUIDE_WARNINGS}

Valid skill names: ${valid_list}
Guide location: .coding-friend/skills/<skill-name>.md or ~/.coding-friend/skills/<skill-name>.md
Required format: ## Before, ## Rules, ## After (all optional, h2 level)
</guide-warnings>"
fi

# Build context
CONTEXT="<IMPORTANT>
PROJECT_TYPE: $PROJECT_TYPE
PKG_MANAGER: $PKG_MANAGER
DOCS_DIR: $DOCS_DIR
CFIGNORE: $CFIGNORE_PATTERNS

$CONTENT
</IMPORTANT>${CUSTOM_GUIDES}${GUIDE_WARNINGS_BLOCK}"

# JSON-escape context
ESCAPED_CTX=$(printf '%s' "$CONTEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "$ESCAPED_CTX"
  }
}
EOF
