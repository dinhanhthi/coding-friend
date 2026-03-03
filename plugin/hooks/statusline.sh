#!/usr/bin/env bash
# Statusline: Show session info in Claude Code status bar.
#
# Displays a compact status line with: plugin version, current directory,
# active model, git branch, context window usage, and API usage percentage
# with color-coded gradient (green→red) and reset time.
#
# Context window usage is read from the stdin JSON (context_window.used_percentage)
# provided by Claude Code. API usage is fetched from Anthropic's OAuth API using
# the access token that Claude Code stores in the macOS Keychain.
# Time format respects macOS 24h preference (AppleICUForce24HourTime).
#
# Setup:
#   Run `cf statusline` to configure, or add manually to ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "bash <plugin-path>/hooks/statusline.sh" }
#
# Integration contract:
#   stdin  – JSON with current_dir (or workspace.current_dir), session.model (or model.display_name), context_window.*
#   stdout – ANSI-colored status line string
#
# Configuration:
#   Components can be toggled via ~/.coding-friend/config.json:
#   { "statusline": { "components": ["version", "folder", "model", "branch", "context", "usage"] } }
#   Run `cf statusline` to configure interactively.
#   If no config exists, all components are shown by default.

set -euo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Read component visibility config
CONFIG_FILE="$HOME/.coding-friend/config.json"
SL_COMPONENTS=""
if [ -f "$CONFIG_FILE" ] && command -v jq &>/dev/null; then
  SL_COMPONENTS=$(jq -r '.statusline.components // empty' "$CONFIG_FILE" 2>/dev/null)
fi

# Check if a component is enabled (show all if no config)
component_enabled() {
  [ -z "$SL_COMPONENTS" ] && return 0
  echo "$SL_COMPONENTS" | jq -e "index(\"$1\")" > /dev/null 2>&1
}

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

# Map a percentage (0-100) to a gradient color
color_for_percentage() {
  local pct="$1"
  [[ "$pct" =~ ^[0-9]+$ ]] || { echo "$LEVEL_1"; return; }
  if [ "$pct" -le 10 ]; then echo "$LEVEL_1"
  elif [ "$pct" -le 20 ]; then echo "$LEVEL_2"
  elif [ "$pct" -le 30 ]; then echo "$LEVEL_3"
  elif [ "$pct" -le 40 ]; then echo "$LEVEL_4"
  elif [ "$pct" -le 50 ]; then echo "$LEVEL_5"
  elif [ "$pct" -le 60 ]; then echo "$LEVEL_6"
  elif [ "$pct" -le 70 ]; then echo "$LEVEL_7"
  elif [ "$pct" -le 80 ]; then echo "$LEVEL_8"
  elif [ "$pct" -le 90 ]; then echo "$LEVEL_9"
  else echo "$LEVEL_10"
  fi
}

separator="${GRAY} │ ${RESET}"

# Plugin version — read from plugin.json in CLAUDE_PLUGIN_ROOT (works for both dev and installed)
VERSION=""
if component_enabled "version"; then
  PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
  if [ -f "$PLUGIN_ROOT/.claude-plugin/plugin.json" ]; then
    VERSION=$(jq -r '.version // empty' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null)
  fi
  if [ -z "$VERSION" ]; then
    VERSION=$(jq -r '.plugins["coding-friend@coding-friend-marketplace"][0].version // empty' "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null)
  fi
fi

# Current folder
current_dir=""
if component_enabled "folder"; then
  current_dir_path=$(echo "$INPUT" | grep -o '"current_dir":"[^"]*"' | sed 's/"current_dir":"//;s/"$//')
  current_dir=$(basename "$current_dir_path")
fi

# Active model
MODEL=""
if component_enabled "model"; then
  MODEL=$(echo "$INPUT" | jq -r '.session.model // empty' 2>/dev/null)
  if [ -z "$MODEL" ]; then
    MODEL=$(echo "$INPUT" | jq -r '.model.display_name // empty' 2>/dev/null)
  fi
fi

# Git branch
branch_text=""
if component_enabled "branch"; then
  if git rev-parse --git-dir > /dev/null 2>&1; then
    branch=$(git branch --show-current 2>/dev/null)
    [ -n "$branch" ] && branch_text="${GREEN}⎇ ${branch}${RESET}"
  fi
fi

# Context window usage — read from stdin JSON
ctx_text=""
if component_enabled "context"; then
  ctx_pct=$(echo "$INPUT" | jq -r '.context_window.used_percentage // empty' 2>/dev/null | cut -d. -f1)
  if [ -n "$ctx_pct" ] && [[ "$ctx_pct" =~ ^[0-9]+$ ]]; then
    ctx_color=$(color_for_percentage "$ctx_pct")
    ctx_text="${ctx_color}ctx ${ctx_pct}%${RESET}"
  fi
fi

# Usage (percentage + reset time) — fetched from Anthropic OAuth API
usage_text=""
if component_enabled "usage"; then
  utilization=""
  resets_at=""

  ACCESS_TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null) || true

  if [ -n "$ACCESS_TOKEN" ]; then
    usage_json=$(curl -s --max-time 5 "https://api.anthropic.com/api/oauth/usage" \
      --header @- \
      -H "anthropic-beta: oauth-2025-04-20" \
      -H "Content-Type: application/json" 2>/dev/null <<< "Authorization: Bearer $ACCESS_TOKEN") || true

    if [ -n "$usage_json" ]; then
      utilization=$(echo "$usage_json" | jq -r '.five_hour.utilization // empty' 2>/dev/null | cut -d. -f1)
      resets_at=$(echo "$usage_json" | jq -r '.five_hour.resets_at // empty' 2>/dev/null)
    fi
  fi

  if [ -n "$utilization" ] && [[ "$utilization" =~ ^[0-9]+$ ]]; then
    usage_color=$(color_for_percentage "$utilization")

    # Reset time
    reset_time_display=""
    if [ -n "$resets_at" ] && [ "$resets_at" != "null" ] && [ "$resets_at" != "" ]; then
      iso_time=$(echo "$resets_at" | sed 's/\.[0-9]*+.*$//' | sed 's/\.[0-9]*Z$//')
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
fi

# Build output — use array to handle separators cleanly
parts=()

if [ -n "$VERSION" ]; then
  parts+=("${BLUE}cf v${VERSION}${RESET}")
elif component_enabled "version"; then
  parts+=("${BLUE}cf${RESET}")
fi

[ -n "$current_dir" ] && parts+=("${BLUE}${current_dir}${RESET}")
[ -n "$MODEL" ] && parts+=("${CYAN}${MODEL}${RESET}")
[ -n "$branch_text" ] && parts+=("${branch_text}")
[ -n "$ctx_text" ] && parts+=("${ctx_text}")
[ -n "$usage_text" ] && parts+=("${usage_text}")

# Join parts with separator
output=""
for part in "${parts[@]}"; do
  if [ -z "$output" ]; then
    output="$part"
  else
    output="${output}${separator}${part}"
  fi
done

printf "%s\n" "$output"
