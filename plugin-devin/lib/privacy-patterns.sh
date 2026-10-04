#!/usr/bin/env bash
# privacy-patterns.sh — sensitive/safe path regexes for privacy-block hooks.
#
# Source this file from privacy-block.sh and privacy-block.agy.sh.
# Do not execute it.

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
  # cf-commit's own scanner script: its name matches 'secret' (#28). Kept
  # narrow on purpose: a safe match skips the whole path/command string.
  'cf-commit/scripts/scan-secrets\.sh'
)
