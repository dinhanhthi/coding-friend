#!/usr/bin/env bash
# Statusline: Show session info in Claude Code status bar.
#
# Displays a compact status line with: plugin version, current directory,
# active model, git branch, account info, context window usage, and API usage percentage
# with color-coded gradient (green→red) and reset time.
#
# Context window usage is read from the stdin JSON (context_window.used_percentage)
# provided by Claude Code. Account info is read from ~/.claude.json (oauthAccount),
# with fallback to `claude auth status --json`.
# API usage is fetched from Anthropic's OAuth API using the access token that
# Claude Code stores in the macOS Keychain.
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
#   { "statusline": { "components": ["version", "folder", "model", "branch", "account", "context", "rate_limit"] } }
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
LEVEL_1=$'\033[38;5;40m'   # bright green
LEVEL_2=$'\033[38;5;34m'   # medium green
LEVEL_3=$'\033[38;5;76m'   # light green
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

# Convert ISO 8601 timestamp to epoch seconds (cross-platform)
iso_to_epoch() {
  local iso_str="$1"
  # Try GNU date first (Linux)
  local epoch
  epoch=$(date -d "${iso_str}" +%s 2>/dev/null)
  if [ -n "$epoch" ]; then echo "$epoch"; return 0; fi
  # macOS: strip fractional seconds and timezone suffix
  local stripped="${iso_str%%.*}"
  stripped="${stripped%%Z}"
  stripped="${stripped%%+*}"
  stripped="${stripped%%-[0-9][0-9]:[0-9][0-9]}"
  if [[ "$iso_str" == *"Z"* ]] || [[ "$iso_str" == *"+00:00"* ]] || [[ "$iso_str" == *"-00:00"* ]]; then
    epoch=$(env TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "$stripped" +%s 2>/dev/null)
  else
    epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$stripped" +%s 2>/dev/null)
  fi
  if [ -n "$epoch" ]; then echo "$epoch"; return 0; fi
  return 0
}

# Format a reset time from ISO string
# style: "time" → "2:30pm", "datetime" → "mar 10, 2:30pm"
format_reset_time() {
  local iso_str="$1" style="$2"
  [ -z "$iso_str" ] || [ "$iso_str" = "null" ] && return
  local epoch
  epoch=$(iso_to_epoch "$iso_str")
  [ -z "$epoch" ] && return
  local result=""
  case "$style" in
    time)
      # Check macOS 24h preference
      local time_format
      time_format=$(defaults read -g AppleICUForce24HourTime 2>/dev/null) || true
      if [ "$time_format" = "1" ]; then
        result=$(date -r "$epoch" "+%H:%M" 2>/dev/null)
        [ -z "$result" ] && result=$(date -d "@$epoch" "+%H:%M" 2>/dev/null)
      else
        result=$(date -j -r "$epoch" +"%l:%M%p" 2>/dev/null | sed 's/^ //; s/\.//g' | tr '[:upper:]' '[:lower:]')
        [ -z "$result" ] && result=$(date -d "@$epoch" +"%l:%M%P" 2>/dev/null | sed 's/^ //; s/\.//g')
      fi
      ;;
    datetime)
      local dt_format
      dt_format=$(defaults read -g AppleICUForce24HourTime 2>/dev/null) || true
      if [ "$dt_format" = "1" ]; then
        result=$(date -r "$epoch" +"%b %-d, %H:%M" 2>/dev/null | tr '[:upper:]' '[:lower:]')
        [ -z "$result" ] && result=$(date -d "@$epoch" +"%b %-d, %H:%M" 2>/dev/null | tr '[:upper:]' '[:lower:]')
      else
        result=$(date -j -r "$epoch" +"%b %-d, %l:%M%p" 2>/dev/null | sed 's/  / /g; s/^ //; s/\.//g' | tr '[:upper:]' '[:lower:]')
        [ -z "$result" ] && result=$(date -d "@$epoch" +"%b %-d, %l:%M%P" 2>/dev/null | sed 's/  / /g; s/^ //; s/\.//g')
      fi
      ;;
  esac
  printf "%s" "$result"
}

