#!/usr/bin/env bash
# Save a Claude Code session to the sessions folder.
#
# Usage: save-session.sh <sessions_dir> <session_id> <label> <jsonl_path> <preview>
#
# Creates <sessions_dir>/<label-slug>/ with session.jsonl and meta.json.

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

# Slugify label for folder name
# Keep in sync with: cli/src/lib/session.ts slugifyLabel()
FOLDER_NAME=$(echo "$LABEL" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-100 | sed 's/-$//')
[ -z "$FOLDER_NAME" ] && FOLDER_NAME="session"

# Deduplicate: append -2, -3, etc. if folder exists
if [ -d "$SESSIONS_DIR/$FOLDER_NAME" ]; then
  i=2
  while [ -d "$SESSIONS_DIR/${FOLDER_NAME}-${i}" ]; do
    i=$((i + 1))
  done
  FOLDER_NAME="${FOLDER_NAME}-${i}"
fi

DEST_DIR="$SESSIONS_DIR/$FOLDER_NAME"
mkdir -p "$DEST_DIR"

# Copy session JSONL
cp "$JSONL_PATH" "$DEST_DIR/session.jsonl"

# Write metadata via Python (safe argument passing, no interpolation)
python3 "$SCRIPT_DIR/write-meta.py" \
  "$SESSION_ID" "$LABEL" "$PROJECT_PATH" "$SAVED_AT" "$MACHINE" "$PREVIEW" "$DEST_DIR" "$FOLDER_NAME"

echo "$FOLDER_NAME"
