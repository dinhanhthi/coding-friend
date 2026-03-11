#!/usr/bin/env bash
# Save a Claude Code session to the sessions folder.
#
# Usage: save-session.sh <sessions_dir> <session_id> <label> <jsonl_path> <preview>
#
# Creates <sessions_dir>/<session_id>/ with session.jsonl and meta.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

SESSIONS_DIR="$1"
SESSION_ID="$2"
LABEL="$3"
JSONL_PATH="$4"
PREVIEW="$5"

PROJECT_PATH=$(pwd)
MACHINE=$(hostname)
SAVED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

DEST_DIR="$SESSIONS_DIR/$SESSION_ID"
mkdir -p "$DEST_DIR"

# Copy session JSONL
cp "$JSONL_PATH" "$DEST_DIR/session.jsonl"

# Write metadata via Python (safe argument passing, no interpolation)
python3 "$SCRIPT_DIR/write-meta.py" \
  "$SESSION_ID" "$LABEL" "$PROJECT_PATH" "$SAVED_AT" "$MACHINE" "$PREVIEW" "$DEST_DIR"
