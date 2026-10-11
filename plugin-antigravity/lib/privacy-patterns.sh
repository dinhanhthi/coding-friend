#!/usr/bin/env bash
# privacy-patterns.sh — sensitive/safe path regexes for privacy-block hooks.
#
# Source this file from privacy-block.sh and privacy-block.agy.sh.
# Do not execute it. Use privacy_sensitive_pattern to check a path:
# SAFE_PATTERNS win, SENSITIVE_PATTERNS always block, KEYWORD_PATTERNS
# block unless the basename has a source/doc extension (e.g. secret-manager.ts).

# Sensitive patterns
SENSITIVE_PATTERNS=(
  '\.env$'
  # .env.local, config/.env.production — not config.env.ts / process.env.d.ts.
  # Any non-filename char may precede, so `cat .env.local` (AGY CommandLine)
  # and `**/.env.*` globs still match.
  '(^|[^[:alnum:]_.-])\.env\.'
  '\.pem$'
  '\.key$'
  'id_rsa'
  'id_ed25519'
  '\.ssh/'
  '\.aws/'
  '\.gnupg/'
)

# Keyword patterns: skipped when the basename ends in a source/doc extension
# (except exact secrets.py / credentials.js stems). Unanchored '\.env\.'
# blocks prod.env.local but not config.env.ts.
KEYWORD_PATTERNS=(
  'credentials'
  'secret'
  '\.env\.'
)

# Source/doc extensions exempt from KEYWORD_PATTERNS. Data/config formats
# (json, yaml, toml, ini, txt, ...) and .sh are deliberately not listed.
PRIVACY_CODE_EXT='\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|kts|scala|swift|php|cs|c|h|cc|cpp|hpp|m|mm|dart|lua|ex|exs|vue|svelte|astro|md|mdx|rst|html|css|scss)$'

# Safe patterns (allowlist)
SAFE_PATTERNS=(
  '\.example$'
  '\.sample$'
  '\.template$'
  '\.env\.example'
  '\.env\.sample'
  # cf-commit's own scanner script: its name matches 'secret' (#28). Kept
  # narrow on purpose: a safe match skips the whole path/command string.
  'cf-commit/scripts/scan-secrets\.sh'
)

# privacy_sensitive_pattern <path> — print the matching pattern and return 0
# when <path> is sensitive; return 1 otherwise.
privacy_sensitive_pattern() {
  local path="$1"
  local pattern base

  for pattern in "${SAFE_PATTERNS[@]}"; do
    if echo "$path" | grep -qiE "$pattern"; then
      return 1
    fi
  done

  for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if echo "$path" | grep -qiE "$pattern"; then
      printf '%s\n' "$pattern"
      return 0
    fi
  done

  # One trailing slash is stripped so AGY's "<path>/" variant keeps the
  # exemption. Strings with whitespace or shell metacharacters (AGY
  # CommandLine, e.g. `cat<secrets.yaml;:>a.ts`) get no exemption.
  base="${path%/}"
  base="${base##*/}"
  case "$path" in
    *[[:space:]';&|<>$`']*) base="" ;;
  esac
  # Exact secrets.py / credentials.js stems stay blocked; docs do not.
  if [ -n "$base" ] && echo "$base" | grep -qiE "$PRIVACY_CODE_EXT"; then
    if ! echo "$base" | grep -qiE '^(secrets?|credentials?)\.[^.]+$' \
      || echo "$base" | grep -qiE '\.(md|mdx|rst)$'; then
      return 1
    fi
  fi

  for pattern in "${KEYWORD_PATTERNS[@]}"; do
    if echo "$path" | grep -qiE "$pattern"; then
      printf '%s\n' "$pattern"
      return 0
    fi
  done

  return 1
}
