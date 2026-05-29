#!/usr/bin/env bash
# SessionStart hook: Bootstrap coding-friend context.
#
# Fires on startup, resume, clear, and compact events. Loads the
# bootstrap context and injects it as additional context so the agent
# knows about all available skills, rules, and conventions.
#
# Also detects:
#   - Project type (single-repo, monorepo, rust, go, python)
#   - Package manager (npm, pnpm, yarn, bun)
#   - Ignore patterns from .coding-friend/ignore
#
# Output:
#   JSON with hookSpecificOutput.additionalContext containing the full
#   bootstrapped context (project info + skills).
#
# Configuration:
#   "docsDir" in .coding-friend/config.json overrides the default docs directory.

set -euo pipefail

LOG_FILE="${TMPDIR:-/tmp}/coding-friend-session-init.log"
exec 2>>"$LOG_FILE"
echo "=== session-init.sh started at $(date) ===" >>"$LOG_FILE"
trap 'echo "ERROR: session-init.sh failed at line $LINENO (exit $?)" >>"$LOG_FILE"' ERR

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Source the shared path resolver
# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"
cf_resolve_paths

BOOTSTRAP_FILE="$PLUGIN_ROOT/context/bootstrap.md"

# Read the bootstrap context
if [ ! -f "$BOOTSTRAP_FILE" ]; then
  echo '{}'
  exit 0
fi

CONTENT=$(cat "$BOOTSTRAP_FILE")

# Use resolved paths from cf-paths.sh (worktree-aware)
CONFIG_FILE="$CF_CONFIG_FILE"
DOCS_DIR="$CF_DOCS_ROOT"

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
if [ -f "$MAIN_REPO_ROOT/.coding-friend/ignore" ]; then
  CFIGNORE_FILE="$MAIN_REPO_ROOT/.coding-friend/ignore"
fi
if [ -f "$CFIGNORE_FILE" ]; then
  CFIGNORE_PATTERNS=$(grep -v '^#' "$CFIGNORE_FILE" | grep -v '^$' | tr '\n' '|' | sed 's/|$//')
fi

# ─── Vacuum orphaned agent context files (older than 7 days) ──────
# When a workflow is aborted mid-run, the orchestrating skill may not
# get to delete its <docsDir>/context/<task-id>.json file. Sweep any
# such files older than 7 days here so they don't accumulate forever.
# Best-effort — never block session startup on cleanup errors.
CONTEXT_DIR="$CF_DOCS_ROOT/context"
if [ -d "$CONTEXT_DIR" ]; then
  find "$CONTEXT_DIR" -maxdepth 1 -type f -name "*.json" -mtime +7 -print -delete 2>/dev/null \
    | while IFS= read -r f; do
        echo "[session-init] vacuumed stale context file: $f" >>"$LOG_FILE"
      done || true
fi

# Build context
CONTEXT="<IMPORTANT>
PROJECT_TYPE: $PROJECT_TYPE
PKG_MANAGER: $PKG_MANAGER
DOCS_DIR: $DOCS_DIR
MAIN_REPO_ROOT: $MAIN_REPO_ROOT
CF_DOCS_ROOT: $CF_DOCS_ROOT
CFIGNORE: $CFIGNORE_PATTERNS

$CONTENT
</IMPORTANT>"

# ─── Warn about dangerous rules when auto-approve is active ────────
if [ -f "$CF_CONFIG_FILE" ]; then
  auto_approve=$(CF_CONFIG_FILE="$CF_CONFIG_FILE" node -e "try{const c=JSON.parse(require('fs').readFileSync(process.env.CF_CONFIG_FILE,'utf8'));console.log(c.autoApprove===true?'1':'0')}catch{console.log('0')}" 2>/dev/null)
  if [ "$auto_approve" = "1" ]; then
    _check_dangerous_rules() {
      local settings_file="$1"
      if [ -f "$settings_file" ]; then
        CF_SETTINGS_FILE="$settings_file" node -e "
          try {
            const s = JSON.parse(require('fs').readFileSync(process.env.CF_SETTINGS_FILE, 'utf8'));
            const rules = (s.permissions && s.permissions.allow) || [];
            const dangerous = [/^Bash\(\\*\)$/, /^Bash\(python\*?\)$/, /^Bash\(python3\*?\)$/, /^Bash\(node\*?\)$/, /^Bash\(ruby\*?\)$/, /^Bash\(perl\*?\)$/, /^Bash\(sh\*?\)$/, /^Bash\(bash\*?\)$/, /^Bash\(npm run\*?\)$/, /^Bash\(npx\*?\)$/, /^Agent\(\\*\)$/];
            const found = rules.filter(r => dangerous.some(p => p.test(r)));
            if (found.length > 0) {
              console.error('[auto-approve] WARNING: Found ' + found.length + ' dangerous allow rule(s) that bypass the classifier: ' + found.join(', '));
              console.error('[auto-approve] Run \"cf config\" to remove them.');
            }
          } catch {}
        " 2>&1 >&2
      fi
    }
    _check_dangerous_rules ".claude/settings.json"
    _check_dangerous_rules ".claude/settings.local.json"
    _check_dangerous_rules "$(cf_claude_dir)/settings.json"
  fi
fi

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
