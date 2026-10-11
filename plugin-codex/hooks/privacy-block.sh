#!/usr/bin/env bash
# PreToolUse hook: Block access to sensitive files.
#
# Prevents the agent from reading files that match sensitive patterns
# such as .env, .pem, .key, SSH keys, AWS/GPG credentials, and paths
# containing "secret" or "credentials" (except source/doc files such as
# secret-manager.ts). See lib/privacy-patterns.sh.
#
# Safe patterns (.example, .sample, .template) are allowlisted and
# bypass the block. Runs before Read, Write, Edit, Glob, Grep tools.
# Grep's pattern is a content regex, not a path, so it is not checked.
#
# Integration contract:
#   stdin  – JSON with tool_name, tool_input (file_path, command, pattern)
#   stdout – JSON with hookSpecificOutput on block, {} on allow
#   Exit 0 = allow, Exit 2 = block
#
# Configuration:
#   "privacyBlock": false in .coding-friend/config.json disables the hook.

set -euo pipefail

PLUGIN_ROOT="${PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"
cf_resolve_paths
# shellcheck source=../lib/privacy-patterns.sh
source "$PLUGIN_ROOT/lib/privacy-patterns.sh"

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
TOOL_NAME=$(printf '%s' "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

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

# Collect all paths to check as an array
PATHS_ARRAY=()
[ -n "$FILE_PATH" ] && PATHS_ARRAY+=("$FILE_PATH")
# Grep's pattern is a content regex, not a path (Devin sends lowercase "grep").
if [ -n "$PATTERN" ] && ! printf '%s' "$TOOL_NAME" | grep -qi '^grep$'; then
  PATHS_ARRAY+=("$PATTERN")
fi
if [ -n "$PATCH_PATHS" ]; then
  while IFS= read -r patch_path; do
    [ -n "$patch_path" ] && PATHS_ARRAY+=("$patch_path")
  done <<< "$PATCH_PATHS"
fi

# bash 3.2 + set -u: "${arr[@]}" aborts on empty arrays; [@]:- yields one empty word.
for path in "${PATHS_ARRAY[@]:-}"; do
  [ -z "$path" ] && continue

  pattern="$(privacy_sensitive_pattern "$path" || true)"
  if [ -n "$pattern" ]; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Access to '$path' blocked by privacy-block. File matches sensitive pattern: $pattern"
  }
}
EOF
    exit 2
  fi
done

# Allow
echo '{}'
