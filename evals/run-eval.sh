#!/usr/bin/env bash
# run-eval.sh — Run a single eval: invoke claude with or without Coding Friend plugin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Defaults
PROMPT_FILE=""
CONDITION=""
SKILL=""
REPO=""
MODEL="sonnet"
WAVE=""
BENCH_REPO=""
BUDGET=""
DRY_RUN=false

usage() {
  cat <<'USAGE'
run-eval.sh — Run a single eval: invoke claude with or without Coding Friend plugin

Usage:
  ./run-eval.sh --prompt <file> --condition <with-cf|without-cf> --skill <name> --repo <path> [options]

Options:
  --prompt <file>          Path to the prompt file
  --condition <condition>  Either "with-cf" (normal mode) or "without-cf" (bare mode)
  --skill <name>           Skill name (used for organizing results)
  --repo <path>            Working directory for the eval run
  --model <model>          Model to use (default: sonnet)
  --wave <1|2|3>           Wave number (used for organizing results)
  --bench-repo <name>      Benchmark repo name, e.g. bench-webapp (used for organizing results)
  --budget <amount>        Max budget in USD per run (passed as --max-budget-usd)
  --dry-run                Show the command that would be executed without running it
  --help                   Show this help message
USAGE
}

die() {
  echo -e "${RED}❌ ERROR: $1${NC}" >&2
  exit 1
}

# Save list of currently enabled plugins
save_plugin_state() {
  claude plugin list 2>/dev/null | grep -B3 "Status: ✔ enabled" | grep "@" | sed 's/^[[:space:]]*[^[:alnum:]]*//' | awk '{print $1}' > "$SCRIPT_DIR/.plugin-state.tmp" 2>/dev/null || true
}

# Restore previously enabled plugins
restore_plugin_state() {
  if [[ -f "$SCRIPT_DIR/.plugin-state.tmp" ]]; then
    while IFS= read -r plugin; do
      claude plugin enable "$plugin" 2>/dev/null || true
    done < "$SCRIPT_DIR/.plugin-state.tmp"
    rm -f "$SCRIPT_DIR/.plugin-state.tmp"
  fi
}

# Ensure plugins are restored on exit (trap for safety)
cleanup() {
  if [[ "${PLUGINS_DISABLED:-false}" == true ]]; then
    restore_plugin_state
  fi
}
trap cleanup EXIT

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt)   PROMPT_FILE="$2"; shift 2 ;;
    --condition) CONDITION="$2"; shift 2 ;;
    --skill)    SKILL="$2"; shift 2 ;;
    --repo)     REPO="$2"; shift 2 ;;
    --model)    MODEL="$2"; shift 2 ;;
    --wave)     WAVE="$2"; shift 2 ;;
    --bench-repo) BENCH_REPO="$2"; shift 2 ;;
    --budget)   BUDGET="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --help)     usage; exit 0 ;;
    *)          die "Unknown argument: $1" ;;
  esac
done

# Validate required args
[[ -z "$PROMPT_FILE" ]] && die "Missing required argument: --prompt"
[[ -z "$CONDITION" ]]   && die "Missing required argument: --condition"
[[ -z "$SKILL" ]]       && die "Missing required argument: --skill"
[[ -z "$REPO" ]]        && die "Missing required argument: --repo"

# Validate condition
if [[ "$CONDITION" != "with-cf" && "$CONDITION" != "without-cf" ]]; then
  die "Invalid condition: $CONDITION (must be 'with-cf' or 'without-cf')"
fi

# Derive bench-repo from repo path if not provided
if [[ -z "$BENCH_REPO" && -n "$REPO" ]]; then
  BENCH_REPO=$(basename "$REPO")
fi

# Generate timestamp and date for output file
TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
RUN_DATE=$(date +%Y-%m-%d)

# Build output path: results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/
OUTPUT_DIR="$SCRIPT_DIR/results/$RUN_DATE/$MODEL"
[[ -n "$WAVE" ]] && OUTPUT_DIR="$OUTPUT_DIR/wave-$WAVE"
OUTPUT_DIR="$OUTPUT_DIR/$SKILL"
[[ -n "$BENCH_REPO" ]] && OUTPUT_DIR="$OUTPUT_DIR/$BENCH_REPO"
OUTPUT_FILE="$OUTPUT_DIR/${CONDITION}--${TIMESTAMP}.json"
META_FILE="$OUTPUT_DIR/${CONDITION}--${TIMESTAMP}.meta.json"
CONVERSATION_FILE="$OUTPUT_DIR/${CONDITION}--${TIMESTAMP}.conversation.txt"

# Build the claude command
CMD=(claude -p)

# Read prompt from file if it exists and is readable
if [[ -r "$PROMPT_FILE" ]]; then
  PROMPT_CONTENT=$(cat "$PROMPT_FILE")
else
  PROMPT_CONTENT=""
fi
CMD+=("$PROMPT_CONTENT")

# Add condition-specific flags
PLUGINS_DISABLED=false
if [[ "$CONDITION" == "without-cf" ]]; then
  CMD+=(--disable-slash-commands)
  # Save current plugin state, then disable all
  save_plugin_state
  claude plugin disable --all 2>/dev/null || true
  PLUGINS_DISABLED=true
fi

# Common flags
CMD+=(--output-format stream-json)
CMD+=(--dangerously-skip-permissions)
CMD+=(--model "$MODEL")
CMD+=(--no-session-persistence)

