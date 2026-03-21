#!/usr/bin/env bash
# score.sh — Score eval results using rubric-defined automated checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUBRICS_DIR="$SCRIPT_DIR/rubrics"
RESULTS_DIR="$SCRIPT_DIR/results"
ANALYSIS_DIR="$SCRIPT_DIR/analysis"
WAVES_FILE="$SCRIPT_DIR/waves.json"

# Defaults
SKILL=""
WAVE=""

usage() {
  cat <<'USAGE'
score.sh — Score eval results using rubric-defined automated checks

Usage:
  ./score.sh --skill <name> [options]
  ./score.sh --wave <1|2|all> [options]

Options:
  --skill <name>           Score results for a specific skill
  --wave <1|2|all>         Score all skills in a wave
  --results-dir <path>     Override results directory (default: evals/results)
  --help                   Show this help message
USAGE
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill)       SKILL="$2"; shift 2 ;;
    --wave)        WAVE="$2"; shift 2 ;;
    --results-dir) RESULTS_DIR="$2"; shift 2 ;;
    --help)        usage; exit 0 ;;
    *)             die "Unknown argument: $1" ;;
  esac
done

# Validate
if [[ -z "$SKILL" && -z "$WAVE" ]]; then
  die "Must specify --skill or --wave"
fi

# Build list of skills to score
SKILLS_TO_SCORE=()
if [[ -n "$SKILL" ]]; then
  SKILLS_TO_SCORE+=("$SKILL")
elif [[ -n "$WAVE" ]]; then
  case "$WAVE" in
    1)   WAVE_KEYS=("wave1") ;;
    2)   WAVE_KEYS=("wave2") ;;
    all) WAVE_KEYS=("wave1" "wave2") ;;
    *)   die "Invalid wave: $WAVE" ;;
  esac
  for wave_key in "${WAVE_KEYS[@]}"; do
    while IFS= read -r s; do
      SKILLS_TO_SCORE+=("$s")
    done < <(jq -r ".${wave_key}.skills | keys[]" "$WAVES_FILE")
  done
fi

# Apply regex check to content, return 1 if matches, 0 if not
check_regex() {
  local pattern="$1"
  local content="$2"
  if echo "$content" | grep -qE "$pattern"; then
    echo "1"
  else
    echo "0"
  fi
}

# Score a single result file against a rubric
score_result() {
  local result_file="$1"
  local rubric_file="$2"
  local skill_name="$3"

  # Extract result content
  local result_text
  result_text=$(jq -r '.result // empty' "$result_file" 2>/dev/null || echo "")

  if [[ -z "$result_text" ]]; then
    echo "{\"file\": \"$result_file\", \"error\": \"no result field\", \"checks\": []}"
    return
  fi

  # Get criteria with automated checks
  local num_criteria
  num_criteria=$(jq '.criteria | length' "$rubric_file")

  local checks="[]"
  local idx=0
  while [[ $idx -lt $num_criteria ]]; do
    local crit_name crit_weight has_auto_check
    crit_name=$(jq -r ".criteria[$idx].name" "$rubric_file")
    crit_weight=$(jq -r ".criteria[$idx].weight" "$rubric_file")
    has_auto_check=$(jq ".criteria[$idx].automated_check // null | type" "$rubric_file")

    if [[ "$has_auto_check" == '"object"' ]]; then
      local check_type check_pattern check_target
      check_type=$(jq -r ".criteria[$idx].automated_check.type" "$rubric_file")
      check_pattern=$(jq -r ".criteria[$idx].automated_check.pattern" "$rubric_file")
      check_target=$(jq -r ".criteria[$idx].automated_check.target" "$rubric_file")

      local passed=0
      if [[ "$check_type" == "regex" ]]; then
        # Determine what content to check against
        local target_content="$result_text"
        passed=$(check_regex "$check_pattern" "$target_content")
      fi

      checks=$(echo "$checks" | jq \
        --arg name "$crit_name" \
        --arg weight "$crit_weight" \
        --arg type "$check_type" \
        --arg pattern "$check_pattern" \
        --argjson passed "$passed" \
        '. + [{"name": $name, "weight": ($weight | tonumber), "type": $type, "pattern": $pattern, "passed": ($passed == 1)}]')
    fi

    idx=$((idx + 1))
  done

  # Count passes
  local total_checks passed_checks
  total_checks=$(echo "$checks" | jq 'length')
  passed_checks=$(echo "$checks" | jq '[.[] | select(.passed == true)] | length')

  jq -n \
    --arg file "$(basename "$result_file")" \
    --argjson checks "$checks" \
    --argjson total "$total_checks" \
    --argjson passed "$passed_checks" \
    '{file: $file, total_checks: $total, passed_checks: $passed, checks: $checks}'
}

# Print summary table header
print_header() {
  printf "%-15s %-12s %-8s %-8s %-15s %s\n" "SKILL" "CONDITION" "FILES" "CHECKS" "PASS_RATE" "STATUS"
  printf "%-15s %-12s %-8s %-8s %-15s %s\n" "-----" "---------" "-----" "------" "---------" "------"
}

# Process each skill
score_all() {
  print_header

  for skill in "${SKILLS_TO_SCORE[@]}"; do
    local rubric_file="$RUBRICS_DIR/${skill}.json"
    if [[ ! -f "$rubric_file" ]]; then
      echo "WARN: No rubric found for $skill" >&2
      continue
    fi

    # Process each condition
    for condition in with-cf without-cf; do
      local condition_dir="$RESULTS_DIR/$skill/$condition"
      if [[ ! -d "$condition_dir" ]]; then
        continue
      fi

      local result_files=()
      while IFS= read -r f; do
        # Skip meta files
        [[ "$f" == *.meta.json ]] && continue
        result_files+=("$f")
      done < <(find "$condition_dir" -name '*.json' -type f 2>/dev/null | sort)

      if [[ ${#result_files[@]} -eq 0 ]]; then
        continue
      fi

      local all_scores="[]"
      local total_passed=0
      local total_checks=0

      for result_file in "${result_files[@]}"; do
        local score_json
        score_json=$(score_result "$result_file" "$rubric_file" "$skill")
        all_scores=$(echo "$all_scores" | jq --argjson s "$score_json" '. + [$s]')

        local fp ft
        fp=$(echo "$score_json" | jq '.passed_checks')
        ft=$(echo "$score_json" | jq '.total_checks')
        total_passed=$((total_passed + fp))
        total_checks=$((total_checks + ft))
      done

      # Calculate pass rate
      local pass_rate="N/A"
      local status="--"
      if [[ $total_checks -gt 0 ]]; then
        pass_rate=$(awk "BEGIN { printf \"%.0f%%\", ($total_passed / $total_checks) * 100 }")
        if [[ $total_passed -eq $total_checks ]]; then
          status="PASS"
        else
          status="PARTIAL"
        fi
      fi

      printf "%-15s %-12s %-8s %-8s %-15s %s\n" \
        "$skill" "$condition" "${#result_files[@]}" "$total_checks" "$pass_rate" "$status"

      # Write scores to analysis dir
      mkdir -p "$ANALYSIS_DIR"
      local scores_file="$ANALYSIS_DIR/${skill}-${condition}-scores.json"
      echo "$all_scores" | jq '.' > "$scores_file"
    done
  done
}

score_all
