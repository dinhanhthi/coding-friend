#!/usr/bin/env bash
# run-wave.sh — Run a wave of evals across skills, repos, and conditions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WAVES_FILE="$SCRIPT_DIR/waves.json"
BENCHMARKS_DIR="$SCRIPT_DIR/benchmarks"

# Defaults
WAVE=""
RUNS=3
MODEL="sonnet"
SKILL_FILTER=""
DRY_RUN=false

usage() {
  cat <<'USAGE'
run-wave.sh — Run a wave of evals across skills, repos, and conditions

Usage:
  ./run-wave.sh --wave <1|2|all> [options]

Options:
  --wave <1|2|all>   Wave to run (required)
  --runs <N>         Number of runs per combination (default: 3)
  --model <model>    Model to use (default: sonnet)
  --skill <name>     Run only this skill from the wave
  --dry-run          Show what would be executed without running
  --help             Show this help message
USAGE
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wave)   WAVE="$2"; shift 2 ;;
    --runs)   RUNS="$2"; shift 2 ;;
    --model)  MODEL="$2"; shift 2 ;;
    --skill)  SKILL_FILTER="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help)   usage; exit 0 ;;
    *)        die "Unknown argument: $1" ;;
  esac
done

[[ -z "$WAVE" ]] && die "Missing required argument: --wave"
[[ ! -f "$WAVES_FILE" ]] && die "waves.json not found at $WAVES_FILE"

# Determine which wave keys to process
case "$WAVE" in
  1)   WAVE_KEYS=("wave1") ;;
  2)   WAVE_KEYS=("wave2") ;;
  all) WAVE_KEYS=("wave1" "wave2") ;;
  *)   die "Invalid wave: $WAVE (must be 1, 2, or all)" ;;
esac

# Collect all run combinations
COMBINATIONS=()
for wave_key in "${WAVE_KEYS[@]}"; do
  # Get skill names for this wave
  SKILLS=$(jq -r ".${wave_key}.skills | keys[]" "$WAVES_FILE")

  for skill in $SKILLS; do
    # Apply skill filter if set
    if [[ -n "$SKILL_FILTER" && "$skill" != "$SKILL_FILTER" ]]; then
      continue
    fi

    # Get repos for this skill
    REPOS=$(jq -r ".${wave_key}.skills[\"$skill\"].repos[]" "$WAVES_FILE")

    for repo in $REPOS; do
      REPO_PATH="$BENCHMARKS_DIR/$repo"
      PROMPT_FILE="$SCRIPT_DIR/prompts/${skill}/${repo}.md"

      for condition in with-cf without-cf; do
        for run_num in $(seq 1 "$RUNS"); do
          COMBINATIONS+=("$skill|$repo|$condition|$run_num|$REPO_PATH|$PROMPT_FILE")
        done
      done
    done
  done
done

TOTAL=${#COMBINATIONS[@]}

if [[ "$DRY_RUN" == true ]]; then
  echo "=== Dry Run: $TOTAL total runs ==="
  echo ""
  local_idx=0
  for combo in "${COMBINATIONS[@]}"; do
    IFS='|' read -r skill repo condition run_num repo_path prompt_file <<< "$combo"
    local_idx=$((local_idx + 1))
    echo "[$local_idx/$TOTAL] $skill $condition on $repo (run $run_num/$RUNS)"
  done
  echo ""
  echo "total=$TOTAL runs=$RUNS model=$MODEL"
  exit 0
fi

# Execute runs
echo "=== Running $TOTAL eval runs ==="
echo ""

IDX=0
ERRORS=0
for combo in "${COMBINATIONS[@]}"; do
  IFS='|' read -r skill repo condition run_num repo_path prompt_file <<< "$combo"
  IDX=$((IDX + 1))

  echo "[$IDX/$TOTAL] Running $skill $condition on $repo (run $run_num/$RUNS)..."

  # Check that repo and prompt exist
  if [[ ! -d "$repo_path" ]]; then
    echo "  SKIP: benchmark repo not found at $repo_path" >&2
    continue
  fi
  if [[ ! -f "$prompt_file" ]]; then
    echo "  SKIP: prompt file not found at $prompt_file" >&2
    continue
  fi

  # Build run-eval.sh command
  RUN_CMD=("$SCRIPT_DIR/run-eval.sh"
    --prompt "$prompt_file"
    --condition "$condition"
    --skill "$skill"
    --repo "$repo_path"
    --model "$MODEL"
  )

  if "${RUN_CMD[@]}"; then
    echo "  OK"
  else
    echo "  FAILED (continuing)" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "=== Complete: $((IDX - ERRORS))/$IDX succeeded, $ERRORS errors ==="
