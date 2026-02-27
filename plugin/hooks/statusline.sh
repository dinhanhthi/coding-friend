#!/usr/bin/env bash
# Statusline: Show session info in Claude Code status bar
# Usage: Run `cf statusline` to configure, or add to ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "bash <plugin-path>/hooks/statusline.sh" }

set -euo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Colors
BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
GRAY=$'\033[0;90m'
CYAN=$'\033[0;36m'
YELLOW=$'\033[0;33m'
RESET=$'\033[0m'

# Usage color gradient: green → red
LEVEL_1=$'\033[38;5;22m'   # dark green
LEVEL_2=$'\033[38;5;28m'   # soft green
LEVEL_3=$'\033[38;5;34m'   # medium green
LEVEL_4=$'\033[38;5;100m'  # green-yellowish
LEVEL_5=$'\033[38;5;142m'  # olive
LEVEL_6=$'\033[38;5;178m'  # muted yellow
LEVEL_7=$'\033[38;5;172m'  # yellow-orange
LEVEL_8=$'\033[38;5;166m'  # darker orange
LEVEL_9=$'\033[38;5;160m'  # dark red
LEVEL_10=$'\033[38;5;124m' # deep red

separator="${GRAY} │ ${RESET}"

# Plugin version — read from plugin.json in CLAUDE_PLUGIN_ROOT (works for both dev and installed)
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
VERSION=""
if [ -f "$PLUGIN_ROOT/.claude-plugin/plugin.json" ]; then
  VERSION=$(jq -r '.version // empty' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null)
fi
if [ -z "$VERSION" ]; then
  VERSION=$(jq -r '.plugins["coding-friend@coding-friend-marketplace"][0].version // empty' "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null)
fi

# Current folder
current_dir_path=$(echo "$INPUT" | grep -o '"current_dir":"[^"]*"' | sed 's/"current_dir":"//;s/"$//')
current_dir=$(basename "$current_dir_path")

# Active model
MODEL=$(echo "$INPUT" | jq -r '.session.model // empty' 2>/dev/null)
if [ -z "$MODEL" ]; then
  MODEL=$(echo "$INPUT" | jq -r '.model.display_name // empty' 2>/dev/null)
fi

# Git branch
branch_text=""
if git rev-parse --git-dir > /dev/null 2>&1; then
  branch=$(git branch --show-current 2>/dev/null)
  [ -n "$branch" ] && branch_text="${GREEN}⎇ ${branch}${RESET}"
fi

# Usage (percentage + reset time)
usage_text=""
swift_result=$(swift "$HOME/.claude/fetch-claude-usage.swift" 2>/dev/null) || true

if [ -n "$swift_result" ]; then
  utilization=$(echo "$swift_result" | cut -d'|' -f1)
  resets_at=$(echo "$swift_result" | cut -d'|' -f2)

  if [ -n "$utilization" ] && [ "$utilization" != "ERROR" ]; then
    # Pick color based on utilization level
    if [ "$utilization" -le 10 ]; then
      usage_color="$LEVEL_1"
    elif [ "$utilization" -le 20 ]; then
      usage_color="$LEVEL_2"
    elif [ "$utilization" -le 30 ]; then
      usage_color="$LEVEL_3"
    elif [ "$utilization" -le 40 ]; then
      usage_color="$LEVEL_4"
    elif [ "$utilization" -le 50 ]; then
      usage_color="$LEVEL_5"
    elif [ "$utilization" -le 60 ]; then
      usage_color="$LEVEL_6"
    elif [ "$utilization" -le 70 ]; then
      usage_color="$LEVEL_7"
    elif [ "$utilization" -le 80 ]; then
      usage_color="$LEVEL_8"
    elif [ "$utilization" -le 90 ]; then
      usage_color="$LEVEL_9"
    else
      usage_color="$LEVEL_10"
    fi

    # Reset time
    reset_time_display=""
    if [ -n "$resets_at" ] && [ "$resets_at" != "null" ]; then
      iso_time=$(echo "$resets_at" | sed 's/\.[0-9]*Z$//')
      epoch=$(date -ju -f "%Y-%m-%dT%H:%M:%S" "$iso_time" "+%s" 2>/dev/null) || true

      if [ -n "$epoch" ]; then
        time_format=$(defaults read -g AppleICUForce24HourTime 2>/dev/null) || true
        if [ "$time_format" = "1" ]; then
          reset_time=$(date -r "$epoch" "+%H:%M" 2>/dev/null)
        else
          reset_time=$(date -r "$epoch" "+%I:%M %p" 2>/dev/null)
        fi
        [ -n "$reset_time" ] && reset_time_display=" → ${reset_time}"
      fi
    fi

    usage_text="${usage_color}${utilization}%${reset_time_display}${RESET}"
  else
    usage_text="${YELLOW}~${RESET}"
  fi
else
  usage_text="${YELLOW}~${RESET}"
fi

# Build output
if [ -n "$VERSION" ]; then
  output="${BLUE}cf v${VERSION}${RESET}"
else
  output="${BLUE}cf${RESET}"
fi

if [ -n "$current_dir" ]; then
  output="${output}${separator}${BLUE}${current_dir}${RESET}"
fi

if [ -n "$MODEL" ]; then
  output="${output}${separator}${CYAN}${MODEL}${RESET}"
fi

if [ -n "$branch_text" ]; then
  output="${output}${separator}${branch_text}"
fi

if [ -n "$usage_text" ]; then
  output="${output}${separator}${usage_text}"
fi

printf "%s\n" "$output"