# Resolve OAuth token from various sources (macOS Keychain, credentials file, Linux secret-tool)
get_oauth_token() {
  # 1. Environment variable
  if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    echo "$CLAUDE_CODE_OAUTH_TOKEN"; return 0
  fi
  # 2. macOS Keychain
  if command -v security >/dev/null 2>&1; then
    local blob
    blob=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null)
    if [ -n "$blob" ]; then
      local token
      token=$(echo "$blob" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
      if [ -n "$token" ] && [ "$token" != "null" ]; then echo "$token"; return 0; fi
    fi
  fi
  # 3. Credentials file
  local creds_file="${HOME}/.claude/.credentials.json"
  if [ -f "$creds_file" ]; then
    local token
    token=$(jq -r '.claudeAiOauth.accessToken // empty' "$creds_file" 2>/dev/null)
    if [ -n "$token" ] && [ "$token" != "null" ]; then echo "$token"; return 0; fi
  fi
  # 4. Linux secret-tool
  if command -v secret-tool >/dev/null 2>&1; then
    local blob
    blob=$(timeout 2 secret-tool lookup service "Claude Code-credentials" 2>/dev/null)
    if [ -n "$blob" ]; then
      local token
      token=$(echo "$blob" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
      if [ -n "$token" ] && [ "$token" != "null" ]; then echo "$token"; return 0; fi
    fi
  fi
  echo ""
}

separator="${GRAY} | ${RESET}"

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
  current_dir_path=$(echo "$INPUT" | grep -o '"current_dir":"[^"]*"' | sed 's/"current_dir":"//;s/"$//' || true)
  current_dir=$(basename "$current_dir_path")
fi

# Active model
MODEL=""
if component_enabled "model"; then
  MODEL=$(echo "$INPUT" | jq -r '.session.model // empty' 2>/dev/null)
  if [ -z "$MODEL" ]; then
    MODEL=$(echo "$INPUT" | jq -r '.model.display_name // empty' 2>/dev/null)
  fi
  # Shorten model names: "Opus 4.6 (1M context)" → "Opus (1M)"
  if [ -n "$MODEL" ]; then
    MODEL=$(echo "$MODEL" | sed -E 's/([A-Za-z]+) [0-9]+(\.[0-9]+)? \(([0-9]+[KMG]?) context\)/\1 (\3)/')
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

# ── Read account data (for "account" component) ──
# Priority: 1) ~/.claude.json (fast local read)  2) claude auth status --json (subprocess fallback)
acct_email=""
acct_name=""
if component_enabled "account" && command -v jq &>/dev/null; then
  # Source 1: ~/.claude.json (fast local read, no network call)
  CLAUDE_JSON="$HOME/.claude.json"
  if [ -f "$CLAUDE_JSON" ]; then
    # Extract all fields in a single jq call
    acct_fields=$(jq -r '.oauthAccount | "\(.emailAddress // "")\t\(.displayName // "")"' "$CLAUDE_JSON" 2>/dev/null)
    if [ -n "$acct_fields" ]; then
      acct_email=$(echo "$acct_fields" | cut -f1)
      acct_name=$(echo "$acct_fields" | cut -f2)
    fi
  fi

  # Source 2: fallback to `claude auth status --json` if no email found
  if [ -z "$acct_email" ] && command -v claude &>/dev/null; then
    auth_data=$(timeout 3 claude auth status --json 2>/dev/null) || true
    if [ -n "$auth_data" ] && echo "$auth_data" | jq -e '.loggedIn == true' >/dev/null 2>&1; then
      acct_email=$(echo "$auth_data" | jq -r '.email // ""' 2>/dev/null)
    fi
  fi
fi

# Build account line
account_line=""
if component_enabled "account"; then
  acct_parts=""
  if [ -n "$acct_name" ]; then
    acct_parts="${CYAN}${acct_name}${RESET}"
    [ -n "$acct_email" ] && acct_parts+=" ${GRAY}(${acct_email})${RESET}"
  elif [ -n "$acct_email" ]; then
    acct_parts="${CYAN}${acct_email}${RESET}"
  fi

  [ -n "$acct_parts" ] && account_line="👤 ${acct_parts}"
fi

# ── Fetch usage data (for "rate_limit" component) ──
USAGE_DATA=""
if component_enabled "rate_limit"; then
  if command -v curl &>/dev/null && command -v jq &>/dev/null; then
    cache_dir="/tmp/claude-${UID:-$(id -u)}"
    cache_file="${cache_dir}/statusline-usage-cache.json"
    cache_max_age=60
    mkdir -p "$cache_dir" 2>/dev/null && chmod 700 "$cache_dir" 2>/dev/null

    needs_refresh=true
    if [ -f "$cache_file" ]; then
      cache_mtime=$(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null)
      now=$(date +%s)
      cache_age=$(( now - cache_mtime ))
      if [ "$cache_age" -lt "$cache_max_age" ]; then
        needs_refresh=false
        USAGE_DATA=$(cat "$cache_file" 2>/dev/null)
      fi
    fi

    if $needs_refresh; then
      token=$(get_oauth_token)
      if [ -n "$token" ] && [ "$token" != "null" ]; then
        response=$(curl -s --max-time 5 \
          -H "Accept: application/json" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $token" \
          -H "anthropic-beta: oauth-2025-04-20" \
          "https://api.anthropic.com/api/oauth/usage" 2>/dev/null) || true
        if [ -n "$response" ] && echo "$response" | jq -e '.five_hour' >/dev/null 2>&1; then
          USAGE_DATA="$response"
          echo "$response" > "${cache_file}.tmp" && mv "${cache_file}.tmp" "$cache_file"
        fi
      fi
      # Fall back to stale cache if API failed
      if [ -z "$USAGE_DATA" ] && [ -f "$cache_file" ]; then
        USAGE_DATA=$(cat "$cache_file" 2>/dev/null)
      fi
    fi
  fi
fi

# Rate limit — single line: 5h 30% ⟳ 2:30pm │ 7d 10% ⟳ mar 15, 2:30pm
rate_limit_line=""
if component_enabled "rate_limit"; then
  if ! command -v curl &>/dev/null || ! command -v jq &>/dev/null; then
    rate_limit_line="${YELLOW}⚠ curl & jq required for rate limits${RESET}"
  elif [ -n "$USAGE_DATA" ] && echo "$USAGE_DATA" | jq -e . >/dev/null 2>&1; then
    rl_parts=""

    # Current (5-hour window)
    five_hour_pct=$(echo "$USAGE_DATA" | jq -r '.five_hour.utilization // 0' | awk '{printf "%.0f", $1}')
    five_hour_reset_iso=$(echo "$USAGE_DATA" | jq -r '.five_hour.resets_at // empty')
    five_hour_reset=$(format_reset_time "$five_hour_reset_iso" "time")
    five_hour_color=$(color_for_percentage "$five_hour_pct")
    rl_parts="${GRAY}[5h]${RESET} ${five_hour_color}${five_hour_pct}%${RESET}"
    [ -n "$five_hour_reset" ] && rl_parts+=" ${GRAY}→${RESET} ${five_hour_reset}"

    # Weekly (7-day window)
    seven_day_pct=$(echo "$USAGE_DATA" | jq -r '.seven_day.utilization // 0' | awk '{printf "%.0f", $1}')
    seven_day_reset_iso=$(echo "$USAGE_DATA" | jq -r '.seven_day.resets_at // empty')
    seven_day_reset=$(format_reset_time "$seven_day_reset_iso" "datetime")
    seven_day_color=$(color_for_percentage "$seven_day_pct")
    rl_parts+="${separator}${GRAY}[7d]${RESET} ${seven_day_color}${seven_day_pct}%${RESET}"
    [ -n "$seven_day_reset" ] && rl_parts+=" ${GRAY}→${RESET} ${seven_day_reset}"

    rate_limit_line="$rl_parts"
  fi
fi

# Build output — use array to handle separators cleanly
parts=()

if [ -n "$VERSION" ]; then
  parts+=("${BLUE}cf v${VERSION}${RESET}")
elif component_enabled "version"; then
  parts+=("${BLUE}cf${RESET}")
fi

if [ -n "$current_dir" ]; then
  folder_part="${BLUE}📂 ${current_dir}"
  if [ -n "$branch_text" ]; then
    folder_part+=" (${branch_text}${BLUE})"
  fi
  folder_part+="${RESET}"
  parts+=("$folder_part")
fi
[ -n "$MODEL" ] && parts+=("${CYAN}🧠 ${MODEL}${RESET}")

# Join parts with separator
output=""
for part in "${parts[@]}"; do
  if [ -z "$output" ]; then
    output="$part"
  else
    output="${output}${separator}${part}"
  fi
done

printf "%s" "$output"

# Second line: account info
if [ -n "$account_line" ]; then
  printf "\n%s" "$account_line"
fi

# Third line: context + rate limit
third_line=""
if [ -n "$ctx_text" ]; then
  third_line="$ctx_text"
fi
if [ -n "$rate_limit_line" ]; then
  if [ -n "$third_line" ]; then
    third_line+="${separator}${rate_limit_line}"
  else
    third_line="$rate_limit_line"
  fi
fi
if [ -n "$third_line" ]; then
  printf "\n%s" "$third_line"
fi