# Optional budget
if [[ -n "$BUDGET" ]]; then
  CMD+=(--max-budget-usd "$BUDGET")
fi

# Dry run: show command and output path, then exit
if [[ "$DRY_RUN" == true ]]; then
  echo -e "${CYAN}🔍 Command:${NC} ${CMD[*]}"
  echo -e "${CYAN}📂 Working directory:${NC} $REPO"
  echo -e "${CYAN}📄 Output:${NC} $OUTPUT_FILE"
  echo -e "${CYAN}💬 Conversation:${NC} $CONVERSATION_FILE"
  exit 0
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Reset and re-setup repo state before eval
cd "$REPO"
REPO_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
if [[ -n "$REPO_HEAD" ]]; then
  git checkout . 2>/dev/null || true
  git clean -fd 2>/dev/null || true
  git reset --hard "$REPO_HEAD" 2>/dev/null || true
fi

# Re-run setup if available (restores staged changes, etc.)
REPO_NAME=$(basename "$REPO")
SETUP_SCRIPT="$SCRIPT_DIR/benchmarks/$REPO_NAME/setup.sh"
if [[ -x "$SETUP_SCRIPT" ]]; then
  bash "$SETUP_SCRIPT" 2>/dev/null || true
fi

# Record start time
START_TIME=$(date +%s)

# Run the eval (stream-json captures all events)
STREAM_FILE="$OUTPUT_DIR/${CONDITION}--${TIMESTAMP}.stream.jsonl"
EXIT_CODE=0
"${CMD[@]}" > "$STREAM_FILE" 2>/dev/null || EXIT_CODE=$?

# Record end time and calculate wall time
END_TIME=$(date +%s)
WALL_TIME=$((END_TIME - START_TIME))

# Post-process stream-json output:
# 1. Extract the final "result" message as the main JSON output (backward compatible)
# 2. Extract all assistant text into a conversation log
if [[ -s "$STREAM_FILE" ]]; then
  # Extract the last result-type message (contains result, cost_usd, duration_ms, etc.)
  RESULT_LINE=$(jq -c 'select(.type == "result")' "$STREAM_FILE" 2>/dev/null | tail -1 || true)
  if [[ -n "$RESULT_LINE" ]]; then
    echo "$RESULT_LINE" > "$OUTPUT_FILE"
  else
    # Fallback: if no result type found, copy stream as-is
    cp "$STREAM_FILE" "$OUTPUT_FILE"
  fi

  # Extract all assistant text messages into conversation log.
  # stream-json emits lines like: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}],...}}
  # We extract the text from each assistant message content block.
  jq -r '
    select(.type == "assistant")
    | .message.content[]?
    | select(.type == "text")
    | .text
  ' "$STREAM_FILE" > "$CONVERSATION_FILE" 2>/dev/null || true

  # Clean up stream file (it can be large)
  rm -f "$STREAM_FILE"
else
  # Empty stream file — create empty outputs
  touch "$OUTPUT_FILE"
  touch "$CONVERSATION_FILE"
  rm -f "$STREAM_FILE"
fi

# Handle failure
if [[ $EXIT_CODE -ne 0 ]]; then
  if [[ "$WAVE" == "3" ]]; then
    echo -e "${RED}❌ [ERROR] scenario=$SKILL condition=$CONDITION exit_code=$EXIT_CODE${NC}" >&2
  else
    echo -e "${RED}❌ [ERROR] skill=$SKILL condition=$CONDITION exit_code=$EXIT_CODE${NC}" >&2
  fi
  # Write error info into the output file if it's empty
  if [[ ! -s "$OUTPUT_FILE" ]]; then
    cat > "$OUTPUT_FILE" <<EOF
{
  "error": true,
  "exit_code": $EXIT_CODE,
  "skill": "$SKILL",
  "condition": "$CONDITION"
}
EOF
  fi
fi

# Write metadata
cat > "$META_FILE" <<EOF
{
  "skill": "$SKILL",
  "condition": "$CONDITION",
  "repo": "$REPO",
  "bench_repo": "$BENCH_REPO",
  "model": "$MODEL",
  "wave": "$WAVE",
  "wall_time_seconds": $WALL_TIME,
  "timestamp": "$TIMESTAMP",
  "exit_code": $EXIT_CODE
}
EOF

# Re-enable plugins (also handled by trap, but explicit is better)
if [[ "$PLUGINS_DISABLED" == true ]]; then
  restore_plugin_state
  PLUGINS_DISABLED=false
fi

# Reset repo state after eval (so next run starts fresh)
if [[ -n "$REPO_HEAD" ]]; then
  cd "$REPO"
  git checkout . 2>/dev/null || true
  git clean -fd 2>/dev/null || true
  git reset --hard "$REPO_HEAD" 2>/dev/null || true
fi

# Print summary
if [[ "$WAVE" == "3" ]]; then
  echo -e "${GREEN}✅ [DONE]${NC} scenario=${BOLD}$SKILL${NC} condition=${BOLD}$CONDITION${NC} time=${YELLOW}${WALL_TIME}s${NC} output=${DIM}$OUTPUT_FILE${NC}"
else
  echo -e "${GREEN}✅ [DONE]${NC} skill=${BOLD}$SKILL${NC} condition=${BOLD}$CONDITION${NC} time=${YELLOW}${WALL_TIME}s${NC} output=${DIM}$OUTPUT_FILE${NC}"
fi
