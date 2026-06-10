#!/usr/bin/env bash
# PreToolUse hook: Block access to sensitive files.
#
# Prevents the agent from reading files that match sensitive patterns
# such as .env, .pem, .key, SSH keys, AWS/GPG credentials, and anything
# containing "secret" or "credentials" in the path.
#
# Safe patterns (.example, .sample, .template) are allowlisted and
# bypass the block. Runs before Read, Write, Edit, Glob, Grep tools.
#
# Integration contract:
#   stdin  – JSON with tool_input (file_path, command, pattern)
#   stdout – JSON with hookSpecificOutput on block, {} on allow
#   Exit 0 = allow, Exit 2 = block
#
# Configuration:
#   "privacyBlock": false in .coding-friend/config.json disables the hook.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"
cf_resolve_paths

# Check if hook is disabled via config
CONFIG_FILE="$CF_CONFIG_FILE"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '"privacyBlock"[[:space:]]*:[[:space:]]*false' "$CONFIG_FILE" 2>/dev/null; then
    echo '{}'
    exit 0
  fi
fi

# Read tool input from stdin
INPUT=$(cat)

# Extract path-like fields. file_path and pattern are simple values, so a grep
# is enough. The command field (Codex apply_patch) carries a JSON-escaped patch
# whose embedded `\"` quotes truncate a naive `"[^"]*"` capture and hide every
# header after the first quoted hunk — so when it is present, parse the JSON
# with node to recover the full command and extract the patch target paths.
FILE_PATH=$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
PATTERN=$(printf '%s' "$INPUT" | grep -o '"pattern"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"pattern"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

PATCH_PATHS=""
if printf '%s' "$INPUT" | grep -q '"command"'; then
  PATCH_PATHS=$(printf '%s' "$INPUT" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      try {
        const j = JSON.parse(s);
        const cmd = String((j.tool_input && j.tool_input.command) || "");
        const re =
          /^[ \t]*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gim;
        const out = [];
        let m;
        while ((m = re.exec(cmd))) out.push(m[1].trim());
        process.stdout.write(out.join("\n"));
      } catch {}
    });
  ' 2>/dev/null || true)
fi

# Collect all paths to check
PATHS_TO_CHECK="$FILE_PATH $PATTERN $PATCH_PATHS"

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
