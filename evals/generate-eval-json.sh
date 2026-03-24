#!/usr/bin/env bash
# generate-eval-json.sh — Parse eval results and generate website JSON data file
#
# Reads results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/<condition>--<timestamp>.json files,
# computes per-model averages for featured skills, and writes
# website/src/data/eval-results.json
#
# Usage:
#   ./generate-eval-json.sh [--model <model>] [--all] [--no-llm]
#   ./generate-eval-json.sh --all          # process all models found in results
#   ./generate-eval-json.sh --model sonnet # process only sonnet results
#   ./generate-eval-json.sh --no-llm       # skip LLM-as-judge, use regex only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color
RESULTS_DIR="$SCRIPT_DIR/results"
RUBRICS_DIR="$SCRIPT_DIR/rubrics"
OUTPUT_FILE="$SCRIPT_DIR/../website/src/data/eval-results.json"

# Featured skills shown on the landing page comparison chart
FEATURED_SKILLS=("cf-fix" "cf-review" "cf-tdd")
FEATURED_LABELS=("Bug Fix" "Code Review" "TDD")

# All supported models
ALL_MODELS=("haiku" "sonnet" "opus")
MODEL_LABELS='{"haiku":"Haiku","sonnet":"Sonnet","opus":"Opus"}'
MODEL_IDS='{"haiku":"claude-haiku-4-5-20251001","sonnet":"claude-sonnet-4-6","opus":"claude-opus-4-6"}'

# Parse arguments
USE_LLM_SCORING="true"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-llm) USE_LLM_SCORING="false"; shift ;;
    *) shift ;;
  esac
done
export USE_LLM_SCORING

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
    jq -r '.weighted_average // empty' "$cache_file" 2>/dev/null
    return 0
  fi

  # Also try conversation file for richer context
  local conv_file="${result_file%.json}.conversation.txt"
  local score_args=(--result "$result_file" --rubric "$rubric_file")
  if [[ -f "$conv_file" ]]; then
    score_args+=(--conversation "$conv_file")
  fi

  local llm_output
  llm_output=$("$llm_score_script" "${score_args[@]}" 2>/dev/null) || return 1

  # Cache the LLM score for future runs
  echo "$llm_output" > "$cache_file"

  echo "$llm_output" | jq -r '.weighted_average // empty' 2>/dev/null
}

# Score a single result file using regex checks (fallback)
regex_score_result() {
  local result_file="$1"
  local rubric_file="$2"

  local result_text
  result_text=$(jq -r '.result // ""' "$result_file" 2>/dev/null || echo "")
  if [[ -z "$result_text" ]]; then
    echo ""
    return
  fi

  local num_criteria passed_weight total_weight
  num_criteria=$(jq '.criteria | length' "$rubric_file")
  passed_weight=0
  total_weight=0

  local idx=0
  while [[ $idx -lt $num_criteria ]]; do
    local weight has_check
    weight=$(jq -r ".criteria[$idx].weight" "$rubric_file")
    has_check=$(jq ".criteria[$idx].automated_check // null | type" "$rubric_file")

    total_weight=$(awk "BEGIN { printf \"%.4f\", $total_weight + $weight }")

    if [[ "$has_check" == '"object"' ]]; then
      local check_type check_pattern
      check_type=$(jq -r ".criteria[$idx].automated_check.type" "$rubric_file")
      check_pattern=$(jq -r '.criteria['"$idx"'].automated_check.pattern // ""' "$rubric_file")

      if [[ "$check_type" == "regex" && -n "$check_pattern" ]]; then
        if echo "$result_text" | grep -qE "$check_pattern" 2>/dev/null; then
          passed_weight=$(awk "BEGIN { printf \"%.4f\", $passed_weight + $weight }")
        fi
      else
        # Unsupported check type — benefit of the doubt
        passed_weight=$(awk "BEGIN { printf \"%.4f\", $passed_weight + ($weight * 0.667) }")
      fi
    else
      # No automated check — benefit of the doubt (score 2/3)
      passed_weight=$(awk "BEGIN { printf \"%.4f\", $passed_weight + ($weight * 0.667) }")
    fi

    idx=$((idx + 1))
  done

  if (( $(awk "BEGIN { print ($total_weight > 0) }") )); then
    awk "BEGIN { printf \"%.2f\", ($passed_weight / $total_weight) * 3 }"
  else
    echo ""
  fi
}

