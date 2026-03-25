#!/usr/bin/env bash
# generate-eval-json.sh — Generate website JSON from LLM-as-judge scoring
#
# Reads eval results and scores them using LLM-as-judge (Haiku) against rubrics.
# Each result is scored with both the final output AND the full conversation log,
# which is critical for with-CF results where workflow discipline (skill activations,
# agent dispatches, TDD cycles) is visible mid-conversation.
#
# No time/cost metrics, no regex scoring — LLM rubric evaluation only.
#
# Usage:
#   ./generate-eval-json.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color
RESULTS_DIR="$SCRIPT_DIR/results"
RUBRICS_DIR="$SCRIPT_DIR/rubrics"
OUTPUT_FILE="$SCRIPT_DIR/../website/src/data/eval-results.json"

# Featured skills shown on the landing page comparison chart
FEATURED_SKILLS=("cf-fix" "cf-review" "cf-tdd" "cf-security")
FEATURED_LABELS=("Bug Fix" "Code Review" "TDD" "Security")

# All supported models
ALL_MODELS=("haiku" "sonnet" "opus")
MODEL_LABELS='{"haiku":"Haiku","sonnet":"Sonnet","opus":"Opus"}'
MODEL_IDS='{"haiku":"claude-haiku-4-5-20251001","sonnet":"claude-sonnet-4-6","opus":"claude-opus-4-6"}'

# Options
NO_BUDGET=false
SELECTED_MODELS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-budget) NO_BUDGET=true; shift ;;
    --model) SELECTED_MODELS+=("$2"); shift 2 ;;
    --help|-h) echo "Usage: ./generate-eval-json.sh [--no-budget] [--model <name>]..."; exit 0 ;;
    *) echo -e "${RED}❌ Unknown argument: $1${NC}" >&2; exit 1 ;;
  esac
done

