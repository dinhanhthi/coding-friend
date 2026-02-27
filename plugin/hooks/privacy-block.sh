#!/usr/bin/env bash
# PreToolUse hook: Block access to sensitive files
# Exit code 2 = block the tool execution

set -euo pipefail

# Check if hook is disabled via config
CONFIG_FILE=".coding-friend/config.json"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '"privacyBlock"[[:space:]]*:[[:space:]]*false' "$CONFIG_FILE" 2>/dev/null; then
    echo '{}'
    exit 0
  fi
fi

# Read tool input from stdin
INPUT=$(cat)

# Extract file path from tool input
FILE_PATH=$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
COMMAND=$(printf '%s' "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
PATTERN=$(printf '%s' "$INPUT" | grep -o '"pattern"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"pattern"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

# Collect all paths to check
PATHS_TO_CHECK="$FILE_PATH $COMMAND $PATTERN"

# Sensitive patterns
SENSITIVE_PATTERNS=(
  '\.env$'
  '\.env\.'
  'credentials'
  '\.pem$'
  '\.key$'
  'id_rsa'
  'id_ed25519'
  '\.ssh/'
  'secret'
  '\.aws/'
  '\.gnupg/'
)

# Safe patterns (allowlist)
SAFE_PATTERNS=(
  '\.example$'
  '\.sample$'
  '\.template$'
  '\.env\.example'
  '\.env\.sample'
)

for path in $PATHS_TO_CHECK; do
  [ -z "$path" ] && continue

  # Check safe patterns first
  is_safe=false
  for safe in "${SAFE_PATTERNS[@]}"; do
    if echo "$path" | grep -qiE "$safe"; then
      is_safe=true
      break
    fi
  done
  $is_safe && continue

  # Check sensitive patterns
  for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if echo "$path" | grep -qiE "$pattern"; then
      cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "Access to '$path' blocked by privacy-block. File matches sensitive pattern: $pattern"
  }
}
EOF
      exit 2
    fi
  done
done

# Allow
echo '{}'
