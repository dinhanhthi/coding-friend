#!/usr/bin/env bash
# list-learn-files.sh — list existing learn markdown files for deduplication check
# Usage: bash list-learn-files.sh <outputDir>

OUTPUT_DIR="${1:?Usage: list-learn-files.sh <outputDir>}"

find "$OUTPUT_DIR" -name "*.md" -not -name "README.md" 2>/dev/null | sort