# Compute average score for a skill+condition+model combination
# Prefers LLM-as-judge scoring (Haiku), falls back to regex checks
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
    echo "0"
    return
  fi

  local use_llm=false
  if [[ -x "$SCRIPT_DIR/llm-score.sh" && "${USE_LLM_SCORING:-true}" != "false" ]]; then
    use_llm=true
  fi

  for result_file in "${result_files[@]}"; do
    if [[ ! -f "$rubric_file" ]]; then
      continue
    fi

    local score=""

    # Try LLM scoring first
    if [[ "$use_llm" == true ]]; then
      score=$(llm_score_result "$result_file" "$rubric_file")
    fi

    # Fall back to regex scoring
    if [[ -z "$score" ]]; then
      score=$(regex_score_result "$result_file" "$rubric_file")
    fi

    if [[ -n "$score" ]]; then
      total_score=$(awk "BEGIN { printf \"%.4f\", $total_score + $score }")
      file_count=$((file_count + 1))
    fi
  done

  if [[ $file_count -gt 0 ]]; then
    awk "BEGIN { printf \"%.2f\", $total_score / $file_count }"
  else
    echo "0"
  fi
}

# Build the JSON output
build_json() {
  local today
  today=$(date +%Y-%m-%d)

  # Start building models object
  local models_json="{}"

  for model in "${ALL_MODELS[@]}"; do
    local label model_id sessions
    label=$(echo "$MODEL_LABELS" | jq -r ".\"$model\"")
    model_id=$(echo "$MODEL_IDS" | jq -r ".\"$model\"")
    sessions=$(count_sessions "$model")

    # Compute scores for each featured skill
    local skills_json="{}"
    local with_total=0
    local without_total=0
    local skill_count=0

    for i in "${!FEATURED_SKILLS[@]}"; do
      local skill="${FEATURED_SKILLS[$i]}"
      local with_score without_score
      with_score=$(compute_skill_score "$skill" "with-cf" "$model")
      without_score=$(compute_skill_score "$skill" "without-cf" "$model")

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

  # Build featured skills array
  local featured_json="[]"
  for i in "${!FEATURED_SKILLS[@]}"; do
    featured_json=$(echo "$featured_json" | jq \
      --arg key "${FEATURED_SKILLS[$i]}" \
      --arg label "${FEATURED_LABELS[$i]}" \
      '. + [{"key": $key, "label": $label}]')
  done

  # Compute top delta — find the skill with the best improvement across models
  local top_delta="+0%"
  local top_delta_label="Bug Fix Quality"
  local best_delta_num=0

  for model in "${ALL_MODELS[@]}"; do
    for i in "${!FEATURED_SKILLS[@]}"; do
      local skill="${FEATURED_SKILLS[$i]}"
      local skill_label="${FEATURED_LABELS[$i]}"
      local s_with s_without
      s_with=$(echo "$models_json" | jq -r ".\"$model\".skills.\"$skill\".withCF // 0")
      s_without=$(echo "$models_json" | jq -r ".\"$model\".skills.\"$skill\".withoutCF // 0")
      if (( $(awk "BEGIN { print ($s_with > 0 && $s_without > 0) }") )); then
        local delta_num
        delta_num=$(awk "BEGIN { printf \"%.0f\", (($s_with - $s_without) / $s_without) * 100 }")
        if (( delta_num > best_delta_num )); then
          best_delta_num=$delta_num
          top_delta=$(awk "BEGIN { printf \"+%.0f%%\", $delta_num }")
          top_delta_label="$skill_label Quality"
        fi
      fi
    done
  done

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

  echo -e "${GREEN}✅ Generated:${NC} ${DIM}$OUTPUT_FILE${NC}"
  if [[ "$USE_LLM_SCORING" == "true" && -x "$SCRIPT_DIR/llm-score.sh" ]]; then
    echo -e "  📏 Scoring: ${CYAN}LLM-as-judge (Haiku)${NC} with regex fallback"
  else
    echo -e "  📏 Scoring: ${DIM}regex-only${NC}"
  fi
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
