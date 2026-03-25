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
#   ./generate-eval-json.sh                              # Score all models, all waves
#   ./generate-eval-json.sh --model sonnet               # Score only Sonnet
#   ./generate-eval-json.sh --model sonnet --no-budget   # Sonnet, no API budget limit
#   ./generate-eval-json.sh --wave 2                     # Score only wave 2 skills, merge into existing JSON
#   ./generate-eval-json.sh --model sonnet --wave 2      # Sonnet + wave 2 only
#   ./generate-eval-json.sh --wave 1 --wave 3            # Score waves 1 and 3

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
WAVES_FILE="$SCRIPT_DIR/waves.json"
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
SELECTED_WAVES=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-budget) NO_BUDGET=true; shift ;;
    --model) SELECTED_MODELS+=("$2"); shift 2 ;;
    --wave) SELECTED_WAVES+=("$2"); shift 2 ;;
    --help|-h) echo "Usage: ./generate-eval-json.sh [--no-budget] [--model <name>]... [--wave <N>]..."; exit 0 ;;
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

# Validate wave numbers
for w in "${SELECTED_WAVES[@]}"; do
  if ! [[ "$w" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}❌ Wave must be an integer: $w${NC}" >&2
    exit 1
  fi
  if ! jq -e ".wave${w}" "$WAVES_FILE" >/dev/null 2>&1; then
    echo -e "${RED}❌ Unknown wave: $w (check $WAVES_FILE)${NC}" >&2
    exit 1
  fi
done

# Build ALL_SKILLS and ALL_SKILL_LABELS from waves.json (for detailedResults)
# These include every skill across all waves, not just featured ones
ALL_SKILLS=()
ALL_SKILL_LABELS=()
WAVE_NUMBERS=()
while IFS= read -r wn; do
  WAVE_NUMBERS+=("$wn")
done < <(jq -r 'keys[] | select(startswith("wave")) | ltrimstr("wave")' "$WAVES_FILE" 2>/dev/null | sort -n)

for wn in "${WAVE_NUMBERS[@]}"; do
  while IFS= read -r skill_name; do
    [[ -z "$skill_name" ]] && continue
    # Skip if already added (skill could appear in multiple waves)
    local_found=false
    for existing in "${ALL_SKILLS[@]+"${ALL_SKILLS[@]}"}"; do
      [[ "$existing" == "$skill_name" ]] && local_found=true && break
    done
    "$local_found" && continue
    ALL_SKILLS+=("$skill_name")
    # Generate label: cf-fix → Fix, cf-auto-review → Auto Review
    ALL_SKILL_LABELS+=("$(echo "$skill_name" | sed 's/^cf-//' | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')")
  done < <(jq -r ".wave${wn}.skills | keys[]" "$WAVES_FILE" 2>/dev/null)
done

die() {
  echo -e "${RED}❌ ERROR: $1${NC}" >&2
  exit 1
}

# Get the rubric file for a specific result file, supporting per-repo overrides.
# Looks for <skill>--<repo>.json first, falls back to <skill>.json.
get_rubric_for_file() {
  local skill="$1"
  local result_file="$2"
  local repo_name
  repo_name=$(basename "$(dirname "$result_file")")

  local specific="$RUBRICS_DIR/${skill}--${repo_name}.json"
  if [[ -f "$specific" ]]; then
    echo "$specific"
  else
    echo "$RUBRICS_DIR/${skill}.json"
  fi
}

# Check if a skill belongs to any of the selected waves (or all if no filter)
skill_in_selected_waves() {
  local skill="$1"
  # No wave filter → include all skills
  if [[ ${#SELECTED_WAVES[@]} -eq 0 ]]; then
    return 0
  fi
  for w in "${SELECTED_WAVES[@]}"; do
    if jq -e ".wave${w}.skills.\"${skill}\"" "$WAVES_FILE" >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
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
    # Use per-repo rubric when available (e.g., cf-security--bench-cli.json)
    local rubric_file
    rubric_file=$(get_rubric_for_file "$skill" "$result_file")

    if [[ ! -f "$rubric_file" ]]; then
      echo -e "      ${YELLOW}⚠ No rubric file: ${DIM}${rubric_file}${NC}" >&2
      continue
    fi

    local basename
    basename=$(basename "$result_file")
    local score=""

    # Skip error results (e.g., aborted executions) — they have no .result to score
    local result_subtype
    result_subtype=$(jq -r '.subtype // ""' "$result_file" 2>/dev/null || echo "")
    if [[ "$result_subtype" == error_* ]]; then
      echo -e "      ⏭ ${DIM}${basename}${NC} → ${YELLOW}skipped${NC} ${DIM}(${result_subtype})${NC}" >&2
      continue
    fi

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

      # Skip if wave filter is active and skill is not in selected waves
      if ! skill_in_selected_waves "$skill"; then
        echo -e "  ${DIM}▸ [$skill_num/$total_skills] ${skill} (${skill_label}) — skipped (not in wave ${SELECTED_WAVES[*]})${NC}"
        continue
      fi

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

  echo -e "${DIM}▸ Building detailed results (per-skill/per-repo/per-criteria)...${NC}"

  # Build detailedResults from cached .llm-score.json files and rubric metadata
  # Uses ALL_SKILLS (from waves.json) — not just FEATURED_SKILLS
  local detailed_json="{}"

  for model in "${ALL_MODELS[@]}"; do
    for i in "${!ALL_SKILLS[@]}"; do
      local skill="${ALL_SKILLS[$i]}"
      local skill_label="${ALL_SKILL_LABELS[$i]}"
      local rubric_file="$RUBRICS_DIR/${skill}.json"

      # Skip if wave filter is active and skill is not in selected waves
      if ! skill_in_selected_waves "$skill"; then
        continue
      fi

      # Determine wave number from waves.json
      local wave_num=0
      if [[ -f "$WAVES_FILE" ]]; then
        for wn in "${WAVE_NUMBERS[@]}"; do
          if jq -e ".wave${wn}.skills.\"${skill}\"" "$WAVES_FILE" >/dev/null 2>&1; then
            wave_num=$wn
            break
          fi
        done
      fi

      # Build criteria metadata from rubric — capitalize first letter of each word
      local criteria_meta="{}"
      if [[ -f "$rubric_file" ]]; then
        criteria_meta=$(jq '[.criteria[] | {
          (.name): {
            weight: .weight,
            label: (.name | split("_") | map(( .[0:1] | ascii_upcase ) + .[1:]) | join(" "))
          }
        }] | add // {}' "$rubric_file")
      fi

      # Find all repos for this skill+model
      local repos=()
      while IFS= read -r repo_dir; do
        [[ -z "$repo_dir" ]] && continue
        repos+=("$(basename "$repo_dir")")
      done < <(find "$RESULTS_DIR" -path "*/$model/*/$skill/*" -name "*.llm-score.json" -type f 2>/dev/null \
        | sed 's|/[^/]*$||' | sort -u)

      if [[ ${#repos[@]} -eq 0 ]]; then
        continue
      fi

      # Build per-repo data and per-repo criteria overrides
      local repos_json="{}"
      local repo_criteria_json="{}"
      for repo in "${repos[@]}"; do
        # Check for repo-specific rubric (e.g., cf-security--bench-cli.json)
        local repo_rubric="$RUBRICS_DIR/${skill}--${repo}.json"
        if [[ -f "$repo_rubric" ]]; then
          local rc_meta
          rc_meta=$(jq '[.criteria[] | {
            (.name): {
              weight: .weight,
              label: (.name | split("_") | map(( .[0:1] | ascii_upcase ) + .[1:]) | join(" "))
            }
          }] | add // {}' "$repo_rubric")
          repo_criteria_json=$(echo "$repo_criteria_json" | jq \
            --arg repo "$repo" \
            --argjson criteria "$rc_meta" \
            '.[$repo] = $criteria')
        fi

        for condition in "with-cf" "without-cf"; do
          local cond_key
          if [[ "$condition" == "with-cf" ]]; then cond_key="withCF"; else cond_key="withoutCF"; fi

          local score_files=()
          while IFS= read -r sf; do
            [[ -z "$sf" ]] && continue
            score_files+=("$sf")
          done < <(find "$RESULTS_DIR" -path "*/$model/*/$skill/$repo/${condition}--*.llm-score.json" -type f 2>/dev/null | sort)

          if [[ ${#score_files[@]} -eq 0 ]]; then continue; fi

          local total_avg=0
          local criteria_totals="{}"
          local run_count=0

          for sf in "${score_files[@]}"; do
            local wavg
            wavg=$(jq -r '.weighted_average // 0' "$sf")
            total_avg=$(awk "BEGIN { printf \"%.4f\", $total_avg + $wavg }")

            local per_criteria
            per_criteria=$(jq '[.scores[] | {(.name): .score}] | add // {}' "$sf")

            # Full outer merge to handle new keys
            if [[ "$criteria_totals" == "{}" ]]; then
              criteria_totals="$per_criteria"
            else
              criteria_totals=$(echo "$criteria_totals" | jq --argjson new "$per_criteria" '
                . as $old | ($old + $new) | to_entries | map(
                  .key as $k | .value = (($old[$k] // 0) + ($new[$k] // 0))
                ) | from_entries')
            fi

            run_count=$((run_count + 1))
          done

          local avg_score=0
          if [[ $run_count -gt 0 ]]; then
            avg_score=$(awk "BEGIN { printf \"%.2f\", $total_avg / $run_count }")
            criteria_totals=$(echo "$criteria_totals" | jq --argjson n "$run_count" '
              to_entries | map(.value = ((.value / $n) * 100 | round) / 100) | from_entries')
          fi

          repos_json=$(echo "$repos_json" | jq \
            --arg repo "$repo" \
            --arg cond "$cond_key" \
            --argjson avg "$avg_score" \
            --argjson runs "$run_count" \
            --argjson criteria "$criteria_totals" \
            '.[$repo][$cond] = {"avgScore": $avg, "runCount": $runs, "criteria": $criteria}')
        done
      done

      detailed_json=$(echo "$detailed_json" | jq \
        --arg model "$model" \
        --arg skill "$skill" \
        --argjson wave "$wave_num" \
        --arg label "$skill_label" \
        --argjson criteria "$criteria_meta" \
        --argjson repoCriteria "$repo_criteria_json" \
        --argjson repos "$repos_json" \
        '.[$model][$skill] = {"wave": $wave, "label": $label, "criteria": $criteria, "repoCriteria": $repoCriteria, "repos": $repos}')
    done
  done

  echo -e "${DIM}▸ Writing final JSON...${NC}"

  # Build new JSON
  local new_json
  new_json=$(jq -n \
    --arg date "$today" \
    --argjson models "$models_json" \
    --argjson featured "$featured_json" \
    --arg topDelta "$top_delta" \
    --arg topDeltaLabel "$top_delta_label" \
    --argjson detailed "$detailed_json" \
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
      },
      "detailedResults": $detailed
    }')

  # When --wave filter is active, merge only detailedResults into existing output file
  # This preserves models, featuredSkills, stats from previous runs
  if [[ ${#SELECTED_WAVES[@]} -gt 0 && -f "$OUTPUT_FILE" ]]; then
    local existing_json
    existing_json=$(cat "$OUTPUT_FILE")
    # Only merge detailedResults (additive per-skill keys) and update timestamp
    jq -n --argjson existing "$existing_json" --argjson new "$new_json" \
      '$existing | .detailedResults *= $new.detailedResults | .meta.lastUpdated = $new.meta.lastUpdated' \
      > "$OUTPUT_FILE"
  else
    echo "$new_json" > "$OUTPUT_FILE"
  fi

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