# Override ALL_MODELS if specific models were selected
if [[ ${#SELECTED_MODELS[@]} -gt 0 ]]; then
  for m in "${SELECTED_MODELS[@]}"; do
    if ! echo "$MODEL_LABELS" | jq -e ".\"$m\"" >/dev/null 2>&1; then
      echo -e "${RED}❌ Unknown model: $m (valid: ${ALL_MODELS[*]})${NC}" >&2
      exit 1
    fi
  done
  ALL_MODELS=("${SELECTED_MODELS[@]}")
fi

die() {
  echo -e "${RED}❌ ERROR: $1${NC}" >&2
  exit 1
}

# Count eval sessions for a given model across all results
# Layout: results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/<condition>--<timestamp>.meta.json
count_sessions() {
  local model="$1"
  find "$RESULTS_DIR" -path "*/$model/*" -name "*.meta.json" -type f 2>/dev/null | wc -l | tr -d ' '
}

# Score a single result file using LLM-as-judge (Haiku)
# Returns weighted average score on 0-3 scale, or empty on failure
llm_score_result() {
  local result_file="$1"
  local rubric_file="$2"

  local llm_score_script="$SCRIPT_DIR/llm-score.sh"
  if [[ ! -x "$llm_score_script" ]]; then
    return 1
  fi

  # Check for cached LLM score
  local cache_file="${result_file%.json}.llm-score.json"
  if [[ -f "$cache_file" ]]; then
    local cached_score
    cached_score=$(jq -r '.weighted_average // empty' "$cache_file" 2>/dev/null)
    if [[ -n "$cached_score" ]]; then
      echo "$cached_score"
      return 0
    fi
    # Corrupt or empty cache — remove and regenerate
    rm -f "$cache_file"
  fi

  # Also try conversation file for richer context
  local conv_file="${result_file%.json}.conversation.txt"
  local score_args=(--result "$result_file" --rubric "$rubric_file")
  if [[ "$NO_BUDGET" == true ]]; then
    score_args+=(--no-budget)
  fi
  if [[ -f "$conv_file" ]]; then
    score_args+=(--conversation "$conv_file")
  fi

  local llm_output llm_stderr
  llm_stderr=$(mktemp)
  llm_output=$("$llm_score_script" "${score_args[@]}" 2>"$llm_stderr") || {
    local err_msg
    err_msg=$(cat "$llm_stderr")
    rm -f "$llm_stderr"
    echo "$err_msg" >&2
    return 1
  }
  rm -f "$llm_stderr"

  # Atomic cache write: write to temp in same dir then rename (ensures same filesystem)
  local tmp_cache
  tmp_cache=$(mktemp -p "$(dirname "$cache_file")" ".llm-score.tmp.XXXXXX" 2>/dev/null) || return 1
  echo "$llm_output" > "$tmp_cache" && mv "$tmp_cache" "$cache_file" || rm -f "$tmp_cache"

  echo "$llm_output" | jq -r '.weighted_average // empty' 2>/dev/null
}

# Compute average score for a skill+condition+model combination
# Uses LLM-as-judge scoring (Haiku) only — no regex, no time/cost metrics
# The LLM judge evaluates both final output and conversation log (for workflow context)
# Layout: results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/<condition>--<timestamp>.json
compute_skill_score() {
  local skill="$1"
  local condition="$2"
  local model="$3"

  local rubric_file="$RUBRICS_DIR/${skill}.json"
  local total_score=0
  local file_count=0

  # Find all result files for this skill+condition+model across all dates, waves, and repos
  local result_files=()
  while IFS= read -r f; do
    result_files+=("$f")
  done < <(find "$RESULTS_DIR" -path "*/$model/*/$skill/*/${condition}--*.json" ! -name "*.meta.json" ! -name "*.llm-score.json" -type f 2>/dev/null | sort)

  # Fallback: try legacy layout (without wave/repo dirs)
  if [[ ${#result_files[@]} -eq 0 ]]; then
    while IFS= read -r f; do
      result_files+=("$f")
    done < <(find "$RESULTS_DIR" -path "*/$model/$skill/${condition}--*.json" ! -name "*.meta.json" ! -name "*.llm-score.json" -type f 2>/dev/null | sort)
  fi

  if [[ ${#result_files[@]} -eq 0 ]]; then
    echo -e "      ${DIM}(no result files found)${NC}" >&2
    echo "0"
    return
  fi

  echo -e "      ${DIM}${#result_files[@]} file(s) to score${NC}" >&2

  for result_file in "${result_files[@]}"; do
    if [[ ! -f "$rubric_file" ]]; then
      echo -e "      ${YELLOW}⚠ No rubric file: ${DIM}${rubric_file}${NC}" >&2
      continue
    fi

    local basename
    basename=$(basename "$result_file")
    local score=""

    # Check if cached
    local cache_file="${result_file%.json}.llm-score.json"
    if [[ -f "$cache_file" ]]; then
      echo -ne "      📋 ${DIM}${basename}${NC} " >&2
    else
      echo -ne "      🔄 ${DIM}${basename}${NC} " >&2
    fi

    local score_stderr
    score_stderr=$(mktemp)
    score=$(llm_score_result "$result_file" "$rubric_file" 2>"$score_stderr")

    if [[ -n "$score" ]]; then
      total_score=$(awk "BEGIN { printf \"%.4f\", $total_score + $score }")
      file_count=$((file_count + 1))
      echo -e "→ ${GREEN}${score}${NC}" >&2
    else
      local err_detail
      err_detail=$(cat "$score_stderr")
      if [[ -n "$err_detail" ]]; then
        echo -e "→ ${RED}failed${NC} ${DIM}(${err_detail})${NC}" >&2
      else
        echo -e "→ ${RED}failed${NC} ${DIM}(unknown error)${NC}" >&2
      fi
    fi
    rm -f "$score_stderr"
  done

  local avg_score="0"
  if [[ $file_count -gt 0 ]]; then
    avg_score=$(awk "BEGIN { printf \"%.2f\", $total_score / $file_count }")
  fi
  echo "$avg_score"
}

# Build the JSON output
build_json() {
  local today
  today=$(date +%Y-%m-%d)

  echo ""
  echo -e "${BOLD}🚀 Generating eval results JSON${NC}"
  echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  📂 Results: ${DIM}${RESULTS_DIR}${NC}"
  echo -e "  📐 Rubrics: ${DIM}${RUBRICS_DIR}${NC}"
  echo -e "  📝 Output:  ${DIM}${OUTPUT_FILE}${NC}"
  echo -e "  🤖 Models:  ${CYAN}${ALL_MODELS[*]}${NC}"
  echo -e "  🎯 Skills:  ${CYAN}${FEATURED_SKILLS[*]}${NC}"
  echo ""

  # Start building models object
  local models_json="{}"
  local model_idx=0
  local total_models=${#ALL_MODELS[@]}

  for model in "${ALL_MODELS[@]}"; do
    model_idx=$((model_idx + 1))
    local label model_id sessions
    label=$(echo "$MODEL_LABELS" | jq -r ".\"$model\"")
    model_id=$(echo "$MODEL_IDS" | jq -r ".\"$model\"")
    sessions=$(count_sessions "$model")

    echo -e "${BOLD}${BLUE}━━━ [$model_idx/$total_models] 🤖 Model: ${label} ${NC}${DIM}($model_id, $sessions sessions)${NC}"

    # Compute scores for each featured skill
    local skills_json="{}"
    local with_total=0
    local without_total=0
    local skill_count=0

    for i in "${!FEATURED_SKILLS[@]}"; do
      local skill="${FEATURED_SKILLS[$i]}"
      local skill_label="${FEATURED_LABELS[$i]}"
      local skill_num=$((i + 1))
      local total_skills=${#FEATURED_SKILLS[@]}

      echo -e "  ${MAGENTA}▸ [$skill_num/$total_skills] ${BOLD}${skill}${NC} ${DIM}(${skill_label})${NC}"

      local with_score without_score
      echo -e "    ${CYAN}◆ with-cf${NC}" >&2
      with_score=$(compute_skill_score "$skill" "with-cf" "$model")
      echo -e "    ${CYAN}◇ without-cf${NC}" >&2
      without_score=$(compute_skill_score "$skill" "without-cf" "$model")

      echo -e "    ${GREEN}✓ Result: with=${BOLD}${with_score}${NC} ${DIM}/ without=${without_score}${NC}"

      skills_json=$(echo "$skills_json" | jq \
        --arg skill "$skill" \
        --argjson withCF "$with_score" \
        --argjson withoutCF "$without_score" \
        '.[$skill] = {"withCF": $withCF, "withoutCF": $withoutCF}')

      with_total=$(awk "BEGIN { printf \"%.4f\", $with_total + $with_score }")
      without_total=$(awk "BEGIN { printf \"%.4f\", $without_total + $without_score }")
      skill_count=$((skill_count + 1))
    done

    # Compute averages
    local avg_with=0 avg_without=0
    if [[ $skill_count -gt 0 ]]; then
      avg_with=$(awk "BEGIN { printf \"%.2f\", $with_total / $skill_count }")
      avg_without=$(awk "BEGIN { printf \"%.2f\", $without_total / $skill_count }")
    fi

    echo -e "  ${GREEN}📊 ${label} averages: with=${BOLD}${avg_with}${NC}${GREEN} / without=${avg_without}${NC}"
    echo ""

    # Add this model to models_json
    models_json=$(echo "$models_json" | jq \
      --arg model "$model" \
      --arg label "$label" \
      --arg modelId "$model_id" \
      --argjson sessions "$sessions" \
      --argjson skills "$skills_json" \
      --argjson avgWith "$avg_with" \
      --argjson avgWithout "$avg_without" \
      '.[$model] = {
        "label": $label,
        "modelId": $modelId,
        "evalSessions": $sessions,
        "skills": $skills,
        "average": {"withCF": $avgWith, "withoutCF": $avgWithout}
      }')
  done

  echo -e "${DIM}▸ Building featured skills array...${NC}"

  # Build featured skills array
  local featured_json="[]"
  for i in "${!FEATURED_SKILLS[@]}"; do
    featured_json=$(echo "$featured_json" | jq \
      --arg key "${FEATURED_SKILLS[$i]}" \
      --arg label "${FEATURED_LABELS[$i]}" \
      '. + [{"key": $key, "label": $label}]')
  done

  echo -e "${DIM}▸ Computing top delta across models...${NC}"

  # Compute top delta — find the skill with the best delta across models
  local top_delta="+0%"
  local top_delta_label=""
  local best_delta_num=""
  local has_data=false

  for model in "${ALL_MODELS[@]}"; do
    for i in "${!FEATURED_SKILLS[@]}"; do
      local skill="${FEATURED_SKILLS[$i]}"
      local skill_label="${FEATURED_LABELS[$i]}"
      local s_with s_without
      s_with=$(echo "$models_json" | jq -r ".\"$model\".skills.\"$skill\".withCF // 0")
      s_without=$(echo "$models_json" | jq -r ".\"$model\".skills.\"$skill\".withoutCF // 0")
      if (( $(awk "BEGIN { print ($s_with > 0 && $s_without > 0) }") )); then
        has_data=true
        local delta_num
        delta_num=$(awk "BEGIN { printf \"%.0f\", (($s_with - $s_without) / $s_without) * 100 }")
        if [[ -z "$best_delta_num" ]] || (( delta_num > best_delta_num )); then
          best_delta_num=$delta_num
          top_delta_label="$skill_label Quality"
        fi
      fi
    done
  done

  if [[ "$has_data" == true && -n "$best_delta_num" ]]; then
    if (( best_delta_num >= 0 )); then
      top_delta="+${best_delta_num}%"
    else
      top_delta="${best_delta_num}%"
    fi
  fi

  echo -e "${DIM}▸ Writing final JSON...${NC}"

  # Build final JSON
  jq -n \
    --arg date "$today" \
    --argjson models "$models_json" \
    --argjson featured "$featured_json" \
    --arg topDelta "$top_delta" \
    --arg topDeltaLabel "$top_delta_label" \
    '{
      "meta": {
        "lastUpdated": $date,
        "runsPerCondition": 3,
        "rubricScale": "0-3",
        "passThreshold": 2.0
      },
      "models": $models,
      "featuredSkills": $featured,
      "stats": {
        "skillCount": "19+",
        "agentCount": "6",
        "topDelta": $topDelta,
        "topDeltaLabel": $topDeltaLabel
      }
    }' > "$OUTPUT_FILE"

  echo ""
  echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✅ Generated:${NC} ${DIM}$OUTPUT_FILE${NC}"
  echo -e "  📏 Scoring: ${CYAN}LLM-as-judge (Haiku)${NC}"
  echo ""
  echo -e "${BOLD}📊 Summary:${NC}"
  for model in "${ALL_MODELS[@]}"; do
    local sessions avg_with avg_without
    sessions=$(echo "$models_json" | jq -r ".\"$model\".evalSessions")
    avg_with=$(echo "$models_json" | jq -r ".\"$model\".average.withCF")
    avg_without=$(echo "$models_json" | jq -r ".\"$model\".average.withoutCF")
    printf "  🤖 ${BOLD}%-8s${NC} sessions=${CYAN}%-4s${NC}  avg_with_cf=${GREEN}%-6s${NC}  avg_without_cf=${DIM}%-6s${NC}\n" "$model" "$sessions" "$avg_with" "$avg_without"
  done
}

build_json
